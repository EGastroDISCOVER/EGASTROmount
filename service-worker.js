const CACHE_NAME = 'egastro-offline-v2';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './logo-mount.png',
  // Librerie esterne (CDN)
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
  'https://cdn.jsdelivr.net/npm/astronomy-engine@2.1.19/astronomy.browser.min.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Orbitron:wght@500;700;900&display=swap'
];

// Salva TUTTI i file in cache durante l'installazione
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  // Escludiamo le API esterne (meteo, gps)
  const url = new URL(event.request.url);
  if (url.hostname.includes('api.open-meteo.com') || url.hostname.includes('ipapi.co') || url.hostname.includes('ipinfo.io')) return;

  event.respondWith(
    fetch(event.request).then((response) => {
      // Se la rete funziona, salva una copia aggiornata
      if (response && response.status === 200) {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
      }
      return response;
    }).catch(() => {
      // Se sei offline, usa la versione salvata in cache
      return caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        // Se non c'è proprio, restituisci un errore (o una pagina offline)
        return new Response('Sei offline e questa risorsa non è in cache.', { status: 503 });
      });
    })
  );
});