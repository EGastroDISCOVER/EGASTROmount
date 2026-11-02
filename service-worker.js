const CACHE_NAME = 'egastro-smart-v1';
const ASSETS = ['./', './index.html'];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => {
    return Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
  }).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  // AGGIUNTA FONDAMENTALE: Ignora le richieste chrome-extension o non-http/https
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || (url.protocol !== 'http:' && url.protocol !== 'https:')) return;
  
  // Escludiamo anche le API esterne (meteo, gps)
  if (url.hostname.includes('api.open-meteo.com') || url.hostname.includes('ipapi.co') || url.hostname.includes('ipinfo.io')) return;

  event.respondWith(
    fetch(event.request).then((response) => {
      // Assicuriamoci che la risposta sia valida prima di metterla in cache
      if (response && response.status === 200 && response.type === 'basic') {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone).catch(err => console.log('Cache put error:', err));
        });
      }
      return response;
    }).catch(() => caches.match(event.request))
  );
});