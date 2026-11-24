const assert = require('assert'), { km, rankPoints, circlePoints } = require('./server');
assert(Math.abs(km({ lat: 28.6139, lng: 77.209 }, { lat: 19.076, lng: 72.8777 }) - 1150) < 20); // Delhi–Mumbai ≈ 1150 km
assert.deepStrictEqual(rankPoints({ a: 5, b: 0, c: 5, d: 99, e: 200 }), { b: 1000, a: 700, c: 700, d: 400, e: 100 });
assert.deepStrictEqual(rankPoints({ solo: 42 }), { solo: 1000 });
assert.strictEqual(circlePoints(40, 50), 950);   // inside a small circle
assert.strictEqual(circlePoints(40, 950), 100);  // inside a huge circle: floor
assert.strictEqual(circlePoints(60, 50), 0);     // missed
console.log('ok');
