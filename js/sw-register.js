/* =====================================================
   SERVICE WORKER REGISTRATION
   ===================================================== */
if ("serviceWorker" in navigator) {
    (function () {
        'use strict';

        var refreshing = false;

        navigator.serviceWorker.addEventListener('controllerchange', function () {
            if (refreshing) return;
            refreshing = true;
            window.location.reload();
        });

        window.addEventListener('load', function () {
            navigator.serviceWorker.register('./sw.js')
                .then(function (reg) {
                    setInterval(function () { reg.update(); }, 60000);

                    document.addEventListener('visibilitychange', function () {
                        if (document.visibilityState === 'visible') {
                            reg.update();
                        }
                    });

                    if (reg.waiting) {
                        showUpdateButton(reg.waiting);
                    }

                    reg.addEventListener('updatefound', function () {
                        var installing = reg.installing;
                        if (!installing) return;

                        installing.addEventListener('statechange', function () {
                            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                                showUpdateButton(installing);
                            }
                        });
                    });
                })
                .catch(function (err) {
                    console.warn('SW error:', err);
                });
        });

        function showUpdateButton(waitingSW) {
            var btn = document.getElementById('update-btn');
            if (!btn) return;

            btn.classList.remove('hidden');
            Utils.addPressListener(btn, function () {
                btn.textContent = 'Actualizando...';
                btn.disabled = true;
                waitingSW.postMessage({ type: 'SKIP_WAITING' });
            });
        }
    })();
}
