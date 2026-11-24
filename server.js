const http = require('http'), fs = require('fs'), path = require('path'), crypto = require('crypto'), os = require('os');
const Q = require('./questions');
const ROUNDS = 5, ASK_MS = 25000, REVEAL_MS = 8000, POINTS = [1000, 750, 500];
const rooms = {}; // ponytail: in-memory rooms, lost on restart; add a store if games must survive deploys

const km = (a, b) => { // haversine
  const r = x => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
// rank by error: 1st 1000, 2nd 750, 3rd 500, rest 250; ties share a rank
function score(errs) {
  const sorted = [...new Set(Object.values(errs))].sort((a, b) => a - b);
  return Object.fromEntries(Object.entries(errs).map(([id, e]) => [id, POINTS[sorted.indexOf(e)] ?? 250]));
}

const pub = r => ({ code: r.code, phase: r.phase, game: r.game, round: r.round, total: ROUNDS, endsAt: r.endsAt,
  prompt: r.q?.[0], unit: r.game === 'num' ? r.q?.[2] : undefined,
  players: Object.entries(r.players).map(([id, p]) => ({ id, name: p.name, score: p.score, answered: id in r.answers })),
  reveal: r.reveal });
const send = r => { const d = `data: ${JSON.stringify(pub(r))}\n\n`; r.clients.forEach(c => c.write(d)); };

function ask(r) {
  if (r.round >= ROUNDS) { r.phase = 'final'; r.q = null; return send(r); }
  r.q = r.deck[r.round++]; r.answers = {}; r.reveal = null; r.phase = 'question'; r.endsAt = Date.now() + ASK_MS;
  clearTimeout(r.timer); r.timer = setTimeout(() => reveal(r), ASK_MS); send(r);
}
function reveal(r) {
  clearTimeout(r.timer);
  const ans = r.game === 'map' ? { lat: r.q[1], lng: r.q[2] } : r.q[1];
  const errs = Object.fromEntries(Object.entries(r.answers).map(([id, g]) => [id, r.game === 'map' ? Math.round(km(g, ans)) : Math.abs(g - ans)]));
  const pts = score(errs);
  for (const id in pts) r.players[id].score += pts[id];
  r.reveal = { answer: ans, unit: r.q[2], results: Object.keys(pts).map(id => ({ id, name: r.players[id].name, guess: r.answers[id], err: errs[id], points: pts[id] })).sort((a, b) => b.points - a.points) };
  r.phase = 'reveal'; send(r); r.timer = setTimeout(() => ask(r), REVEAL_MS);
}

const api = {
  room() { let code; do code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[crypto.randomInt(24)]).join(''); while (rooms[code]);
    rooms[code] = { code, token: crypto.randomUUID(), phase: 'lobby', players: {}, answers: {}, clients: new Set(), round: 0 };
    return { code, token: rooms[code].token }; },
  join(r, b) { const name = String(b.name || '').trim().slice(0, 16); if (!name) throw 'name required';
    const id = crypto.randomUUID(), secret = crypto.randomUUID(); r.players[id] = { name, score: 0, secret }; send(r); return { id, secret }; },
  start(r, b) { if (b.token !== r.token) throw 'not host'; if (!Q[b.game]) throw 'bad game';
    r.game = b.game; r.round = 0; r.deck = [...Q[b.game]].sort(() => Math.random() - .5);
    for (const p of Object.values(r.players)) p.score = 0; ask(r); return {}; },
  answer(r, b) { if (r.phase !== 'question' || r.players[b.id]?.secret !== b.secret) throw 'not now';
    const g = r.game === 'map' ? { lat: +b.guess?.lat, lng: +b.guess?.lng } : +b.guess;
    if (!(r.game === 'map' ? [g.lat, g.lng] : [g]).every(Number.isFinite)) throw 'bad guess';
    r.answers[b.id] = g; if (Object.keys(r.answers).length === Object.keys(r.players).length) reveal(r); else send(r); return {}; },
};

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), json = (c, o) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/api/events') {
    const r = rooms[u.searchParams.get('room')?.toUpperCase()]; if (!r) return json(404, { error: 'no room' });
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    r.clients.add(res); req.on('close', () => r.clients.delete(res)); res.write(`data: ${JSON.stringify(pub(r))}\n\n`); return;
  }
  const fn = u.pathname.startsWith('/api/') && api[u.pathname.slice(5)];
  if (fn && req.method === 'POST') {
    let body = ''; req.on('data', d => { body += d; if (body.length > 4096) req.destroy(); });
    return req.on('end', () => { try { const b = JSON.parse(body || '{}'), r = rooms[String(b.room || '').toUpperCase()];
      if (fn !== api.room && !r) throw 'no room'; json(200, fn(r, b)); } catch (e) { json(400, { error: String(e) }); } });
  }
  const file = path.join(__dirname, 'public', u.pathname === '/' ? 'host.html' : u.pathname === '/play' ? 'play.html' : path.normalize(u.pathname));
  if (!file.startsWith(path.join(__dirname, 'public'))) return json(403, {});
  fs.readFile(file, (e, d) => e ? json(404, {}) : (res.writeHead(200, { 'content-type': { html: 'text/html', css: 'text/css' }[file.split('.').pop()] || 'text/plain' }), res.end(d)));
});

if (require.main === module) {
  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    const ips = Object.values(os.networkInterfaces()).flat().filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address);
    console.log(`Open the HOST screen at one of:\n${ips.map(ip => `  http://${ip}:${port}`).join('\n') || `  http://localhost:${port}`}\n(use the LAN address so phones can reach the QR link)`);
  });
}
module.exports = { km, score };
