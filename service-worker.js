const CACHE_NAME = 'egastro-cache-v6';
const PRECACHE_URLS = [
  './', './index.html', './manifest.json', './sync-bus.js',
  'https://cdn.jsdelivr.net/npm/astronomy-engine@2.1.19/astronomy.browser.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Orbitron:wght@500;700;900&display=swap'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => Promise.all(PRECACHE_URLS.map(url => cache.add(url).catch(e => console.warn('Skip:', url))))));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (['api.open-meteo.com', 'ipapi.co', 'ipinfo.io'].some(h => url.hostname.includes(h))) {
    event.respondWith(fetch(req).then(r => { if (r.status === 200) caches.open(CACHE_NAME).then(c => c.put(req, r.clone())); return r; }).catch(() => caches.match(req)));
    return;
  }

  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).then(r => { if (r.status === 200) caches.open(CACHE_NAME).then(c => c.put(req, r.clone())); return r; }).catch(() => caches.match(req).then(c => c || caches.match('./index.html'))));
    return;
  }

  event.respondWith(caches.match(req).then(cached => {
    if (cached) return cached;
    return fetch(req).then(r => { if (r.status === 200) caches.open(CACHE_NAME).then(c => c.put(req, r.clone())); return r; }).catch(() => new Response('', { status: 503 }));
  }));
});