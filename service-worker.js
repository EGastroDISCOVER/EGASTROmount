// Forza l'aggiornamento se cambi questo numero (es. v3.1, v3.2)
const SW_VERSION = 'v3.0.0'; 
const CACHE_NAME = 'egastro-cache-' + SW_VERSION;

const PRECACHE_URLS = [
  './',
  './index.html',
  './index-observatory.html',
  './index-mount.html',
  './manifest.json',
  './sync-bus.js',
  'https://cdn.jsdelivr.net/npm/astronomy-engine@2.1.19/astronomy.browser.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Orbitron:wght@500;700;900&display=swap'
];

self.addEventListener('install', event => {
  self.skipWaiting(); // Forza l'attivazione immediata
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return Promise.all(
        PRECACHE_URLS.map(url => cache.add(url).catch(err => console.warn('Precache saltato:', url)))
      );
    })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      // Elimina tutte le vecchie cache che non corrispondono alla nuova versione
      keys.filter(k => k.startsWith('egastro-cache-') && k !== CACHE_NAME).map(k => caches.delete(k))
    )).then(() => self.clients.claim()) // Prende il controllo delle schede aperte
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  
  // 1. API meteo/GPS: Prima la rete, poi la cache
  const networkFirstHosts = ['api.open-meteo.com', 'ipapi.co', 'ipinfo.io', 'ipwho.is'];
  if (networkFirstHosts.some(h => url.hostname.includes(h))) {
    event.respondWith(
      fetch(req).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // 2. Navigazione (HTML): Prima la rete (così vedi subito le modifiche), poi la cache (se offline)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(res => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => {
        // Se sei offline, usa la cache o l'index.html
        return caches.match(req).then(cached => {
          if (cached) return cached;
          return caches.match('./index.html').then(fallback => {
             if(fallback) return fallback;
             return caches.match('./');
          });
        });
      })
    );
    return;
  }

  // 3. Tutti gli altri file (JS, CSS, immagini, CDN): Prima la cache, poi la rete in background
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) {
        // C'è in cache, aggiorna in background per la prossima volta
        fetch(req).then(res => {
          if (res && res.status === 200) {
            caches.open(CACHE_NAME).then(c => c.put(req, res));
          }
        }).catch(() => {}); 
        return cached;
      }
      
      // Non c'è in cache, scaricalo
      return fetch(req).then(res => {
        if (res && res.status === 200 && (url.protocol === 'http:' || url.protocol === 'https:')) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, clone));
        }
        return res;
      }).catch(() => new Response('', { status: 503 }));
    })
  );
});

// Ascolta i messaggi dalla pagina per forzare il salto di attesa
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});