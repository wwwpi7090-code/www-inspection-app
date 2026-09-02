// WWW Property Inspection — Service Worker v3.5
const CACHE_VERSION = 'v3.5.0';
const CACHE_NAME = `www-inspection-${CACHE_VERSION}`;

// App shell — adjust paths to match your Vercel deployment
const SHELL_URLS = [
  '/',
  '/index.html',
];

// ── Install: cache app shell ────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Cache install failed:', err))
  );
});

// ── Activate: delete old caches ────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('www-inspection-') && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for shell, stale-while-revalidate for CDN ──
self.addEventListener('fetch', event => {
  const { request } = event;

  // Only handle GET
  if (request.method !== 'GET') return;

  // Skip cross-origin requests that aren't CDN assets
  const url = new URL(request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isCDN = url.hostname.includes('unpkg.com') ||
                url.hostname.includes('cdnjs.cloudflare.com') ||
                url.hostname.includes('fonts.googleapis.com') ||
                url.hostname.includes('fonts.gstatic.com');

  if (!isSameOrigin && !isCDN) return;

  // Navigation: always return cached index.html (SPA)
  if (request.mode === 'navigate') {
    event.respondWith(
      caches.match('/index.html')
        .then(cached => {
          if (cached) {
            // Background revalidate
            fetch(request)
              .then(res => { if (res.ok) caches.open(CACHE_NAME).then(c => c.put('/index.html', res)); })
              .catch(() => {});
            return cached;
          }
          return fetch(request)
            .then(res => {
              if (res.ok) caches.open(CACHE_NAME).then(c => c.put('/index.html', res.clone()));
              return res;
            })
            .catch(() => new Response('<h1>Offline</h1><p>Please open the app while connected first.</p>', {
              headers: { 'Content-Type': 'text/html' }
            }));
        })
    );
    return;
  }

  // CDN and static assets: cache-first
  event.respondWith(
    caches.match(request).then(cached => {
      const fetchAndCache = fetch(request).then(res => {
        if (res.ok) {
          caches.open(CACHE_NAME).then(cache => cache.put(request, res.clone()));
        }
        return res;
      }).catch(() => cached || new Response('', { status: 503 }));

      return cached || fetchAndCache;
    })
  );
});

// ── Message: skipWaiting (for update notification) ─────────
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
