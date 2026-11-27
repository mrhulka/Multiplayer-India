// Game rules and room state, shared by the Node server (server.js) and the Cloudflare Worker (worker/index.js).
const randInt = n => crypto.getRandomValues(new Uint32Array(1))[0] % n; // Web Crypto: same in Node and Workers
const Q = require('./questions');
// photos are served by the game itself (photos/<slug>.jpg); questions.js keeps the Wikimedia source URL
const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const photo = q => q?.img ? `/photos/${slug(q.name)}.jpg` : undefined;
const ROUNDS = 8, MIN_ROUNDS = 3, MAX_ROUNDS = 20, EXACT_BONUS = 200, MIN_R = 25, MAX_R = 1000;
// per game: seconds to answer, seconds the results stay up before the next question
const CFG = { map: { ask: 25000, reveal: 10000 }, num: { ask: 25000, reveal: 3000 }, face: { ask: 25000, reveal: 6000 }, dahi: { ask: 30000, reveal: 8000 } };
const rooms = {};
// No-repeat: remember every question asked (across rooms and restarts) and only deal unseen ones until the bank runs out.
// ponytail: one history per server, which suits a household; key it per room or group if many groups share a server
let seen = {}, saveSeen = () => {};
const useSeen = (s, save) => { seen = s || {}; saveSeen = save; }; // the host (Node file / Durable Object storage) plugs persistence in
const keyOf = (game, q) => q.name ?? q[0];
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = randInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
function deal(game, n = ROUNDS) {
  const used = new Set(seen[game] ||= []);
  let fresh = Q[game].filter(q => !used.has(keyOf(game, q)));
  if (fresh.length < n) { seen[game] = []; fresh = [...Q[game]]; } // bank exhausted: start a new cycle
  return shuffle(fresh).slice(0, n);
}
const markSeen = (game, q) => { seen[game].push(keyOf(game, q)); saveSeen(seen); }; // ponytail: in-memory rooms, lost on restart; add a store if games must survive deploys

