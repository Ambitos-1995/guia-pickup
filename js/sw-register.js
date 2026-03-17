/* =====================================================
   SERVICE WORKER REGISTRATION
   ===================================================== */
if ("serviceWorker" in navigator) {
    (function () {
        'use strict';

        var refreshing = false;
        var updateIntervalId = 0;
        var assetProbeIntervalId = 0;
        var assetCheckInFlight = false;
        var assetFingerprints = {};
        var swUrl = window.SW_REGISTER_URL || './sw.js';

        navigator.serviceWorker.addEventListener('controllerchange', function () {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });

        window.addEventListener('load', function () {
            navigator.serviceWorker.register(swUrl, { updateViaCache: 'none' })
                .then(function (reg) {
                    forceUpdateCheck(reg);
                    updateIntervalId = setInterval(function () {
                        forceUpdateCheck(reg);
                    }, 30000);
                    primeAssetFingerprints().then(function () {
                        assetProbeIntervalId = setInterval(function () {
                            checkForAssetUpdates();
                        }, 30000);
                    }).catch(function () {});

                    document.addEventListener('visibilitychange', function () {
                        if (document.visibilityState === 'visible') {
                            forceUpdateCheck(reg);
                            checkForAssetUpdates();
                        }
                    });

                    window.addEventListener('pageshow', function () {
                        forceUpdateCheck(reg);
                        checkForAssetUpdates();
                    });

                    if (reg.waiting) {
                        activateWaitingWorker(reg.waiting);
                    }

                    reg.addEventListener('updatefound', function () {
                        var installing = reg.installing;
                        if (!installing) return;

                        installing.addEventListener('statechange', function () {
                            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                                activateWaitingWorker(installing);
                            }
                        });
                    });
                })
                .catch(function (err) {
                    console.warn('SW error:', err);
                });
        });

        function forceUpdateCheck(registration) {
            if (!registration) return;

            registration.update().catch(function () {});
            if (registration.waiting) {
                activateWaitingWorker(registration.waiting);
            }
        }

        function activateWaitingWorker(waitingSW) {
            if (!waitingSW) return;
            waitingSW.postMessage({ type: 'SKIP_WAITING' });
        }

        function getAssetProbeUrls() {
            var urls = [
                '/css/styles.css',
                '/js/utils.js',
                '/js/api.js',
                '/js/sw-register.js'
            ];

            if (window.location.pathname.indexOf('/direct') === 0) {
                urls.push('/direct/index.html', '/direct/direct.css', '/direct/direct.js');
            } else {
                urls.push('/index.html', '/js/app.js', '/js/pin.js', '/js/schedule.js', '/js/clock.js', '/js/admin.js');
            }

            return urls;
        }

        function primeAssetFingerprints() {
            return Promise.all(getAssetProbeUrls().map(fetchAssetFingerprint)).then(function (results) {
                results.forEach(function (result) {
                    if (result && result.url && result.signature) {
                        assetFingerprints[result.url] = result.signature;
                    }
                });
            });
        }

        function checkForAssetUpdates() {
            if (assetCheckInFlight) return;
            assetCheckInFlight = true;

            Promise.all(getAssetProbeUrls().map(fetchAssetFingerprint))
                .then(function (results) {
                    var hasChanges = false;

                    results.forEach(function (result) {
                        if (!result || !result.url || !result.signature) return;

                        if (assetFingerprints[result.url] && assetFingerprints[result.url] !== result.signature) {
                            hasChanges = true;
                        }

                        assetFingerprints[result.url] = result.signature;
                    });

                    if (hasChanges) {
                        window.location.reload();
                    }
                })
                .catch(function () {})
                .then(function () {
                    assetCheckInFlight = false;
                });
        }

        function fetchAssetFingerprint(url) {
            return fetch(url, {
                method: 'HEAD',
                cache: 'no-store'
            }).then(function (response) {
                if (!response.ok) {
                    throw new Error('HEAD request failed');
                }
                return buildFingerprint(url, response);
            }).catch(function () {
                return fetch(url, {
                    cache: 'no-store'
                }).then(function (response) {
                    if (!response.ok) {
                        throw new Error('GET request failed');
                    }
                    return buildFingerprint(url, response);
                }).catch(function () {
                    return null;
                });
            });
        }

        function buildFingerprint(url, response) {
            var etag = response.headers.get('etag') || '';
            var modified = response.headers.get('last-modified') || '';
            var length = response.headers.get('content-length') || '';
            return {
                url: url,
                signature: [etag, modified, length].join('|') || ('status:' + response.status)
            };
        }
    })();
}
