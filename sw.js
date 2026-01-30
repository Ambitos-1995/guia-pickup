/* =====================================================
   GUIA PICKUP - SERVICE WORKER
   PWA con estrategia Cache-First para uso offline
   ===================================================== */

const CACHE_NAME = 'guia-pickup-v5';
const CACHE_VERSION = 5;

// Archivos a cachear durante la instalacion
const PRECACHE_URLS = [
    './',
    './index.html',
    './css/styles.css',
    './js/app.js',
    './manifest.json',
    './icons/icon.svg',
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

// =====================================================
// EVENTO: INSTALL - Cachear archivos esenciales
// =====================================================
self.addEventListener('install', (event) => {
    console.log('[SW] Instalando Service Worker...');

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Cacheando archivos esenciales');
                return cache.addAll(PRECACHE_URLS);
            })
            .then(() => {
                console.log('[SW] Instalacion completada');
                // Activar inmediatamente sin esperar
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[SW] Error en instalacion:', error);
            })
    );
});

// =====================================================
// EVENTO: ACTIVATE - Limpiar caches antiguos
// =====================================================
self.addEventListener('activate', (event) => {
    console.log('[SW] Activando Service Worker...');

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => {
                            console.log('[SW] Eliminando cache antiguo:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Activacion completada');
                // Tomar control de todas las paginas inmediatamente
                return self.clients.claim();
            })
    );
});

// =====================================================
// EVENTO: FETCH - Estrategia Cache-First
// =====================================================
self.addEventListener('fetch', (event) => {
    // Solo manejar peticiones GET
    if (event.request.method !== 'GET') {
        return;
    }

    // Ignorar peticiones a otros dominios (Google Fonts, etc.)
    const requestUrl = new URL(event.request.url);
    if (requestUrl.origin !== location.origin) {
        // Para recursos externos, intentar red primero
        event.respondWith(
            fetch(event.request)
                .catch(() => {
                    // Si falla, intentar cache
                    return caches.match(event.request);
                })
        );
        return;
    }

    // Estrategia Cache-First para recursos locales
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                if (cachedResponse) {
                    // Respuesta encontrada en cache
                    console.log('[SW] Sirviendo desde cache:', event.request.url);
                    return cachedResponse;
                }

                // No esta en cache, buscar en red
                console.log('[SW] Buscando en red:', event.request.url);
                return fetch(event.request)
                    .then((networkResponse) => {
                        // Si es exitoso, guardar en cache para futuro uso
                        if (networkResponse && networkResponse.status === 200) {
                            const responseClone = networkResponse.clone();
                            caches.open(CACHE_NAME)
                                .then((cache) => {
                                    cache.put(event.request, responseClone);
                                });
                        }
                        return networkResponse;
                    })
                    .catch((error) => {
                        console.error('[SW] Error de red:', error);
                        // Mostrar pagina offline si es navegacion
                        if (event.request.mode === 'navigate') {
                            return caches.match('/index.html');
                        }
                        return new Response('Offline', {
                            status: 503,
                            statusText: 'Servicio no disponible'
                        });
                    });
            })
    );
});

// =====================================================
// EVENTO: MESSAGE - Comunicacion con la app
// =====================================================
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data && event.data.type === 'GET_VERSION') {
        event.ports[0].postMessage({ version: CACHE_VERSION });
    }
});

console.log('[SW] Service Worker cargado');
