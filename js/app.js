/* =====================================================
   APP - Main router, session, navigation, modal
   ===================================================== */
var App = (function () {
    'use strict';

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
            Pin.openForEmployee('screen-menu');
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
        session = data;
        showMenu();
    }

    function clearSession() {
        session = null;
        Pin.clearPin();
    }

    function getSession() {
        if (!session) return null;

        if (session.expiresAt && new Date(session.expiresAt).getTime() <= Date.now()) {
            clearSession();
            if (currentScreen !== 'screen-menu' && currentScreen !== 'screen-pin') {
                navigate('screen-menu');
            }
            return null;
        }

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
        var loginBtn = document.getElementById('menu-login-btn');
        var logoutBtn = document.getElementById('logout-btn');

        if (activeSession && activeSession.role === 'respondent') {
            greetingEl.textContent = activeSession.employeeName || 'Sesion activa';
            statusEl.textContent = activeSession.currentStatus === 'checked_in' ? 'Entrada registrada' : '';
            ficharCard.classList.remove('hidden');
            paymentCard.classList.remove('hidden');
            adminCard.classList.add('hidden');
            adminShortcut.classList.remove('hidden');
            loginBtn.classList.add('hidden');
            logoutBtn.classList.remove('hidden');
        } else if (activeSession && activeSession.role === 'org_admin') {
            greetingEl.textContent = 'Administrador';
            statusEl.textContent = '';
            ficharCard.classList.remove('hidden');
            paymentCard.classList.add('hidden');
            adminCard.classList.remove('hidden');
            adminShortcut.classList.add('hidden');
            loginBtn.classList.add('hidden');
            logoutBtn.classList.remove('hidden');
        } else {
            greetingEl.textContent = 'Panel publico';
            statusEl.textContent = '';
            ficharCard.classList.remove('hidden');
            paymentCard.classList.add('hidden');
            adminCard.classList.remove('hidden');
            adminShortcut.classList.add('hidden');
            loginBtn.classList.remove('hidden');
            logoutBtn.classList.add('hidden');
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

    document.addEventListener('DOMContentLoaded', function () {
        init();
    });

    return {
        navigate: navigate,
        isScreen: isScreen,
        setSession: setSession,
        getSession: getSession,
        clearSession: clearSession,
        logout: logout,
        hasAdminAccess: hasAdminAccess,
        hasEmployeeAccess: hasEmployeeAccess,
        handleAuthFailure: handleAuthFailure,
        confirm: confirm,
        showMenu: showMenu,
        requestViewportUpdate: requestViewportUpdate
    };
})();
