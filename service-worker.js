const CACHE_NAME = 'egastro-offline-v9';
const PRECACHE_URLS = [
  './', './index.html', './manifest.json', './sync-bus.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
  'https://cdn.jsdelivr.net/npm/astronomy-engine@2.1.19/astronomy.browser.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Orbitron:wght@500;700;900&display=swap'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.all(
        PRECACHE_URLS.map(url => {
          return fetch(url, { mode: 'cors' })
            .then(response => {
              if (!response.ok) throw new Error('HTTP ' + response.status);
              return cache.put(url, response);
            })
            .catch(() => {
              return fetch(url, { mode: 'no-cors' })
                .then(res => cache.put(url, res))
                .catch(() => {});
            });
        })
      );
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  
  // Ignora estensioni di Chrome
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // API meteo e IP
  if (url.hostname.includes('api.open-meteo.com') || url.hostname.includes('ipapi.co')) {
    event.respondWith(
      fetch(event.request).then(response => {
        const resClone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  // Navigazione (HTML)
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(response => {
        const resClone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
        return response;
      }).catch(() => {
        return caches.match(event.request).then(cached => cached || caches.match('./index.html'));
      })
    );
    return;
  }

  // Tutti gli altri file (JS, CSS, Font)
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        // Clona la risposta solo se è valida
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }
        const resClone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
        return response;
      }).catch(() => new Response('', { status: 503 }));
    })
  );
});