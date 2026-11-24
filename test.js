const assert = require('assert'), fs = require('fs'), os = require('os');
process.env.SEEN_FILE = os.tmpdir() + '/seen-test-' + process.pid + '.json';
const { km, rankPoints, circlePoints, deal, markSeen, ROUNDS } = require('./server'), Q = require('./questions');

// scoring
assert(Math.abs(km({ lat: 28.6139, lng: 77.209 }, { lat: 19.076, lng: 72.8777 }) - 1150) < 20); // Delhi–Mumbai ≈ 1150 km
assert.deepStrictEqual(rankPoints({ a: 5, b: 0, c: 5, d: 99, e: 200 }), { b: 1000, a: 700, c: 700, d: 400, e: 100 });
assert.deepStrictEqual(rankPoints({ solo: 42 }), { solo: 1000 });
assert.strictEqual(circlePoints(40, 50), 950);   // inside a small circle
assert.strictEqual(circlePoints(40, 950), 100);  // inside a huge circle: floor
assert.strictEqual(circlePoints(60, 50), 0);     // missed

// question bank sanity
const dup = a => a.filter((x, i) => a.indexOf(x) !== i);
assert.deepStrictEqual(dup(Q.map.map(p => p.name)), []);
assert.deepStrictEqual(dup(Q.num.map(q => q[0])), []);
for (const p of Q.map) assert(p.lat > 6 && p.lat < 37.5 && p.lng > 68 && p.lng < 97.5 && p.fact, 'bad place: ' + p.name);
for (const q of Q.num) assert(Number.isFinite(q[1]) && typeof q[2] === 'string', 'bad question: ' + q[0]);

// no repeats until the whole bank has been dealt, then it cycles
for (const [game, key] of [['map', q => q.name], ['num', q => q[0]]]) {
  const asked = new Set(), games = Math.floor(Q[game].length / ROUNDS);
  for (let g = 0; g < games; g++) for (const q of deal(game)) { assert(!asked.has(key(q)), 'repeat: ' + key(q)); asked.add(key(q)); markSeen(game, q); }
  assert.strictEqual(deal(game).length, ROUNDS); // exhausted → fresh cycle
}
setTimeout(() => fs.rmSync(process.env.SEEN_FILE, { force: true }), 100);
console.log(`ok · ${Q.map.length} places (${Math.floor(Q.map.length / ROUNDS)} games) · ${Q.num.length} Andaaza (${Math.floor(Q.num.length / ROUNDS)} games) with no repeats`);
