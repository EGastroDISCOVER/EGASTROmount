const CACHE_NAME = 'egastro-offline-v10';
const PRECACHE_URLS = [
  './', './index.html', './manifest.json', './sync-bus.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
  'https://cdn.jsdelivr.net/npm/astronomy-engine@2.1.19/astronomy.browser.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Orbitron:wght@500;700;900&display=swap'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then(cache => Promise.all(PRECACHE_URLS.map(url => fetch(url, { mode: 'cors' }).then(r => cache.put(url, r)).catch(() => fetch(url, { mode: 'no-cors' }).then(r => cache.put(url, r)).catch(()=>{}))))));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  
  // FIX: Ignora estensioni del browser (chrome-extension://)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  if (url.hostname.includes('api.open-meteo.com') || url.hostname.includes('ipapi.co')) {
    event.respondWith(fetch(event.request).then(res => { if (res.status === 200) { const clone = res.clone(); caches.open(CACHE_NAME).then(c => c.put(event.request, clone)); } return res; }).catch(() => caches.match(event.request)));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(res => { if (res.status === 200) { const clone = res.clone(); caches.open(CACHE_NAME).then(c => c.put(event.request, clone)); } return res; }).catch(() => caches.match(event.request).then(c => c || caches.match('./index.html'))));
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => {
    if (cached) return cached;
    return fetch(event.request).then(res => {
      // FIX: Clona solo se la risposta è valida
      if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
      }
      return res;
    }).catch(() => new Response('', { status: 503 }));
  }));
});