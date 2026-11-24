# Desi Party Games

Map Grab and Ball Park with Indian questions. The host screen (laptop/TV) shows a QR code, and players join and play on their phones.

```bash
npm start
```

Open the printed **LAN address** on the TV or laptop. Don't use `localhost`, or the QR link won't work on phones. Phones must be on the same Wi‑Fi.

- **Map Grab: Bharat Edition**: drop a pin on a label-free map of India where you think the landmark is. Closest pin wins.
- **Ball Park: Desi Estimates**: guess a number (cricket, history, geography, Bollywood). Closest guess wins.

Each game has 5 rounds of 25 s. Points go by rank: 1000 / 750 / 500, and 250 for everyone else who answered. Add questions in `questions.js`. No dependencies.
