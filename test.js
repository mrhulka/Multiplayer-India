const assert = require('assert'), fs = require('fs'), os = require('os');
const { km, rankPoints, circlePoints, deal, markSeen, ROUNDS } = require('./game'), Q = require('./questions'); // seen history stays in memory here

// scoring
assert(Math.abs(km({ lat: 28.6139, lng: 77.209 }, { lat: 19.076, lng: 72.8777 }) - 1150) < 20); // Delhi–Mumbai ≈ 1150 km
assert.deepStrictEqual(rankPoints({ a: 5, b: 0, c: 5, d: 99, e: 200 }), { b: 1000, a: 700, c: 700, d: 400, e: 100 });
assert.deepStrictEqual(rankPoints({ solo: 42 }), { solo: 1000 });
assert.strictEqual(circlePoints(40, 50), 950);   // inside a small circle
assert.strictEqual(circlePoints(40, 950), 100);  // inside a huge circle: floor
assert.strictEqual(circlePoints(60, 50), 0);     // missed

// Pehchaan Kaun spelling: exact (ignoring case/spaces/punctuation) = 1000, small slips score less, way off = 0
const { spellPoints } = require('./game'), sp = (t, a) => spellPoints(t, a).points;
assert.strictEqual(sp('Shah Rukh Khan', ['Shah Rukh Khan']), 1000);
assert.strictEqual(sp('shahrukh khan', ['Shah Rukh Khan']), 1000);
assert.strictEqual(sp('A R Rahman', ['A. R. Rahman']), 1000);
const one = sp('Amitabh Bachan', ['Amitabh Bachchan']), two = sp('Amitab Bachan', ['Amitabh Bachchan']);
assert(one < 1000 && one > two && two > 0, `one slip ${one} > two slips ${two} > 0`);
assert.strictEqual(sp('Salman Khan', ['Shah Rukh Khan']), 0);
assert.strictEqual(sp('', ['Kajol']), 0);
assert.strictEqual(sp('Kareena Kapoor', ['Kareena Kapoor Khan', 'Kareena Kapoor']), 1000); // accepted alternate
for (const q of Q.face) assert(q[0] && q[1] && (!q[2] || Array.isArray(q[2])), 'bad clue ' + q[0]);

// Dimaag Ka Dahi: right + instant = 1000, right at the buzzer = 500, wrong = 0; every puzzle has 4 distinct options
const { quizPoints } = require('./game');
assert.strictEqual(quizPoints(true, 0, 30000), 1000); assert.strictEqual(quizPoints(true, 30000, 30000), 500);
assert.strictEqual(quizPoints(true, 15000, 30000), 750); assert.strictEqual(quizPoints(false, 10, 30000), 0);
for (const q of Q.dahi) assert(q[3] && new Set([q[1], ...q[2]]).size === 4, 'bad puzzle: ' + q[0]);

// question bank sanity
const dup = a => a.filter((x, i) => a.indexOf(x) !== i);
assert.deepStrictEqual(dup(Q.map.map(p => p.name)), []);
assert.deepStrictEqual(dup(Q.num.map(q => q[0])), []);
for (const p of Q.map) assert(p.lat > 6 && p.lat < 37.5 && p.lng > 68 && p.lng < 97.5 && p.fact, 'bad place: ' + p.name);
for (const q of Q.num) assert(Number.isFinite(q[1]) && typeof q[2] === 'string', 'bad question: ' + q[0]);

// every place with a photo has its self-hosted file (photos/<slug>.jpg), so no photo depends on Wikimedia at game time
const { slug } = require('./game');
const missing = Q.map.filter(p => p.img && !fs.existsSync(`${__dirname}/photos/${slug(p.name)}.jpg`)).map(p => p.name);
assert.deepStrictEqual(missing, [], 'photos missing: ' + missing.join(', '));

// no repeats until the whole bank has been dealt, then it cycles
for (const [game, key] of [['map', q => q.name], ['num', q => q[0]], ['face', q => q[0]], ['dahi', q => q[0]]]) {
  const asked = new Set(), games = Math.floor(Q[game].length / ROUNDS);
  for (let g = 0; g < games; g++) for (const q of deal(game)) { assert(!asked.has(key(q)), 'repeat: ' + key(q)); asked.add(key(q)); markSeen(game, q); }
  assert.strictEqual(deal(game).length, ROUNDS); // exhausted → fresh cycle
}
console.log(`ok · ${Q.map.length} places · ${Q.num.length} Andaaza · ${Q.face.length} celebrities · ${Q.dahi.length} puzzles (at 8 rounds: ${[Q.map, Q.num, Q.face, Q.dahi].map(b => Math.floor(b.length / ROUNDS)).join(' / ')} games with no repeats)`);
