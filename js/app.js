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
    var currentScreen = 'screen-pin';
    var menuClockTimer = null;
    var modalCallback = null;
    var viewportRaf = 0;
    var launchScreen = '';
    var launchReturnPath = '';

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
        launchScreen = consumeLaunchScreen();

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
            if (window.Pin && typeof window.Pin.goBack === 'function') {
                Pin.goBack();
            }
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
        Utils.bindPress(document.getElementById('menu-direct-shortcut'), function () {
            window.location.assign('/direct/');
        });
        Utils.bindPress(document.getElementById('menu-login-btn'), function () {
            Pin.openForLogin('screen-menu', 'screen-menu');
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
        navigate(resolveInitialScreen());
        requestAnimationFrame(function () {
            if (menuEl) menuEl.classList.remove('no-transition');
        });

        try { Realtime.init(); } catch (e) { console.warn('Realtime init failed:', e); }
    }

    function navigate(screenId) {
        if (!canAccessScreen(screenId)) {
            if (!hasAuthenticatedAccess()) {
                if (screenId !== 'screen-menu' && screenId !== 'screen-pin') {
                    Pin.openForLogin('screen-menu', 'screen-menu');
                }
                screenId = 'screen-pin';
            } else {
                screenId = 'screen-menu';
            }
        }

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
            if (currentScreen !== 'screen-pin') {
                Pin.openForLogin('screen-menu', 'screen-menu');
                navigate('screen-pin');
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
        Pin.openForLogin('screen-menu', 'screen-menu');
        navigate('screen-pin');
    }

    function handleAuthFailure(message) {
        clearSession();
        Pin.openForLogin('screen-menu', 'screen-menu');
        navigate('screen-pin');
        if (message) {
            confirm('Sesion caducada', message, null);
        }
    }

    function showMenu() {
        var activeSession = getSession();
        var greetingEl = document.getElementById('greeting');
        var statusEl = document.getElementById('fichar-status');
        var scheduleCard = document.getElementById('card-schedule');
        var guiaCard = document.getElementById('card-guia');
        var ficharCard = document.getElementById('card-fichar');
        var paymentCard = document.getElementById('card-payment');
        var adminCard = document.getElementById('card-admin');
        var adminShortcut = document.getElementById('menu-admin-shortcut');
        var directShortcut = document.getElementById('menu-direct-shortcut');
        var adminBuildVersion = document.getElementById('admin-build-version');
        var loginBtn = document.getElementById('menu-login-btn');
        var logoutBtn = document.getElementById('logout-btn');
        var canAccessPersonalScreens = !!activeSession;

        setMenuCardLocked(scheduleCard, false);
        setMenuCardLocked(guiaCard, false);

        if (activeSession && activeSession.role === 'respondent') {
            greetingEl.textContent = activeSession.employeeName || 'Sesion activa';
            statusEl.textContent = activeSession.currentStatus === 'checked_in'
                ? 'Entrada registrada'
                : activeSession.currentStatus === 'checked_out'
                ? 'Turno completado'
                : '';
            ficharCard.classList.remove('hidden');
            scheduleCard.classList.remove('hidden');
            guiaCard.classList.remove('hidden');
            paymentCard.classList.remove('hidden');
            adminCard.classList.add('hidden');
            adminShortcut.classList.add('hidden');
            directShortcut.classList.add('hidden');
            loginBtn.classList.add('hidden');
            logoutBtn.classList.remove('hidden');
            if (adminBuildVersion) adminBuildVersion.classList.add('hidden');
        } else if (activeSession && activeSession.role === 'org_admin') {
            greetingEl.textContent = 'Administrador';
            statusEl.textContent = '';
            ficharCard.classList.add('hidden');
            scheduleCard.classList.add('hidden');
            guiaCard.classList.add('hidden');
            paymentCard.classList.add('hidden');
            adminCard.classList.remove('hidden');
            adminShortcut.classList.remove('hidden');
            directShortcut.classList.remove('hidden');
            loginBtn.classList.add('hidden');
            logoutBtn.classList.remove('hidden');
            if (adminBuildVersion) {
                adminBuildVersion.textContent = 'Version ' + APP_VERSION;
                adminBuildVersion.classList.remove('hidden');
            }
        } else {
            greetingEl.textContent = 'Acceso interno';
            statusEl.textContent = '';
            setMenuCardLocked(scheduleCard, !canAccessPersonalScreens);
            setMenuCardLocked(guiaCard, !canAccessPersonalScreens);
            ficharCard.classList.add('hidden');
            scheduleCard.classList.add('hidden');
            guiaCard.classList.add('hidden');
            paymentCard.classList.add('hidden');
            adminCard.classList.add('hidden');
            adminShortcut.classList.add('hidden');
            directShortcut.classList.add('hidden');
            loginBtn.classList.add('hidden');
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

    function resolveInitialScreen() {
        if (launchScreen === 'admin') {
            launchScreen = '';
            if (hasAdminAccess()) {
                return 'screen-admin';
            }
            Pin.openForAdmin('screen-admin', launchReturnPath);
            launchReturnPath = '';
            return 'screen-pin';
        }

        if (launchScreen === 'admin-home') {
            launchScreen = '';
            if (hasAdminAccess()) {
                return 'screen-menu';
            }
            Pin.openForAdmin('screen-menu', launchReturnPath);
            launchReturnPath = '';
            return 'screen-pin';
        }

        launchReturnPath = '';
        if (hasAdminAccess()) {
            return 'screen-menu';
        }
        if (hasEmployeeAccess()) {
            return 'screen-menu';
        }

        Pin.openForLogin('screen-menu', 'screen-menu');
        launchScreen = '';
        return 'screen-pin';
    }

    function consumeLaunchScreen() {
        if (typeof window === 'undefined' || !window.location) return '';

        var url = new URL(window.location.href);
        var screen = String(url.searchParams.get('screen') || '').trim();
        launchReturnPath = String(url.searchParams.get('return') || '').trim();
        if (!screen) return '';

        url.searchParams.delete('screen');
        url.searchParams.delete('return');
        if (window.history && window.history.replaceState) {
            window.history.replaceState({}, '', url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : '') + url.hash);
        }

        return screen;
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

    function hasAuthenticatedAccess() {
        return !!getSession();
    }

    function canAccessScreen(screenId) {
        if (screenId === 'screen-pin') return true;
        if (screenId === 'screen-menu') return hasAuthenticatedAccess();
        if (screenId === 'screen-schedule' || screenId === 'screen-guia') return hasAuthenticatedAccess();
        if (screenId === 'screen-clock' || screenId === 'screen-payment') return hasEmployeeAccess();
        if (screenId === 'screen-admin') return hasAdminAccess();
        return true;
    }

    function setMenuCardLocked(card, locked) {
        if (!card) return;
        card.disabled = !!locked;
        card.setAttribute('aria-disabled', locked ? 'true' : 'false');
        card.classList.toggle('is-locked', !!locked);
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
        hasAuthenticatedAccess: hasAuthenticatedAccess,
        handleAuthFailure: handleAuthFailure,
        confirm: confirm,
        showMenu: showMenu,
        requestViewportUpdate: requestViewportUpdate,
        getVersion: function () { return APP_VERSION; }
    };
})();
