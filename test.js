const assert = require('assert'), { km, score } = require('./server');
assert(Math.abs(km({ lat: 28.6139, lng: 77.209 }, { lat: 19.076, lng: 72.8777 }) - 1150) < 20); // Delhi–Mumbai ≈ 1150 km
assert.deepStrictEqual(score({ a: 5, b: 0, c: 5, d: 99, e: 200 }), { b: 1000, a: 750, c: 750, d: 500, e: 250 });
console.log('ok');
