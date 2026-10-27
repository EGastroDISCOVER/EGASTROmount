// ============================================================
//  EGastro Service Worker — Offline Ready (v6.0)
// ============================================================
const CACHE_NAME = 'egastro-offline-v6';

// Risorse da salvare tassativamente per l'offline
const PRECACHE_URLS = [
  './',
  './index.html',
  './manifest.json',
  './sync-bus.js',
  // Librerie CDN (Telescopio 3D e Stelle)
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
  'https://cdn.jsdelivr.net/npm/astronomy-engine@2.1.19/astronomy.browser.min.js',
  // Font
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Orbitron:wght@500;700;900&display=swap'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      // Salva i file uno per uno. Se un CDN fallisce, ignora e continua.
      return Promise.all(
        PRECACHE_URLS.map(url => {
          return fetch(url, { mode: 'cors' }) // Tenta CORS per Three.js
            .then(response => {
              if (!response.ok) throw new Error('HTTP ' + response.status);
              return cache.put(url, response);
            })
            .catch(err => {
              console.warn('[SW] Fallback no-cors per:', url);
              // Fallback per font o CDN che bloccano CORS
              return fetch(url, { mode: 'no-cors' })
                .then(res => cache.put(url, res))
                .catch(e => console.error('[SW] Impossibile salvare:', url));
            });
        })
      );
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      // Pulisce tutte le vecchie cache
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // 1. API Meteo o IP: Prima la rete, se offline usa la cache (o errore gestito)
  if (url.hostname.includes('api.open-meteo.com') || url.hostname.includes('ipapi.co')) {
    event.respondWith(
      fetch(event.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        return res;
      }).catch(() => caches.match(event.request)) // Se offline, prende l'ultimo meteo salvato
    );
    return;
  }

  // 2. Navigazione HTML: Prima la rete (per aggiornamenti), se offline usa la cache
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then(res => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        return res;
      }).catch(() => {
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          return caches.match('./index.html'); // Fallback assoluto
        });
      })
    );
    return;
  }

  // 3. Asset (JS, CSS, CDN): Prima la cache (per aprire subito offline), poi la rete
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      }).catch(() => new Response('', { status: 503 }));
    })
  );
});