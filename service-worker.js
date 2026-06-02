/* =========================================================
   Smart PPT Converter — Service Worker
   - Enables full offline support after first install
   - Caches all app shell + library CDNs
   ========================================================= */

const CACHE_NAME = 'smart-ppt-v2.0.0';
const RUNTIME_CACHE = 'smart-ppt-runtime-v2';

// App shell files (always cached)
const APP_SHELL = [
  './',
  './smart-ppt-all-in-one.html',
  './manifest.json'
];

// CDN libraries to pre-cache for offline
const CDN_LIBS = [
  'https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js',
  'https://cdn.jsdelivr.net/npm/mammoth@1.6.0/mammoth.browser.min.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5.0.4/dist/tesseract.min.js',
  'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
  'https://fonts.googleapis.com/css2?family=Noto+Sans+Ethiopic:wght@400;500;600;700;800&family=Abyssinica+SIL&display=swap'
];

// ===== Install: pre-cache app shell =====
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Cache app shell (must succeed)
      try { await cache.addAll(APP_SHELL); } catch (e) { console.warn('[SW] shell error', e); }
      // Cache CDN libs (best-effort, non-blocking)
      CDN_LIBS.forEach(url => {
        cache.add(url).catch(err => console.warn('[SW] CDN cache failed:', url, err.message));
      });
    }).then(() => self.skipWaiting())
  );
});

// ===== Activate: cleanup old caches =====
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME && k !== RUNTIME_CACHE)
                       .map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// ===== Fetch: Cache-first, network fallback =====
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Skip non-GET requests
  if (req.method !== 'GET') return;

  // Skip chrome-extension and other unsupported schemes
  const url = new URL(req.url);
  if (!['http:', 'https:'].includes(url.protocol)) return;

  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) {
        // Return cached + revalidate in background
        fetch(req).then(resp => {
          if (resp && resp.ok) {
            caches.open(RUNTIME_CACHE).then(c => c.put(req, resp.clone()));
          }
        }).catch(() => {});
        return cached;
      }

      // Network fetch with runtime caching
      return fetch(req).then((resp) => {
        if (!resp || !resp.ok) return resp;
        const respClone = resp.clone();
        caches.open(RUNTIME_CACHE).then(c => {
          try { c.put(req, respClone); } catch (e) {}
        });
        return resp;
      }).catch(() => {
        // Offline fallback for HTML navigation
        if (req.mode === 'navigate') {
          return caches.match('./smart-ppt-all-in-one.html');
        }
        return new Response('Offline - resource unavailable', {
          status: 503, statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain' }
        });
      });
    })
  );
});

// ===== Message handler (for skip-waiting) =====
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
