/* =====================================================
   APP - Main router, session, navigation, modal
   ===================================================== */
var App = (function () {
    'use strict';

    var APP_VERSION = '2026.03.16-r1';
    var SESSION_STORAGE_KEY = 'pickup-tmg-session-v1';
    var EMPLOYEE_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
    var ADMIN_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

    var session = null;
    var currentScreen = 'screen-menu';
    var menuClockTimer = null;
    var modalCallback = null;
    var viewportRaf = 0;

    function init() {
        bindViewportState();
        Pin.init();
        Schedule.init();
        Clock.init();
        Guia.init();
        Payment.init();
        Admin.init();
        Install.init();
        restoreSession();

        Utils.delegatePress(document.getElementById('menu-grid'), '.menu-card', function (e, card) {
            if (card.id === 'card-admin') {
                if (hasAdminAccess()) {
                    navigate('screen-admin');
                } else {
                    Pin.openForAdmin();
                    navigate('screen-pin');
                }
                return;
            }

            if (card.id === 'card-fichar') {
                if (hasEmployeeAccess()) {
                    navigate('screen-clock');
                } else {
                    Pin.openForEmployee('screen-clock');
                    navigate('screen-pin');
                }
                return;
            }

            if (card.id === 'card-payment' && !hasEmployeeAccess()) {
                Pin.openForEmployee('screen-payment');
                navigate('screen-pin');
                return;
            }

            var target = card.dataset.screen;
            if (target) navigate(target);
        });

        Utils.bindPress(document.getElementById('pin-public-schedule'), function () {
            navigate('screen-menu');
        });

        Utils.each(document.querySelectorAll('.back-btn[data-back]'), function (btn) {
            Utils.bindPress(btn, function () {
                navigate(btn.dataset.back);
            });
        });

        Utils.bindPress(document.getElementById('logout-btn'), logout);
        Utils.bindPress(document.getElementById('menu-admin-shortcut'), function () {
            if (hasAdminAccess()) {
                navigate('screen-admin');
            } else {
                Pin.openForAdmin();
                navigate('screen-pin');
            }
        });
        Utils.bindPress(document.getElementById('menu-login-btn'), function () {
            Pin.openForLogin('screen-menu');
            navigate('screen-pin');
        });

        Utils.bindPress(document.getElementById('modal-cancel'), closeModal);
        Utils.bindPress(document.getElementById('modal-ok'), function () {
            var cb = modalCallback;
            closeModal();
            if (cb) cb();
        });

        var menuEl = document.getElementById('screen-menu');
        if (menuEl) menuEl.classList.add('no-transition');
        navigate('screen-menu');
        requestAnimationFrame(function () {
            if (menuEl) menuEl.classList.remove('no-transition');
        });

        try { Realtime.init(); } catch (e) { console.warn('Realtime init failed:', e); }
    }

    function navigate(screenId) {
        var isBack = (screenId === 'screen-menu');
        var leavingEl = currentScreen ? document.getElementById(currentScreen) : null;

        if (currentScreen === 'screen-clock') {
            Clock.hide();
        }
        if (currentScreen === 'screen-menu' && menuClockTimer) {
            clearInterval(menuClockTimer);
            menuClockTimer = null;
        }

        Utils.each(document.querySelectorAll('.screen'), function (screen) {
            screen.classList.remove('active', 'leaving');
        });

        // Animate the leaving screen
        if (leavingEl && currentScreen !== screenId) {
            if (!isBack) {
                // Going forward: old screen slides left
                leavingEl.classList.add('leaving');
            }
            // Going back: old screen slides right (default translateX(8%) via CSS)
        }

        var target = document.getElementById(screenId);
        if (target) target.classList.add('active');
        currentScreen = screenId;
        requestViewportUpdate();

        if (screenId === 'screen-menu') showMenu();
        if (screenId === 'screen-schedule') Schedule.show();
        if (screenId === 'screen-clock') Clock.show();
        if (screenId === 'screen-guia') Guia.show();
        if (screenId === 'screen-payment') Payment.show();
        if (screenId === 'screen-admin') Admin.show();
    }

    function isScreen(screenId) {
        return currentScreen === screenId;
    }

    function setSession(data) {
        session = normalizeSession(data);
        persistSession();
        showMenu();
    }

    function clearSession() {
        session = null;
        persistSession();
        Pin.clearPin();
    }

    function getSession() {
        if (!session) return null;

        if (isSessionExpired(session)) {
            clearSession();
            if (currentScreen !== 'screen-menu' && currentScreen !== 'screen-pin') {
                navigate('screen-menu');
            }
            return null;
        }

        return session;
    }

    function touchSession() {
        if (!session) return null;

        var idleTimeoutMs = getIdleTimeoutMs(session.role);
        if (!idleTimeoutMs) return session;

        var absoluteExpiryMs = parseExpiry(session.expiresAt);
        var nextIdleExpiryMs = Date.now() + idleTimeoutMs;

        if (absoluteExpiryMs) {
            nextIdleExpiryMs = Math.min(nextIdleExpiryMs, absoluteExpiryMs);
        }

        session.idleExpiresAt = new Date(nextIdleExpiryMs).toISOString();
        persistSession();
        return session;
    }

    function logout() {
        clearSession();
        navigate('screen-menu');
    }

    function handleAuthFailure(message) {
        clearSession();
        navigate('screen-menu');
        if (message) {
            confirm('Sesion caducada', message, null);
        }
    }

    function showMenu() {
        var activeSession = getSession();
        var greetingEl = document.getElementById('greeting');
        var statusEl = document.getElementById('fichar-status');
        var ficharCard = document.getElementById('card-fichar');
        var paymentCard = document.getElementById('card-payment');
        var adminCard = document.getElementById('card-admin');
        var adminShortcut = document.getElementById('menu-admin-shortcut');
        var adminBuildVersion = document.getElementById('admin-build-version');
        var loginBtn = document.getElementById('menu-login-btn');
        var logoutBtn = document.getElementById('logout-btn');

        if (activeSession && activeSession.role === 'respondent') {
            greetingEl.textContent = activeSession.employeeName || 'Sesion activa';
            statusEl.textContent = activeSession.currentStatus === 'checked_in'
                ? 'Entrada registrada'
                : activeSession.currentStatus === 'checked_out'
                ? 'Turno completado'
                : '';
            ficharCard.classList.remove('hidden');
            paymentCard.classList.remove('hidden');
            adminCard.classList.add('hidden');
            adminShortcut.classList.add('hidden');
            loginBtn.classList.add('hidden');
            logoutBtn.classList.remove('hidden');
            if (adminBuildVersion) adminBuildVersion.classList.add('hidden');
        } else if (activeSession && activeSession.role === 'org_admin') {
            greetingEl.textContent = 'Administrador';
            statusEl.textContent = '';
            ficharCard.classList.remove('hidden');
            paymentCard.classList.add('hidden');
            adminCard.classList.remove('hidden');
            adminShortcut.classList.remove('hidden');
            loginBtn.classList.add('hidden');
            logoutBtn.classList.remove('hidden');
            if (adminBuildVersion) {
                adminBuildVersion.textContent = 'Version ' + APP_VERSION;
                adminBuildVersion.classList.remove('hidden');
            }
        } else {
            greetingEl.textContent = 'Panel publico';
            statusEl.textContent = '';
            ficharCard.classList.remove('hidden');
            paymentCard.classList.add('hidden');
            adminCard.classList.remove('hidden');
            adminShortcut.classList.add('hidden');
            loginBtn.classList.remove('hidden');
            logoutBtn.classList.add('hidden');
            if (adminBuildVersion) adminBuildVersion.classList.add('hidden');
        }

        // Toggle odd-cards class for full-width Ajustes on mobile
        var menuGrid = document.getElementById('menu-grid');
        var visibleCards = document.querySelectorAll('#menu-grid > .menu-card:not(.hidden)');
        menuGrid.classList.toggle('odd-cards', visibleCards.length % 2 === 1);
        menuGrid.setAttribute('data-card-count', String(visibleCards.length));

        if (currentScreen !== 'screen-menu') {
            if (menuClockTimer) {
                clearInterval(menuClockTimer);
                menuClockTimer = null;
            }
            return;
        }

        if (menuClockTimer) clearInterval(menuClockTimer);
        updateMenuClock();
        menuClockTimer = setInterval(updateMenuClock, 1000);
    }

    function updateMenuClock() {
        var el = document.getElementById('menu-clock');
        if (el) el.textContent = Utils.formatTime(new Date());
    }

    function bindViewportState() {
        updateViewportState();

        window.addEventListener('resize', requestViewportUpdate, { passive: true });
        window.addEventListener('orientationchange', requestViewportUpdate, { passive: true });

        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', requestViewportUpdate, { passive: true });
            window.visualViewport.addEventListener('scroll', requestViewportUpdate, { passive: true });
        }
    }

    function requestViewportUpdate() {
        if (viewportRaf) {
            cancelAnimationFrame(viewportRaf);
        }

        viewportRaf = requestAnimationFrame(function () {
            viewportRaf = 0;
            updateViewportState();
        });
    }

    function updateViewportState() {
        var root = document.documentElement;
        var layoutHeight = Math.round(window.innerHeight || root.clientHeight || 0);
        var vv = window.visualViewport;
        var viewportHeight = vv ? Math.round(vv.height) : layoutHeight;
        var viewportOffsetTop = vv ? Math.round(vv.offsetTop) : 0;
        var viewportOffsetBottom = vv ? Math.max(0, Math.round(layoutHeight - (vv.height + vv.offsetTop))) : 0;
        var keyboardGap = vv ? layoutHeight - (vv.height + vv.offsetTop) : 0;

        root.style.setProperty('--app-height', layoutHeight + 'px');
        root.style.setProperty('--visual-viewport-height', viewportHeight + 'px');
        root.style.setProperty('--visual-viewport-offset-top', viewportOffsetTop + 'px');
        root.style.setProperty('--visual-viewport-offset-bottom', viewportOffsetBottom + 'px');
        root.classList.toggle('keyboard-open', keyboardGap > 120);
    }

    function confirm(title, body, onOk) {
        var modal = document.getElementById('modal-confirm');
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').textContent = body;
        modalCallback = onOk;

        var cancelBtn = document.getElementById('modal-cancel');
        if (onOk) cancelBtn.classList.remove('hidden');
        else cancelBtn.classList.add('hidden');

        modal.classList.remove('hidden');
    }

    function closeModal() {
        document.getElementById('modal-confirm').classList.add('hidden');
        modalCallback = null;
    }

    function hasAdminAccess() {
        var activeSession = getSession();
        return !!(activeSession && activeSession.role === 'org_admin');
    }

    function hasEmployeeAccess() {
        var activeSession = getSession();
        return !!(activeSession && activeSession.role === 'respondent');
    }

    function restoreSession() {
        var stored = readStoredSession();
        if (!stored) return;

        session = normalizeSession(stored);
        if (!session || isSessionExpired(session)) {
            session = null;
            persistSession();
        }
    }

    function normalizeSession(data) {
        if (!data || typeof data !== 'object') return null;

        var normalized = {
            accessToken: typeof data.accessToken === 'string' ? data.accessToken : '',
            expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : '',
            idleExpiresAt: typeof data.idleExpiresAt === 'string' ? data.idleExpiresAt : '',
            role: data.role === 'org_admin' ? 'org_admin' : 'respondent',
            employeeId: data.employeeId || null,
            employeeName: typeof data.employeeName === 'string' ? data.employeeName : '',
            organizationId: data.organizationId || null,
            currentStatus: typeof data.currentStatus === 'string' ? data.currentStatus : 'not_checked_in'
        };

        if (!normalized.accessToken || !normalized.expiresAt) {
            return null;
        }

        if (!normalized.idleExpiresAt) {
            normalized.idleExpiresAt = createIdleExpiry(normalized.role, normalized.expiresAt);
        }

        return normalized;
    }

    function isSessionExpired(data) {
        if (!data) return true;

        var now = Date.now();
        var absoluteExpiryMs = parseExpiry(data.expiresAt);
        var idleExpiryMs = parseExpiry(data.idleExpiresAt);

        if (absoluteExpiryMs && absoluteExpiryMs <= now) return true;
        if (idleExpiryMs && idleExpiryMs <= now) return true;
        return false;
    }

    function createIdleExpiry(role, absoluteExpiry) {
        var idleTimeoutMs = getIdleTimeoutMs(role);
        if (!idleTimeoutMs) return absoluteExpiry || '';

        var absoluteExpiryMs = parseExpiry(absoluteExpiry);
        var nextIdleExpiryMs = Date.now() + idleTimeoutMs;

        if (absoluteExpiryMs) {
            nextIdleExpiryMs = Math.min(nextIdleExpiryMs, absoluteExpiryMs);
        }

        return new Date(nextIdleExpiryMs).toISOString();
    }

    function getIdleTimeoutMs(role) {
        return role === 'org_admin' ? ADMIN_IDLE_TIMEOUT_MS : EMPLOYEE_IDLE_TIMEOUT_MS;
    }

    function parseExpiry(value) {
        if (!value) return 0;
        var timestamp = new Date(value).getTime();
        return isNaN(timestamp) ? 0 : timestamp;
    }

    function persistSession() {
        try {
            if (!window.localStorage) return;

            if (session) {
                window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
            } else {
                window.localStorage.removeItem(SESSION_STORAGE_KEY);
            }
        } catch (error) {
            console.warn('Session persistence unavailable:', error);
        }
    }

    function readStoredSession() {
        try {
            if (!window.localStorage) return null;
            var raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (error) {
            console.warn('Stored session could not be restored:', error);
            return null;
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        init();
    });

    return {
        navigate: navigate,
        isScreen: isScreen,
        setSession: setSession,
        getSession: getSession,
        clearSession: clearSession,
        touchSession: touchSession,
        logout: logout,
        hasAdminAccess: hasAdminAccess,
        hasEmployeeAccess: hasEmployeeAccess,
        handleAuthFailure: handleAuthFailure,
        confirm: confirm,
        showMenu: showMenu,
        requestViewportUpdate: requestViewportUpdate,
        getVersion: function () { return APP_VERSION; }
    };
})();
