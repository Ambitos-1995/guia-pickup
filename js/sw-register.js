/* =====================================================
   SERVICE WORKER REGISTRATION
   ===================================================== */
if ("serviceWorker" in navigator) {
    (function () {
        'use strict';

        var refreshing = false;
        var updateIntervalId = 0;

        navigator.serviceWorker.addEventListener('controllerchange', function () {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });

        window.addEventListener('load', function () {
            navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
                .then(function (reg) {
                    forceUpdateCheck(reg);
                    updateIntervalId = setInterval(function () {
                        forceUpdateCheck(reg);
                    }, 30000);

                    document.addEventListener('visibilitychange', function () {
                        if (document.visibilityState === 'visible') {
                            forceUpdateCheck(reg);
                        }
                    });

                    window.addEventListener('pageshow', function () {
                        forceUpdateCheck(reg);
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
    })();
}
