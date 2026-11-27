// Game rules and room state, shared by the Node server (server.js) and the Cloudflare Worker (worker/index.js).
const randInt = n => crypto.getRandomValues(new Uint32Array(1))[0] % n; // Web Crypto: same in Node and Workers
const Q = require('./questions');
// photos are served by the game itself (photos/<slug>.jpg); questions.js keeps the Wikimedia source URL
const slug = n => n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const photo = q => q?.img ? `/photos/${slug(q.name)}.jpg` : undefined;
const ROUNDS = 8, ASK_MS = 25000, REVEAL_MS = 10000, EXACT_BONUS = 200, MIN_R = 25, MAX_R = 1000;
const rooms = {};
// No-repeat: remember every question asked (across rooms and restarts) and only deal unseen ones until the bank runs out.
// ponytail: one history per server, which suits a household; key it per room or group if many groups share a server
let seen = {}, saveSeen = () => {};
const useSeen = (s, save) => { seen = s || {}; saveSeen = save; }; // the host (Node file / Durable Object storage) plugs persistence in
const keyOf = (game, q) => game === 'map' ? q.name : q[0];
function deal(game) {
  const used = new Set(seen[game] ||= []);
  let fresh = Q[game].filter(q => !used.has(keyOf(game, q)));
  if (fresh.length < ROUNDS) { seen[game] = []; fresh = [...Q[game]]; } // bank exhausted: start a new cycle
  for (let i = fresh.length - 1; i > 0; i--) { const j = randInt(i + 1); [fresh[i], fresh[j]] = [fresh[j], fresh[i]]; }
  return fresh.slice(0, ROUNDS);
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

const pub = r => ({ code: r.code, play: r.play, host: r.host, secs: ASK_MS / 1000, phase: r.phase, game: r.game, mode: r.mode, round: r.round, total: ROUNDS, endsAt: r.endsAt,
  prompt: r.q && (r.game === 'map' ? r.q.name : r.q[0]), img: photo(r.q), photoOnly: !!(r.q?.wiki && r.q?.img), next: r.phase === 'reveal' ? photo(r.deck?.[r.round]) : undefined, unit: r.game === 'num' ? r.q?.[2] : undefined,
  players: Object.entries(r.players).map(([id, p]) => ({ id, name: p.name, score: p.score, answered: id in r.answers })),
  reveal: r.reveal });
const send = r => { const d = `data: ${JSON.stringify(pub(r))}\n\n`; r.clients.forEach(c => c.write(d)); };

function ask(r) {
  if (r.round >= ROUNDS) { r.phase = 'final'; r.q = null; return send(r); }
  r.q = r.deck[r.round++]; markSeen(r.game, r.q); r.answers = {}; r.reveal = null; r.phase = 'question'; r.endsAt = Date.now() + ASK_MS;
  r.mode = r.game === 'map' && r.round % 2 === 0 ? 'circle' : 'pin'; // alternate pin / circle rounds
  clearTimeout(r.timer); r.timer = setTimeout(() => reveal(r), ASK_MS); send(r);
}
function reveal(r) {
  clearTimeout(r.timer);
  const map = r.game === 'map', ans = map ? { lat: r.q.lat, lng: r.q.lng } : r.q[1];
  const errs = Object.fromEntries(Object.entries(r.answers).map(([id, g]) => [id, map ? Math.round(km(g, ans)) : Math.abs(g - ans)]));
  const pts = r.mode === 'circle'
    ? Object.fromEntries(Object.entries(errs).map(([id, e]) => [id, circlePoints(e, r.answers[id].radius)]))
    : rankPoints(errs);
  if (!map) for (const id in errs) if (errs[id] === 0) pts[id] += EXACT_BONUS;
  for (const id in pts) r.players[id].score += pts[id];
  r.reveal = { answer: ans, unit: map ? 'km' : r.q[2], fact: r.q.fact, img: photo(r.q), name: map ? r.q.name : undefined,
    results: Object.keys(pts).map(id => ({ id, name: r.players[id].name, guess: r.answers[id], err: errs[id], points: pts[id], exact: !map && errs[id] === 0 })).sort((a, b) => b.points - a.points) };
  r.phase = 'reveal'; send(r); r.timer = setTimeout(() => ask(r), REVEAL_MS);
}

const host = (r, b) => { if (b.token !== r.token) throw 'not host'; };
const api = {
  // play 'tv': this device is the big screen; 'online': no shared screen, the host plays from their own device too
  room(_, b) { let code; do code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[randInt(24)]).join(''); while (rooms[code]);
    const r = rooms[code] = { code, play: b.play === 'online' ? 'online' : 'tv', host: String(b.name || '').trim().slice(0, 16), token: crypto.randomUUID(), phase: 'lobby', players: {}, answers: {}, clients: new Set(), round: 0 };
    return { code, token: r.token, play: r.play, ...(r.play === 'online' ? api.join(r, b) : {}) }; },
  join(r, b) { const name = String(b.name || '').trim().slice(0, 16); if (!name) throw 'name required';
    const id = crypto.randomUUID(), secret = crypto.randomUUID(); r.players[id] = { name, score: 0, secret }; send(r); return { id, secret }; },
  start(r, b) { host(r, b); if (!Q[b.game]) throw 'bad game';
    r.game = b.game; r.round = 0; r.deck = deal(b.game);
    for (const p of Object.values(r.players)) p.score = 0; ask(r); return {}; },
  lobby(r, b) { host(r, b); clearTimeout(r.timer); Object.assign(r, { phase: 'lobby', q: null, reveal: null, answers: {}, round: 0 }); send(r); return {}; },
  answer(r, b) { if (r.phase !== 'question' || r.players[b.id]?.secret !== b.secret) throw 'not now';
    const g = r.game === 'map' ? { lat: +b.guess?.lat, lng: +b.guess?.lng } : +b.guess;
    if (r.mode === 'circle') g.radius = Math.min(MAX_R, Math.max(MIN_R, +b.guess?.radius));
    if (!(r.game === 'map' ? Object.values(g) : [g]).every(Number.isFinite)) throw 'bad guess';
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

module.exports = { slug, call, getRoom, snapshot, ping, useSeen, km, rankPoints, circlePoints, deal, markSeen, ROUNDS };
