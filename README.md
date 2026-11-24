# Desi Party Games

Map Grab and Ball Park with Indian questions. The host screen (a laptop, TV or tablet) shows a QR code, and players join and play on their phones.

```bash
npm start
```

Everyone starts by entering their name. Then there are two ways to play:

- **Same room**: open the printed **LAN address** on a laptop (or TV or tablet) and choose *Same room*. The screen shows a QR code and a room code. Players scan it on phones on the same Wi‑Fi. The host screen shows the questions, maps and results.
- **Play online**: choose *Play online* to get a link to share (Copy or Share). Everyone, the host included, plays on their own device and sees the full game: photo, map, number line and results. People outside your home network can only join if the server is reachable from the internet. Run it on a public host or behind a tunnel such as `cloudflared tunnel --url http://localhost:3000`.

Refreshing the page puts you back into your game.

- **Too Much Work**: the host screen shows a photo or a place name. Players drop a pin on a label-free map of India on their phone. Rounds alternate between:
  - 📍 **Pin**: closest gets 1000, farthest gets 100, and everyone else is spaced evenly by rank.
  - ⭕ **Circle**: pin plus a 25–1000 km circle. If the place is inside your circle you get 1000 − radius (minimum 100). If it's outside you get 0.

  After each round the host screen shows every pin, the real spot and a fact about the place.
- **Andaaza**: guess the number (cricket, history, ISRO, Bollywood…). The reveal shows every guess on a number line. Closest gets 1000, farthest gets 100, and an exact guess gets +200 on top.

Each game has 8 rounds of 15 s. The host can go **Back to lobby** at any time and start the other game with the same players.
**Question bank:** `questions.js` has 310 places (enough for 38 games) and 431 Andaaza questions (enough for 53 games). Questions never repeat until the whole bank has been used. The server records every question it asks in `seen.json`, and that record survives restarts. Delete `seen.json` to start over. No dependencies. `npm test` checks the scoring.
