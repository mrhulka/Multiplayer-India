# Lock It

Map Grab and Ball Park with Indian questions. The host screen (a laptop, TV or tablet) shows a QR code, and players join and play on their phones.

```bash
npm start
```

Everyone starts by entering their name. Then there are two ways to play:

- **Same room**: open the printed **LAN address** on a laptop (or TV or tablet) and choose *Same room*. The screen shows a QR code and a room code. Players scan it on phones on the same Wi‑Fi. The host screen shows the questions, maps and results.
- **Play online**: choose *Play online* to get a link to share (Copy or Share). Everyone, the host included, plays on their own device and sees the full game: photo, map, number line and results. People outside your home network can only join if the server is reachable from the internet. Run it on a public host or behind a tunnel such as `cloudflared tunnel --url http://localhost:3000`.

Refreshing the page puts you back into your game.

- **AtaaPataa**: the host screen shows a photo or a place name. Players drop a pin on a map of India's states (official boundaries, no labels) on their phone. Rounds alternate between:
  - 📍 **Pin**: closest gets 1000, farthest gets 100, and everyone else is spaced evenly by rank.
  - ⭕ **Circle**: pin plus a 25–1000 km circle. If the place is inside your circle you get 1000 − radius (minimum 100). If it's outside you get 0.

  After each round the host screen shows every pin, the real spot and a fact about the place.
- **Andaaza Apna Apna**: guess the number (cricket, history, ISRO, Bollywood…). The reveal shows every guess on a number line. Closest gets 1000, farthest gets 100, and an exact guess gets +200 on top.

- **Pehchaan Kaun**: the host screen shows a clue about a Bollywood star (113 actors, legends, singers and directors). Players type the name. Exact spelling (ignoring capitals, spaces and punctuation) scores 1000; misspellings score less the more letters are wrong, down to 0 at half wrong.

- **Dimaag Ka Dahi**: 64 brain-teasers (twisted family relationships, sneaky maths, trick questions) with four options each. The three wrong options are the answers your brain wants to jump to. Right answers score 1000 down to 500 by speed; wrong scores 0. The reveal explains the trick.

The host picks the number of rounds (3–20) for each game in the lobby. Timing: 25 s to answer (Dimaag Ka Dahi 30 s), then 5 s of results before the next question. Answers made in the last 1.5 s still count. The host can go **Back to lobby** at any time and start the other game with the same players.
**Question bank:** `questions.js` has 310 places, with coordinates checked against Wikipedia and 263 hand-reviewed photos (78 of them photo-only rounds), (enough for 38 games) and 431 Andaaza Apna Apna questions (enough for 53 games). Questions never repeat until the whole bank has been used. The server records every question it asks in `seen.json`, and that record survives restarts. Delete `seen.json` to start over. No dependencies. `npm test` checks the scoring.

## Cloudflare

Live at **https://inmyopinion.in** (also https://desi-party-games.sajeshsoman6.workers.dev). Place photos are self-hosted: `photos/` holds all 263 (about 1000 px wide), the Worker serves them from Workers KV (`PHOTOS` binding) through Cloudflare's cache, and the local server serves the folder directly. The same game runs on Cloudflare Workers (`worker/index.js` + `wrangler.jsonc`). The two page files are bundled into the Worker, and every room lives in one Durable Object. Rooms are kept in memory, so a game in progress is lost if Cloudflare restarts the Durable Object, which happens when nobody has been connected for a while. The no-repeat history is saved in Durable Object storage.

```bash
npm install
npm run deploy
```

State boundaries in `public/india-states.json` are simplified from [udit-001/india-maps-data](https://github.com/udit-001/india-maps-data). That repo publishes no license, so check before any commercial use.
