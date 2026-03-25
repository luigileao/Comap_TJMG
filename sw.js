/* TJMG Fiscal — Service Worker v44
   Compatível com Supabase sync
   Regra: Supabase e CDN externos NUNCA são interceptados
   App shell (index.html, sw.js, manifest.json) = network-first com fallback cache
   Demais assets estáticos = cache-first com atualização em background
*/

const V = 'tjmg-v44';
const CACHE = [
  './',
  './index.html',
  './manifest.json'
];

/* Domínios externos que NUNCA devem ser interceptados */
const BYPASS_DOMAINS = [
  'supabase.co',
  'googleapis.com',
  'gstatic.com',
  'firebase',
  'cdn.jsdelivr.net',
  'dns.google',
  'fonts.googleapis.com',
  'fonts.gstatic.com'
];

/* ── Install: pré-cacheia o app shell ── */
self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(V).then(function(c) {
      return c.addAll(CACHE);
    }).catch(function(err) {
      console.warn('[SW] Install cache falhou:', err);
    })
  );
  self.skipWaiting();
});

/* ── Activate: limpa caches antigos ── */
self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== V; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

/* ── Mensagens do app (skipWaiting) ── */
self.addEventListener('message', function(e) {
  if (!e.data) return;
  if (e.data === 'skipWaiting' || e.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

/* ── Fetch: estratégia por tipo de request ── */
self.addEventListener('fetch', function(e) {
  /* Ignora métodos não-GET */
  if (e.request.method !== 'GET') return;

  var url;
  try { url = new URL(e.request.url); } catch(err) { return; }

  /* Ignora domínios externos (Supabase, CDN, Google Fonts, etc.) */
  var isBypass = BYPASS_DOMAINS.some(function(d) {
    return url.hostname.includes(d);
  });
  if (isBypass) return;

  /* Ignora requests de outras origens */
  var isSameOrigin = url.origin === self.location.origin;
  if (!isSameOrigin) return;

  /* App shell = network-first, fallback para cache */
  var path = url.pathname;
  var isAppShell = (
    path.endsWith('/index.html') ||
    path.endsWith('/sw.js') ||
    path.endsWith('/manifest.json') ||
    path === '/' ||
    path.endsWith('/')
  );

  if (isAppShell) {
    e.respondWith(
      fetch(e.request, { cache: 'no-store' })
        .then(function(r) {
          if (r && r.ok) {
            var copy = r.clone();
            caches.open(V).then(function(c) { c.put(e.request, copy); });
          }
          return r;
        })
        .catch(function() {
          return caches.match(e.request).then(function(cached) {
            return cached || caches.match('./index.html');
          });
        })
    );
    return;
  }

  /* Demais assets = cache-first, atualiza em background */
  e.respondWith(
    caches.match(e.request).then(function(cached) {
      var networkFetch = fetch(e.request).then(function(r) {
        if (r && r.ok) {
          caches.open(V).then(function(c) { c.put(e.request, r.clone()); });
        }
        return r;
      }).catch(function() {
        return cached;
      });
      return cached || networkFetch;
    })
  );
});
