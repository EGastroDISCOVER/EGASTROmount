const CACHE_NAME = 'egastro-smart-v1';
const ASSETS = ['./', './index.html', './manifest.json'];

// Installa e attiva subito
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// Pulisce le vecchie cache quando si aggiorna
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Strategia: Network First (Scarica sempre il nuovo, usa la cache solo se offline)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  
  // Escludiamo le API esterne (meteo, gps) per non incasinare i dati
  if (event.request.url.includes('api.open-meteo.com') || 
      event.request.url.includes('ipapi.co') ||
      event.request.url.includes('ipinfo.io')) {
      return; 
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Se la rete funziona, salva una copia in cache e restituisci la versione nuova
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      })
      .catch(() => {
        // Se manca internet (offline), usa la versione salvata in cache
        return caches.match(event.request);
      })
  );
});