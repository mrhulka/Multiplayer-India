// Cloudflare Worker: static files from /public, game API + live updates in one Durable Object.
import game from '../game.js';
import page from '../public/index.html';
import css from '../public/style.css';
// ponytail: the two static files are bundled into the Worker; switch to Workers static assets if public/ grows images

// ponytail: one Durable Object holds every room (same as the single Node process); shard by room code if it ever gets busy
export class Hub {
  constructor(ctx) {
    ctx.blockConcurrencyWhile(async () => game.useSeen(await ctx.storage.get('seen'), s => ctx.storage.put('seen', s)));
    setInterval(game.ping, 25000);
  }
  async fetch(req) {
    const u = new URL(req.url), json = (o, status = 200) => Response.json(o, { status });
    if (u.pathname === '/api/events') {
      const r = game.getRoom(u.searchParams.get('room')); if (!r) return json({ error: 'no room' }, 404);
      const { readable, writable } = new TransformStream(), w = writable.getWriter(), enc = new TextEncoder();
      const c = { write: s => w.write(enc.encode(s)).catch(() => r.clients.delete(c)) };
      r.clients.add(c); c.write(game.snapshot(r));
      return new Response(readable, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' } });
    }
    if (req.method !== 'POST') return json({ error: 'not found' }, 404);
    const body = await req.text(); if (body.length > 4096) return json({ error: 'too big' }, 413);
    try { return json(game.call(u.pathname.slice(5), JSON.parse(body || '{}'))); } catch (e) { return json({ error: String(e) }, 400); }
  }
}

const file = (body, type) => new Response(body, { headers: { 'content-type': type, 'cache-control': 'no-cache' } });
export default {
  fetch(req, env) {
    const { pathname } = new URL(req.url);
    if (pathname.startsWith('/api/')) return env.HUB.get(env.HUB.idFromName('global')).fetch(req);
    return pathname === '/style.css' ? file(css, 'text/css; charset=utf-8') : file(page, 'text/html; charset=utf-8'); // every other path is the app
  },
};
