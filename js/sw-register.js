/* =====================================================
   SERVICE WORKER REGISTRATION
   ===================================================== */
if ("serviceWorker" in navigator) {
    (function () {
        'use strict';

        var refreshing = false;
        var updateIntervalId = 0;
        var screenObserver = null;
        var updateBtn = null;
        var waitingWorker = null;
        var pendingReload = false;
        var swUrl = window.SW_REGISTER_URL || '/sw.js';
        var UPDATE_CHECK_INTERVAL_MS = 5 * 60 * 1000;

        navigator.serviceWorker.addEventListener('controllerchange', function () {
            if (refreshing) return;
            if (!pendingReload) {
                waitingWorker = null;
                syncUpdateButton();
                return;
            }

            refreshing = true;
            window.location.reload();
        });

        if (window.__ENABLE_SW_TEST_API__) {
            window.__swRegisterTestApi = {
                setWaitingWorkerForTest: function () {
                    var messages = [];

                    handleWaitingWorker({
                        __messages: messages,
                        postMessage: function (message) {
                            messages.push(message);
                        }
                    });

                    return true;
                },
                getWaitingWorkerMessages: function () {
                    return waitingWorker && waitingWorker.__messages
                        ? waitingWorker.__messages.slice()
                        : [];
                },
                syncUpdateButtonForTest: syncUpdateButton,
                isSafeToReloadForTest: isSafeToReload,
                requestUpdateForTest: requestUpdate
            };
        }

        window.addEventListener('load', function () {
            updateBtn = document.getElementById('update-btn');
            bindUpdateButton();
            observeScreenState();
            navigator.serviceWorker.register(swUrl, { updateViaCache: 'none' })
                .then(function (reg) {
                    forceUpdateCheck(reg);
                    updateIntervalId = setInterval(function () {
                        forceUpdateCheck(reg);
                    }, UPDATE_CHECK_INTERVAL_MS);

                    document.addEventListener('visibilitychange', function () {
                        if (document.visibilityState === 'visible') {
                            forceUpdateCheck(reg);
                            syncUpdateButton();
                        }
                    });

                    window.addEventListener('pageshow', function () {
                        forceUpdateCheck(reg);
                        syncUpdateButton();
                    });

                    if (reg.waiting) {
                        handleWaitingWorker(reg.waiting);
                    }

                    reg.addEventListener('updatefound', function () {
                        var installing = reg.installing;
                        if (!installing) return;

                        installing.addEventListener('statechange', function () {
                            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
                                handleWaitingWorker(installing);
                            }
                        });
                    });
                })
                .catch(function (err) {
                    console.warn('SW error:', err);
                });

            syncUpdateButton();
        });

        function forceUpdateCheck(registration) {
            if (!registration) return;

            registration.update().catch(function () {});
            if (registration.waiting) {
                handleWaitingWorker(registration.waiting);
            }
        }

        function handleWaitingWorker(waitingSW) {
            if (!waitingSW) return;
            waitingWorker = waitingSW;
            syncUpdateButton();
        }

        function bindUpdateButton() {
            if (!updateBtn) return;

            updateBtn.addEventListener('click', requestUpdate);
        }

        function observeScreenState() {
            var screens;

            if (screenObserver || !window.MutationObserver) return;

            screens = document.querySelectorAll('.screen');
            if (!screens || !screens.length) return;

            screenObserver = new MutationObserver(function () {
                syncUpdateButton();
            });

            Utils.each(screens, function (screen) {
                screenObserver.observe(screen, {
                    attributes: true,
                    attributeFilter: ['class']
                });
            });
        }

        function requestUpdate() {
            if (!waitingWorker || pendingReload || !isSafeToReload()) return;

            pendingReload = true;
            syncUpdateButton();
            waitingWorker.postMessage({ type: 'SKIP_WAITING' });
        }

        function syncUpdateButton() {
            var shouldShow = !!waitingWorker && isSafeToReload() && !pendingReload;

            if (!updateBtn) return;

            updateBtn.classList.toggle('hidden', !shouldShow);
            updateBtn.disabled = !shouldShow;
        }

        function isSafeToReload() {
            if (window.location.pathname.indexOf('/direct') === 0) {
                return true;
            }

            var activeScreen = document.querySelector('.screen.active');
            var screenId = activeScreen ? activeScreen.id : '';
            return screenId === 'screen-pin' || screenId === 'screen-menu';
        }
    })();
}
