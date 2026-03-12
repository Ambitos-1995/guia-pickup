/* =====================================================
   APP - Main router, session, navigation, modal
   ===================================================== */
var App = (function () {
    'use strict';

    var session = null;
    var currentScreen = 'screen-menu';
    var menuClockTimer = null;
    var modalCallback = null;

    function init() {
        // Init all modules
        Pin.init();
        Schedule.init();
        Clock.init();
        Guia.init();
        Payment.init();
        Admin.init();
        Install.init();

        // Menu card navigation
        document.getElementById('menu-grid').addEventListener('click', function (e) {
            var card = e.target.closest('.menu-card');
            if (!card) return;

            // Admin always requires PIN
            if (card.id === 'card-admin') {
                Pin.openForAdmin();
                navigate('screen-pin');
                return;
            }

            // Fichar always requires employee PIN
            if (card.id === 'card-fichar') {
                Pin.openForEmployee('screen-clock');
                navigate('screen-pin');
                return;
            }

            var target = card.dataset.screen;
            if (target) navigate(target);
        });

        document.getElementById('pin-public-schedule').addEventListener('click', function () {
            navigate('screen-menu');
        });

        // All back buttons
        document.querySelectorAll('.back-btn[data-back]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                navigate(btn.dataset.back);
            });
        });

        // Logout
        document.getElementById('logout-btn').addEventListener('click', logout);

        // Modal
        document.getElementById('modal-cancel').addEventListener('click', closeModal);
        document.getElementById('modal-ok').addEventListener('click', function () {
            var cb = modalCallback;
            closeModal();
            if (cb) cb();
        });

        navigate('screen-menu');
    }

    // ---- NAVIGATION ----

    function navigate(screenId) {
        // Leave current screen — clear session when leaving admin or clock
        if (currentScreen === 'screen-admin') {
            session = null;
            Pin.clearPin();
        }
        if (currentScreen === 'screen-clock') {
            Clock.hide();
            session = null;
            Pin.clearPin();
        }
        if (currentScreen === 'screen-menu' && menuClockTimer) {
            clearInterval(menuClockTimer);
            menuClockTimer = null;
        }

        // Switch screens
        var screens = document.querySelectorAll('.screen');
        screens.forEach(function (s) { s.classList.remove('active'); });
        var target = document.getElementById(screenId);
        if (target) target.classList.add('active');
        currentScreen = screenId;

        // Enter new screen
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

    // ---- SESSION ----

    function setSession(data) {
        session = data;
    }

    function getSession() {
        return session;
    }

    function logout() {
        session = null;
        Pin.clearPin();
        navigate('screen-menu');
    }

    // ---- MENU ----

    function showMenu() {
        var greetingEl = document.getElementById('greeting');
        var statusEl = document.getElementById('fichar-status');
        var ficharCard = document.getElementById('card-fichar');
        var paymentCard = document.getElementById('card-payment');
        var adminCard = document.getElementById('card-admin');
        var logoutBtn = document.getElementById('logout-btn');

        // Public menu — Fichar always visible, requires PIN on tap
        greetingEl.textContent = 'Panel publico';
        statusEl.textContent = '';
        ficharCard.classList.remove('hidden');
        paymentCard.classList.add('hidden');
        adminCard.classList.remove('hidden');
        logoutBtn.classList.add('hidden');

        // Menu clock
        updateMenuClock();
        menuClockTimer = setInterval(updateMenuClock, 1000);
    }

    function updateMenuClock() {
        var el = document.getElementById('menu-clock');
        if (el) el.textContent = Utils.formatTime(new Date());
    }

    // ---- MODAL ----

    function confirm(title, body, onOk) {
        var modal = document.getElementById('modal-confirm');
        document.getElementById('modal-title').textContent = title;
        document.getElementById('modal-body').textContent = body;
        modalCallback = onOk;

        // Hide cancel button if no callback (info-only modal)
        var cancelBtn = document.getElementById('modal-cancel');
        if (onOk) {
            cancelBtn.classList.remove('hidden');
        } else {
            cancelBtn.classList.add('hidden');
        }

        modal.classList.remove('hidden');
    }

    function closeModal() {
        document.getElementById('modal-confirm').classList.add('hidden');
        modalCallback = null;
    }

    function hasAdminAccess() {
        return !!(session && (session.role === 'admin' || session.role === 'org_admin'));
    }

    // ---- BOOTSTRAP ----

    document.addEventListener('DOMContentLoaded', function () {
        init();
    });

    return {
        navigate: navigate,
        isScreen: isScreen,
        setSession: setSession,
        getSession: getSession,
        hasAdminAccess: hasAdminAccess,
        confirm: confirm
    };
})();
