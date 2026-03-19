/* =====================================================
   PIN - PIN entry screen logic
   ===================================================== */
var Pin = (function () {
    'use strict';

    var MAX_PIN_LENGTH = 6;
    var LOGIN_AUTO_VERIFY_DELAY_MS = 1000;
    var currentMaxLength = 6;
    var pin = '';
    var isVerifying = false;
    var mode = 'admin';
    var adminTarget = 'screen-menu';
    var employeeTarget = 'screen-menu';
    var loginAdminTarget = 'screen-menu';
    var backTarget = '';
    var toastTimer = null;
    var loginTimer = null;
    var pinPad = null;

    var toastEl, loadingEl, keypad, promptEl, backBtnEl;

    function init() {
        toastEl = document.getElementById('pin-toast');
        loadingEl = document.getElementById('pin-loading');
        keypad = document.getElementById('pin-keypad');
        promptEl = document.getElementById('pin-prompt');
        backBtnEl = document.getElementById('pin-public-schedule');
        pinPad = PinPad.create({
            dotsEl: document.getElementById('pin-dots'),
            keypadEl: keypad,
            maxLength: currentMaxLength,
            allowKeyboard: true,
            captureWhen: function () {
                return App.isScreen('screen-pin');
            },
            onChange: function (value) {
                pin = value;
                if (loginTimer) { clearTimeout(loginTimer); loginTimer = null; }
                hideError();
                if (mode === 'login' && pin.length === 4) {
                    loginTimer = setTimeout(function () {
                        loginTimer = null;
                        verify();
                    }, LOGIN_AUTO_VERIFY_DELAY_MS);
                }
            },
            onComplete: function () {
                if (mode !== 'login' || currentMaxLength !== MAX_PIN_LENGTH) {
                    setTimeout(verify, 150);
                    return;
                }
                setTimeout(verify, 150);
            },
            onClear: function () {
                var dotsContainer = document.getElementById('pin-dots');
                hideError();
                if (dotsContainer) dotsContainer.classList.remove('shake');
            }
        });

        document.addEventListener('keydown', function (e) {
            if (!App.isScreen('screen-pin') || isVerifying) return;
            if (e.key === 'Enter') {
                verify();
            }
        });

        updateClock();
        setInterval(updateClock, 1000);
    }

    function clearPin() {
        if (loginTimer) { clearTimeout(loginTimer); loginTimer = null; }
        pin = '';
        if (pinPad) {
            pinPad.clear();
            return;
        }
        hideError();
    }

    function setDotCount(count) {
        currentMaxLength = count;
        if (pinPad) pinPad.setMaxLength(count);
    }

    function showError(message) {
        if (toastTimer) clearTimeout(toastTimer);
        toastEl.textContent = message;
        toastEl.classList.add('show');
        if (pinPad) pinPad.shake();

        toastTimer = setTimeout(function () {
            toastEl.classList.remove('show');
        }, 4000);
    }

    function hideError() {
        if (toastTimer) clearTimeout(toastTimer);
        toastEl.classList.remove('show');
    }

    function verify() {
        if (isVerifying) return;
        if (pin.length < 4) {
            showError('Introduce el PIN completo');
            return;
        }

        isVerifying = true;
        loadingEl.classList.remove('hidden');
        if (pinPad) pinPad.setBusy(true);

        var request;
        if (mode === 'login') {
            if (pin.length <= 4) {
                request = Api.verifyPin(pin);
            } else {
                /* 5-6 digits: try employee verify first (admin-role employees),
                   fall back to org super-admin PIN */
                request = Api.verifyPin(pin).then(function (res) {
                    if (res && res.success) return res;
                    return Api.verifyAdminPin(pin);
                });
            }
        } else {
            request = mode === 'admin' ? Api.verifyAdminPin(pin) : Api.verifyPin(pin);
        }
        request.then(function (res) {
            isVerifying = false;
            loadingEl.classList.add('hidden');
            if (pinPad) pinPad.setBusy(false);

            if (!(res && res.success && res.data)) {
                clearPin();
                showError((res && res.message) || 'PIN incorrecto');
                return;
            }

            App.setSession({
                accessToken: res.data.accessToken,
                expiresAt: res.data.expiresAt,
                role: res.data.role || 'respondent',
                employeeId: res.data.employeeId || null,
                employeeName: res.data.employeeName || '',
                organizationId: res.data.organizationId || null,
                currentStatus: res.data.currentStatus || 'not_checked_in'
            });

            if ((res.data.role || 'respondent') === 'respondent' &&
                typeof OfflineClockQueue !== 'undefined' &&
                OfflineClockQueue.rememberVerifiedPin) {
                OfflineClockQueue.rememberVerifiedPin(pin, res.data);
            }

            clearPin();
            if (mode === 'login') {
                if ((res.data.role || 'respondent') === 'org_admin') {
                    App.navigate(loginAdminTarget || 'screen-menu');
                } else {
                    App.navigate(employeeTarget || 'screen-menu');
                }
            }
            else if (mode === 'admin') App.navigate(adminTarget || 'screen-menu');
            else App.navigate(employeeTarget || 'screen-menu');
        }).catch(function () {
            isVerifying = false;
            loadingEl.classList.add('hidden');
            if (pinPad) pinPad.setBusy(false);
            clearPin();
            showError('No se pudo verificar el PIN');
        });
    }

    function updateClock() {
        var now = new Date();
        var clockEl = document.getElementById('pin-clock');
        var dateEl = document.getElementById('pin-date');
        if (clockEl) clockEl.textContent = Utils.formatTime(now);
        if (dateEl) dateEl.textContent = Utils.formatDateLong(now);
    }

    function openForAdmin(targetScreen, returnTarget) {
        mode = 'admin';
        adminTarget = targetScreen || 'screen-menu';
        backTarget = returnTarget || '';
        setDotCount(6);
        clearPin();
        syncBackButton();
        if (promptEl) promptEl.textContent = 'Introduce el PIN de ajustes';
    }

    function openForEmployee(targetScreen) {
        mode = 'employee';
        employeeTarget = targetScreen || 'screen-menu';
        backTarget = '';
        setDotCount(4);
        clearPin();
        syncBackButton();
        if (promptEl) promptEl.textContent = 'Introduce tu PIN de empleado';
    }

    function openForLogin(targetScreen, adminScreen, returnTarget) {
        mode = 'login';
        employeeTarget = targetScreen || 'screen-menu';
        loginAdminTarget = adminScreen || 'screen-menu';
        backTarget = returnTarget || '';
        setDotCount(6);
        clearPin();
        syncBackButton();
        if (promptEl) promptEl.textContent = 'Introduce tu PIN de 4 o 6 cifras';
    }

    function syncBackButton() {
        if (!backBtnEl) return;
        backBtnEl.classList.toggle('hidden', !backTarget);
    }

    function goBack() {
        if (!backTarget) return;
        if (!/^\/(?!\/)/.test(backTarget)) {
            App.navigate('screen-menu');
            return;
        }
        window.location.assign(backTarget);
    }

    return {
        init: init,
        clearPin: clearPin,
        openForAdmin: openForAdmin,
        openForEmployee: openForEmployee,
        openForLogin: openForLogin,
        goBack: goBack
    };
})();
