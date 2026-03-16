var CACHE_NAME = 'pickup-tmg-v60';
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
    './vendor/supabase/supabase.min.js',
    './js/realtime.js',
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
    './icons/favicon-16.png',
    './icons/favicon-32.png',
    './icons/apple-touch-icon.png',
    './icons/icon-192.png',
    './icons/icon-192-maskable.png',
    './icons/icon-512.png',
    './icons/icon-512-maskable.png',
    './icons/icon.svg',
    './fonts/Lexend-Variable.ttf',
    './img/fotos-con-circulos/1.png',
    './img/fotos-con-circulos/2.png',
    './img/fotos-con-circulos/3.png',
    './img/fotos-con-circulos/4.png',
    './img/fotos-con-circulos/5.png',
    './img/fotos-con-circulos/6.png',
    './img/fotos-con-circulos/7.png',
    './img/fotos-con-circulos/8.png',
    './img/fotos-con-circulos/9.png',
    './img/fotos-con-circulos/10.png',
    './img/fotos-con-circulos/11.png'
];

function isSameOrigin(url) {
    return url.origin === self.location.origin;
}

function isImmutableAsset(pathname) {
    return pathname.indexOf('/vendor/') === 0 ||
        pathname.indexOf('/icons/') === 0 ||
        pathname.indexOf('/img/') === 0 ||
        pathname.indexOf('/fonts/') === 0;
}

function isAppShellRequest(requestUrl) {
    var pathname = requestUrl.pathname;
    return pathname === '/' ||
        pathname === '/index.html' ||
        pathname === '/manifest.json' ||
        pathname.indexOf('/css/') === 0 ||
        pathname.indexOf('/js/') === 0;
}

function cacheFirst(request) {
    return caches.match(request).then(function (cached) {
        if (cached) return cached;

        return fetch(request).then(function (response) {
            if (response && response.status === 200) {
                var clone = response.clone();
                caches.open(CACHE_NAME).then(function (cache) {
                    cache.put(request, clone);
                });
            }
            return response;
        });
    });
}

function networkFirst(request) {
    return fetch(request).then(function (response) {
        if (response && response.status === 200) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(function (cache) {
                cache.put(request, clone);
            });
        }
        return response;
    }).catch(function () {
        return caches.match(request).then(function (cached) {
            if (cached) return cached;

            if (request.mode === 'navigate') {
                return caches.match('./index.html');
            }

            return new Response('Sin conexion', {
                status: 503,
                statusText: 'Offline'
            });
        });
    });
}

// Install: cache all static assets, then activate immediately
self.addEventListener('install', function (e) {
    e.waitUntil(
        caches.open(CACHE_NAME).then(function (cache) {
            return cache.addAll(FILES_TO_CACHE);
        }).then(function () {
            return self.skipWaiting();
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
    var requestUrl = new URL(e.request.url);
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

    if (!isSameOrigin(requestUrl)) {
        e.respondWith(fetch(e.request));
        return;
    }

    if (isImmutableAsset(requestUrl.pathname)) {
        e.respondWith(cacheFirst(e.request));
        return;
    }

    if (isAppShellRequest(requestUrl) || e.request.mode === 'navigate') {
        e.respondWith(networkFirst(e.request));
        return;
    }

    e.respondWith(cacheFirst(e.request));
});
