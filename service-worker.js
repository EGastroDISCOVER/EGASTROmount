const CACHE_NAME = 'egastro-dynamic-v4';

// Attivazione immediata
self.addEventListener('install', (event) => {
  self.skipWaiting();
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

  const url = new URL(event.request.url);
  
  // Escludiamo le API esterne (meteo, gps)
  if (url.hostname.includes('api.open-meteo.com') || 
      url.hostname.includes('ipapi.co') || 
      url.hostname.includes('ipinfo.io')) return;

  // STRATEGIA PER L'HTML: Network First (scarica sempre la nuova versione se online)
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          // Se offline, usa la cache (o l'index.html salvato)
          return caches.match(event.request).then((cached) => {
            return cached || caches.match('./index.html');
          });
        })
    );
  } else {
    // STRATEGIA PER TUTTO IL RESTO (CDN, JS, CSS, Immagini): Cache First
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) {
          return cached; // Usa la copia salvata se esiste
        }
        // Altrimenti scarica da internet e SALVA in cache per la prossima volta
        return fetch(event.request).then((response) => {
          if (response.ok && (response.type === 'basic' || response.type === 'cors')) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        }).catch(() => {
          return new Response('', { status: 503, statusText: 'Offline' });
        });
      })
    );
  }
});