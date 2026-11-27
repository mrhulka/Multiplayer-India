const assert = require('assert'), fs = require('fs'), os = require('os');
const { km, rankPoints, circlePoints, deal, markSeen, ROUNDS } = require('./game'), Q = require('./questions'); // seen history stays in memory here

// scoring
assert(Math.abs(km({ lat: 28.6139, lng: 77.209 }, { lat: 19.076, lng: 72.8777 }) - 1150) < 20); // Delhi–Mumbai ≈ 1150 km
assert.deepStrictEqual(rankPoints({ a: 5, b: 0, c: 5, d: 99, e: 200 }), { b: 1000, a: 700, c: 700, d: 400, e: 100 });
assert.deepStrictEqual(rankPoints({ solo: 42 }), { solo: 1000 });
assert.strictEqual(circlePoints(40, 50), 950);   // inside a small circle
assert.strictEqual(circlePoints(40, 950), 100);  // inside a huge circle: floor
assert.strictEqual(circlePoints(60, 50), 0);     // missed

// Pehchaan Kaun: right + instant = 1000, right at the buzzer = 500, wrong = 0; four distinct same-gender options incl. the answer
const { facePoints, faceOptions } = require('./game');
assert.strictEqual(facePoints(true, 0, 15000), 1000);
assert.strictEqual(facePoints(true, 15000, 15000), 500);
assert.strictEqual(facePoints(true, 7500, 15000), 750);
assert.strictEqual(facePoints(false, 100, 15000), 0);
for (const q of Q.face) { const o = faceOptions(q); assert(o.length === 4 && new Set(o).size === 4 && o.includes(q.name), 'options for ' + q.name);
  assert(o.every(n => Q.face.find(f => f.name === n).gender === q.gender), 'gender mix for ' + q.name); }

// question bank sanity
const dup = a => a.filter((x, i) => a.indexOf(x) !== i);
assert.deepStrictEqual(dup(Q.map.map(p => p.name)), []);
assert.deepStrictEqual(dup(Q.num.map(q => q[0])), []);
for (const p of Q.map) assert(p.lat > 6 && p.lat < 37.5 && p.lng > 68 && p.lng < 97.5 && p.fact, 'bad place: ' + p.name);
for (const q of Q.num) assert(Number.isFinite(q[1]) && typeof q[2] === 'string', 'bad question: ' + q[0]);

// every place with a photo has its self-hosted file (photos/<slug>.jpg), so no photo depends on Wikimedia at game time
const { slug } = require('./game');
const missing = [...Q.map, ...Q.face].filter(p => p.img && !fs.existsSync(`${__dirname}/photos/${slug(p.name)}.jpg`)).map(p => p.name);
assert.deepStrictEqual(missing, [], 'photos missing: ' + missing.join(', '));

// no repeats until the whole bank has been dealt, then it cycles
for (const [game, key] of [['map', q => q.name], ['num', q => q[0]], ['face', q => q.name]]) {
  const asked = new Set(), games = Math.floor(Q[game].length / ROUNDS);
  for (let g = 0; g < games; g++) for (const q of deal(game)) { assert(!asked.has(key(q)), 'repeat: ' + key(q)); asked.add(key(q)); markSeen(game, q); }
  assert.strictEqual(deal(game).length, ROUNDS); // exhausted → fresh cycle
}
console.log(`ok · ${Q.map.length} places · ${Q.num.length} Andaaza · ${Q.face.length} celebrities (at 8 rounds: ${[Q.map, Q.num, Q.face].map(b => Math.floor(b.length / ROUNDS)).join(' / ')} games with no repeats)`);
