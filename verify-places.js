// Checks every AtaaPataa place against Wikipedia: official coordinates + lead photo.
// Usage: NODE_USE_ENV_PROXY=1 node verify-places.js > places-check.json   (needs en.wikipedia.org)
const Q = require('./questions'), { km } = require('./game');
const API = 'https://en.wikipedia.org/w/api.php?format=json&formatversion=2&redirects=1&prop=coordinates|pageimages&piprop=thumbnail&pithumbsize=1280&colimit=max&pilimit=max&action=query&';
const UA = { 'user-agent': 'desi-party-games/1.0 (question verifier)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(q) {
  for (let wait = 5000; ; wait *= 2) { // back off on rate limits
    const res = await fetch(API + q, { headers: UA });
    if (res.ok) return res.json();
    if (wait > 160000) throw new Error(`${res.status} ${await res.text()}`);
    console.error(`HTTP ${res.status}, retrying in ${wait / 1000}s`); await sleep(wait);
  }
}
const page = p => p && !p.missing && p.coordinates ? { title: p.title, lat: p.coordinates[0].lat, lng: p.coordinates[0].lon, img: p.thumbnail?.source } : null;

// map each requested title to its page, following normalisation + redirects
async function byTitles(titles) {
  const found = {};
  for (let i = 0; i < titles.length; i += 50) {
    const r = (await api('titles=' + encodeURIComponent(titles.slice(i, i + 50).join('|')))).query;
    const alias = Object.fromEntries([...(r.normalized || []), ...(r.redirects || [])].map(x => [x.from, x.to]));
    const pages = Object.fromEntries(r.pages.map(p => [p.title, page(p)]));
    for (const t of titles.slice(i, i + 50)) { let x = t; while (alias[x]) x = alias[x]; found[t] = pages[x]; }
    await sleep(1000);
  }
  return found;
}

(async () => {
  const first = p => (p.wiki || p.name).replace(/_/g, ' ');
  const plain = p => p.name.replace(/\s*\(.*\)/, '').split(',')[0]; // "Hawa Mahal, Jaipur" → "Hawa Mahal"
  const a = await byTitles(Q.map.map(first)), b = await byTitles(Q.map.map(plain));
  const out = [];
  for (const p of Q.map) {
    let hit = a[first(p)] || b[plain(p)];
    if (!hit) { const r = await api('generator=search&gsrlimit=1&gsrsearch=' + encodeURIComponent(p.name + ' India')); hit = page(r.query?.pages?.[0]); await sleep(1500); }
    const d = hit ? Math.round(km(p, hit)) : null;
    out.push({ name: p.name, ...hit, km: d });
    console.error(`${d ?? '??'}\t${p.name} → ${hit?.title ?? 'NOT FOUND'}${hit?.img ? '' : ' (no photo)'}`);
  }
  console.log(JSON.stringify(out, null, 1));
})();
