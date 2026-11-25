const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const game = require('./game');
const SEEN = process.env.SEEN_FILE || path.join(__dirname, 'seen.json');
let seen = {}; try { seen = JSON.parse(fs.readFileSync(SEEN)); } catch {}
game.useSeen(seen, s => fs.writeFile(SEEN, JSON.stringify(s), () => {}));

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), json = (c, o) => { res.writeHead(c, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
  if (u.pathname === '/api/events') {
    const r = game.getRoom(u.searchParams.get('room')); if (!r) return json(404, { error: 'no room' });
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
    r.clients.add(res); req.on('close', () => r.clients.delete(res)); res.write(game.snapshot(r)); return;
  }
  if (u.pathname.startsWith('/api/') && req.method === 'POST') {
    let body = ''; req.on('data', d => { body += d; if (body.length > 4096) req.destroy(); });
    return req.on('end', () => { try { json(200, game.call(u.pathname.slice(5), JSON.parse(body || '{}'))); } catch (e) { json(400, { error: String(e) }); } });
  }
  const file = path.join(__dirname, 'public', ['/', '/play'].includes(u.pathname) ? 'index.html' : path.normalize(u.pathname));
  if (!file.startsWith(path.join(__dirname, 'public'))) return json(403, {});
  fs.readFile(file, (e, d) => e ? json(404, {}) : (res.writeHead(200, { 'content-type': { html: 'text/html', css: 'text/css', json: 'application/json' }[file.split('.').pop()] || 'text/plain' }), res.end(d)));
});
setInterval(game.ping, 25000).unref();

if (require.main === module) {
  const port = process.env.PORT || 3000;
  server.listen(port, () => {
    const ips = Object.values(os.networkInterfaces()).flat().filter(i => i.family === 'IPv4' && !i.internal).map(i => i.address);
    console.log(`Open the HOST screen at one of:\n${ips.map(ip => `  http://${ip}:${port}`).join('\n') || `  http://localhost:${port}`}\n(use the LAN address so phones can reach the QR link)`);
  });
}
