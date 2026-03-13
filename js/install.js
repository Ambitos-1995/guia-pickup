/* =====================================================
   INSTALL - PWA install prompt (Android + iOS)
   ===================================================== */
var Install = (function () {
    'use strict';

    var STORAGE_KEY = 'pickup_install_dismissed';
    var RESHOW_DAYS = 7;
    var deferredPrompt = null;
    var layoutSyncRaf = 0;

    var androidBanner, iosBanner;

    function init() {
        // Don't show if already installed (standalone mode)
        if (window.matchMedia('(display-mode: standalone)').matches ||
            window.navigator.standalone === true) {
            return;
        }

        androidBanner = document.getElementById('install-banner-android');
        iosBanner = document.getElementById('install-banner-ios');

        if (!androidBanner || !iosBanner) return;

        // Check if previously dismissed within RESHOW_DAYS
        if (wasDismissedRecently()) return;

        window.addEventListener('resize', scheduleLayoutSync, { passive: true });
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', scheduleLayoutSync, { passive: true });
            window.visualViewport.addEventListener('scroll', scheduleLayoutSync, { passive: true });
        }

        // Android / Chrome: intercept beforeinstallprompt
        window.addEventListener('beforeinstallprompt', function (e) {
            e.preventDefault();
            deferredPrompt = e;
            // Show after a short delay (not immediately on load)
            setTimeout(function () { showAndroidBanner(); }, 3000);
        });

        // iOS Safari detection
        if (isIOSSafari()) {
            setTimeout(function () { showIOSBanner(); }, 3000);
        }

        // Dismiss buttons
        var dismissBtns = document.querySelectorAll('.install-dismiss');
        for (var i = 0; i < dismissBtns.length; i++) {
            Utils.bindPress(dismissBtns[i], dismissAll);
        }

        // Android install button
        var installBtn = document.getElementById('install-btn-android');
        if (installBtn) {
            Utils.bindPress(installBtn, triggerInstall);
        }

        // Hide banner if app gets installed
        window.addEventListener('appinstalled', function () {
            dismissAll();
        });
    }

    function isIOSSafari() {
        var ua = window.navigator.userAgent;
        var isIOS = /iPad|iPhone|iPod/.test(ua) ||
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        var isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(ua);
        return isIOS && isSafari;
    }

    function wasDismissedRecently() {
        try {
            var ts = localStorage.getItem(STORAGE_KEY);
            if (!ts) return false;
            var diff = Date.now() - parseInt(ts, 10);
            return diff < RESHOW_DAYS * 24 * 60 * 60 * 1000;
        } catch (e) {
            return false;
        }
    }

    function saveDismissal() {
        try {
            localStorage.setItem(STORAGE_KEY, String(Date.now()));
        } catch (e) { /* ignore */ }
    }

    function showAndroidBanner() {
        if (!deferredPrompt) return;
        androidBanner.classList.remove('hidden');
        androidBanner.classList.add('install-banner-visible');
        scheduleLayoutSync();
    }

    function showIOSBanner() {
        iosBanner.classList.remove('hidden');
        iosBanner.classList.add('install-banner-visible');
        scheduleLayoutSync();
    }

    function dismissAll() {
        saveDismissal();
        androidBanner.classList.add('hidden');
        androidBanner.classList.remove('install-banner-visible');
        iosBanner.classList.add('hidden');
        iosBanner.classList.remove('install-banner-visible');
        scheduleLayoutSync();
    }

    function triggerInstall() {
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(function () {
            deferredPrompt = null;
            dismissAll();
        });
    }

    function scheduleLayoutSync() {
        if (layoutSyncRaf) cancelAnimationFrame(layoutSyncRaf);
        layoutSyncRaf = requestAnimationFrame(function () {
            layoutSyncRaf = 0;
            syncBannerLayout();
        });
    }

    function syncBannerLayout() {
        var banner = getVisibleBanner();
        var offset = 0;

        if (banner) {
            offset = Math.ceil(banner.getBoundingClientRect().height) + 12;
        }

        document.documentElement.style.setProperty('--install-banner-offset', offset + 'px');
        document.documentElement.classList.toggle('install-banner-active', offset > 0);

        if (window.App && typeof window.App.requestViewportUpdate === 'function') {
            window.App.requestViewportUpdate();
        }
    }

    function getVisibleBanner() {
        if (androidBanner && !androidBanner.classList.contains('hidden') && androidBanner.classList.contains('install-banner-visible')) {
            return androidBanner;
        }

        if (iosBanner && !iosBanner.classList.contains('hidden') && iosBanner.classList.contains('install-banner-visible')) {
            return iosBanner;
        }

        return null;
    }

    return { init: init };
})();
