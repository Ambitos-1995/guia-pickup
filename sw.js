var CACHE_NAME = 'pickup-tmg-v35';
var FILES_TO_CACHE = [
    './',
    './index.html',
    './manifest.json',
    './css/styles.css',
    './js/webawesome-init.js',
    './js/utils.js',
    './js/api.js',
    './js/pin.js',
    './js/schedule.js',
    './js/clock.js',
    './js/guia.js',
    './js/payment.js',
    './js/admin.js',
    './js/install.js',
    './js/sw-register.js',
    './js/app.js',
    './vendor/webawesome/dist-cdn/styles/webawesome.css',
    './vendor/webawesome/dist-cdn/styles/layers.css',
    './vendor/webawesome/dist-cdn/styles/native.css',
    './vendor/webawesome/dist-cdn/styles/utilities.css',
    './vendor/webawesome/dist-cdn/styles/themes/default.css',
    './vendor/webawesome/dist-cdn/styles/color/palettes/default.css',
    './vendor/webawesome/dist-cdn/webawesome.loader.js',
    './vendor/webawesome/dist-cdn/translations/es.js',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './icons/icon.svg',
    './fonts/Lexend-Variable.ttf',
    './img/fotos con circulos/1.png',
    './img/fotos con circulos/2.png',
    './img/fotos con circulos/3.png',
    './img/fotos con circulos/4.png',
    './img/fotos con circulos/5.png',
    './img/fotos con circulos/6.png',
    './img/fotos con circulos/7.png',
    './img/fotos con circulos/8.png',
    './img/fotos con circulos/9.png',
    './img/fotos con circulos/10.png',
    './img/fotos con circulos/11.png'
];

// Install: cache all static assets (do NOT skipWaiting — user controls update)
self.addEventListener('install', function (e) {
    e.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            return cache.addAll(FILES_TO_CACHE);
        })
    );
});

// Listen for SKIP_WAITING message from the app
self.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Activate: clean old caches
self.addEventListener('activate', function (e) {
    e.waitUntil(
        caches.keys().then(function (names) {
            return Promise.all(
                names.filter(function (n) { return n !== CACHE_NAME; })
                     .map(function (n) { return caches.delete(n); })
            );
        }).then(function () {
            return self.clients.claim();
        })
    );
});

// Fetch: cache-first for static, network-first for API/external
self.addEventListener('fetch', function (e) {
    var url = e.request.url;

    // Skip non-GET, API calls, and external requests (Supabase, etc.)
    if (e.request.method !== 'GET' ||
        url.indexOf('/api/') !== -1 ||
        url.indexOf('supabase.co') !== -1) {
        e.respondWith(
            fetch(e.request).catch(function () {
                return new Response(JSON.stringify({ success: false, message: 'Sin conexion' }), {
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }

    // Static assets: cache-first
    e.respondWith(
        caches.match(e.request).then(function (cached) {
            return cached || fetch(e.request).then(function (response) {
                // Cache new static resources on the fly
                if (response.status === 200) {
                    var clone = response.clone();
                    caches.open(CACHE_NAME).then(function (cache) {
                        cache.put(e.request, clone);
                    });
                }
                return response;
            });
        })
    );
});