const km = (a, b) => { // haversine
  const r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
// closest 1000, farthest 100, linear in between by rank; ties share
function rankPoints(errs) {
  const d = [...new Set(Object.values(errs))].sort((a, b) => a - b);
  return Object.fromEntries(Object.entries(errs).map(([id, e]) => [id, d.length < 2 ? 1000 : Math.round(1000 - 900 * d.indexOf(e) / (d.length - 1))]));
}
// circle mode: answer inside your circle scores 1000 - radius(km), min 100; outside scores 0
const circlePoints = (dist, radius) => dist <= radius ? Math.max(100, Math.round(1000 - radius)) : 0;
// Pehchaan Kaun: typed names. Case, spaces and punctuation don't matter. Exact spelling = 1000;
// otherwise points fall with the share of letters you'd have to fix (edit distance / length), reaching 0 at half wrong.
const norm = t => String(t).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
function edits(a, b) { // Levenshtein distance
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { const cur = [i]; for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[b.length];
}
// Dimaag Ka Dahi: right answer scores 1000 if instant, sliding to 500 at the buzzer; wrong scores 0
const quizPoints = (right, ms, askMs) => right ? Math.round(500 + 500 * Math.max(0, 1 - ms / askMs)) : 0;
function spellPoints(typed, answers) {
  const t = norm(typed); if (!t) return { points: 0, exact: false };
  const best = Math.min(...answers.map(a => edits(t, norm(a)) / Math.max(t.length, norm(a).length)));
  return { points: best === 0 ? 1000 : Math.max(0, Math.round(800 * (1 - best * 2))), exact: best === 0 };
}

const cfg = r => CFG[r.game] || CFG.map;
const pub = r => ({ code: r.code, play: r.play, host: r.host, secs: cfg(r).ask / 1000, phase: r.phase, game: r.game, mode: r.mode, round: r.round, total: r.rounds || ROUNDS, endsAt: r.endsAt,
  prompt: r.q && (r.game === 'face' ? r.q[1] : r.q.name ?? r.q[0]), options: r.game === 'dahi' && r.phase === 'question' ? r.opts : undefined,
  img: photo(r.q), photoOnly: !!(r.q?.wiki && r.q?.img), next: r.phase === 'reveal' ? photo(r.deck?.[r.round]) : undefined, unit: r.game === 'num' ? r.q?.[2] : undefined,
  players: Object.entries(r.players).map(([id, p]) => ({ id, name: p.name, score: p.score, answered: id in r.answers })),
  reveal: r.reveal });
const send = r => { const d = `data: ${JSON.stringify(pub(r))}\n\n`; r.clients.forEach(c => c.write(d)); };

function ask(r) {
  if (r.round >= r.rounds) { r.phase = 'final'; r.q = null; return send(r); }
  r.q = r.deck[r.round++]; markSeen(r.game, r.q); r.answers = {}; r.reveal = null; r.phase = 'question'; r.askedAt = Date.now(); r.endsAt = r.askedAt + cfg(r).ask;
  r.mode = r.game === 'map' && r.round % 2 === 0 ? 'circle' : 'pin'; // alternate pin / circle rounds
  if (r.game === 'dahi') r.opts = shuffle([r.q[1], ...r.q[2]]);
  clearTimeout(r.timer); r.timer = setTimeout(() => reveal(r), cfg(r).ask); send(r);
}
function reveal(r) {
  clearTimeout(r.timer);
  const game = r.game, ids = Object.keys(r.answers);
  let pts, errs = {}, ans, extra = {};
  if (game === 'dahi') {
    const right = r.opts.indexOf(r.q[1]); ans = r.q[1];
    pts = Object.fromEntries(ids.map(id => [id, quizPoints(r.answers[id].pick === right, r.answers[id].ms, cfg(r).ask)]));
    extra = { options: r.opts, right, picks: r.opts.map((_, i) => ids.filter(id => r.answers[id].pick === i).map(id => r.players[id].name)) };
  } else if (game === 'face') {
    ans = r.q[0];
    const sp = Object.fromEntries(ids.map(id => [id, spellPoints(r.answers[id].text, [r.q[0], ...(r.q[2] || [])])]));
    pts = Object.fromEntries(ids.map(id => [id, sp[id].points])); extra = { clue: r.q[1], exactIds: ids.filter(id => sp[id].exact) };
  } else {
    const map = game === 'map'; ans = map ? { lat: r.q.lat, lng: r.q.lng } : r.q[1];
    errs = Object.fromEntries(ids.map(id => [id, map ? Math.round(km(r.answers[id], ans)) : Math.abs(r.answers[id] - ans)]));
    pts = r.mode === 'circle' ? Object.fromEntries(ids.map(id => [id, circlePoints(errs[id], r.answers[id].radius)])) : rankPoints(errs);
    if (!map) for (const id of ids) if (errs[id] === 0) pts[id] += EXACT_BONUS;
  }
  for (const id in pts) r.players[id].score += pts[id];
  r.reveal = { answer: ans, unit: game === 'map' ? 'km' : game === 'num' ? r.q[2] : undefined, img: photo(r.q), name: game === 'map' ? r.q.name : game === 'face' ? r.q[0] : undefined,
    fact: game === 'face' ? extra.clue : game === 'dahi' ? r.q[3] : r.q.fact, options: extra.options, right: extra.right, picks: extra.picks,
    results: ids.map(id => ({ id, name: r.players[id].name, points: pts[id], err: errs[id],
      guess: game === 'face' ? r.answers[id].text : game === 'dahi' ? r.opts[r.answers[id].pick] : r.answers[id], ms: r.answers[id].ms,
      exact: game === 'num' ? errs[id] === 0 : game === 'face' ? extra.exactIds.includes(id) : game === 'dahi' ? r.answers[id].pick === extra.right : false })).sort((a, b) => b.points - a.points) };
  r.phase = 'reveal'; send(r); r.timer = setTimeout(() => ask(r), cfg(r).reveal);
}

const host = (r, b) => { if (b.token !== r.token) throw 'not host'; };
const api = {
  // play 'tv': this device is the big screen; 'online': no shared screen, the host plays from their own device too
  room(_, b) { let code; do code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[randInt(24)]).join(''); while (rooms[code]);
    const r = rooms[code] = { code, play: b.play === 'online' ? 'online' : 'tv', host: String(b.name || '').trim().slice(0, 16), token: crypto.randomUUID(), phase: 'lobby', players: {}, answers: {}, clients: new Set(), round: 0 };
    return { code, token: r.token, play: r.play, ...(r.play === 'online' ? api.join(r, b) : {}) }; },
  join(r, b) { const name = String(b.name || '').trim().slice(0, 16); if (!name) throw 'name required';
    const id = crypto.randomUUID(), secret = crypto.randomUUID(); r.players[id] = { name, score: 0, secret }; send(r); return { id, secret }; },
  start(r, b) { host(r, b); if (!Object.hasOwn(CFG, b.game)) throw 'bad game';
    r.rounds = Math.min(MAX_ROUNDS, Math.max(MIN_ROUNDS, Math.round(+b.rounds) || ROUNDS));
    r.game = b.game; r.round = 0; r.deck = deal(b.game, r.rounds);
    for (const p of Object.values(r.players)) p.score = 0; ask(r); return {}; },
  lobby(r, b) { host(r, b); clearTimeout(r.timer); Object.assign(r, { phase: 'lobby', q: null, reveal: null, answers: {}, round: 0 }); send(r); return {}; },
  answer(r, b) { if (r.phase !== 'question' || r.players[b.id]?.secret !== b.secret) throw 'not now';
    let g;
    if (r.game === 'dahi') { const pick = +b.guess; if (!Number.isInteger(pick) || pick < 0 || pick >= r.opts.length) throw 'bad guess'; g = { pick, ms: Date.now() - r.askedAt }; }
    else if (r.game === 'face') { const text = String(b.guess ?? '').trim().slice(0, 60); if (!norm(text)) throw 'bad guess'; g = { text }; }
    else {
      g = r.game === 'map' ? { lat: +b.guess?.lat, lng: +b.guess?.lng } : +b.guess;
      if (r.mode === 'circle') g.radius = Math.min(MAX_R, Math.max(MIN_R, +b.guess?.radius));
      if (!(r.game === 'map' ? Object.values(g) : [g]).every(Number.isFinite)) throw 'bad guess';
    }
    r.answers[b.id] = g; if (Object.keys(r.answers).length === Object.keys(r.players).length) reveal(r); else send(r); return {}; },
};

const getRoom = code => rooms[String(code || '').toUpperCase()];
const snapshot = r => `data: ${JSON.stringify(pub(r))}\n\n`;
// run an API call by name; throws a string on bad input
function call(name, b) {
  const fn = Object.hasOwn(api, name) && api[name], r = getRoom(b.room);
  if (!fn) throw 'unknown';
  if (fn !== api.room && !r) throw 'no room';
  return fn(r, b);
}
// keep idle SSE connections alive through proxies
const ping = () => Object.values(rooms).forEach(r => r.clients.forEach(c => c.write(': ping\n\n')));

module.exports = { quizPoints, spellPoints, slug, call, getRoom, snapshot, ping, useSeen, km, rankPoints, circlePoints, deal, markSeen, ROUNDS };
