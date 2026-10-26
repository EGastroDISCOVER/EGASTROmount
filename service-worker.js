const CACHE_NAME = 'mount-v1';

// Installazione: forza l'attivazione immediata
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// Attivazione: prende il controllo delle pagine aperte
self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Fetch: gestisce le richieste di rete (obbligatorio per l'installazione)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      // Se la rete fallisce, prova a cercare nella cache
      return caches.match(event.request);
    })
  );
});