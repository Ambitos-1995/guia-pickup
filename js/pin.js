/* =====================================================
   PIN - PIN entry screen logic
   ===================================================== */
var Pin = (function () {
    'use strict';

    var MAX_PIN_LENGTH = 6;
    var currentMaxLength = 6;
    var pin = '';
    var isVerifying = false;
    var mode = 'admin';
    var employeeTarget = 'screen-clock';
    var toastTimer = null;
    var loginTimer = null;

    var dots, toastEl, loadingEl, keypad, promptEl;

    function init() {
        dots = document.querySelectorAll('.pin-dot');
        toastEl = document.getElementById('pin-toast');
        loadingEl = document.getElementById('pin-loading');
        keypad = document.getElementById('pin-keypad');
        promptEl = document.getElementById('pin-prompt');

        keypad.addEventListener('click', function (e) {
            var btn = e.target.closest('.key-btn');
            if (!btn || isVerifying) return;

            var key = btn.dataset.key;
            if (key === 'clear') clearPin();
            else if (key && pin.length < currentMaxLength) addDigit(key);
        });

        document.addEventListener('keydown', function (e) {
            if (!App.isScreen('screen-pin') || isVerifying) return;
            if (e.key >= '0' && e.key <= '9') addDigit(e.key);
            else if (e.key === 'Backspace' && pin.length > 0) {
                pin = pin.slice(0, -1);
                updateDots();
            } else if (e.key === 'Enter') {
                verify();
            }
        });

        updateClock();
        setInterval(updateClock, 1000);
    }

    function addDigit(digit) {
        if (pin.length >= currentMaxLength) return;
        if (loginTimer) { clearTimeout(loginTimer); loginTimer = null; }
        pin += digit;
        updateDots();
        hideError();
        if (mode === 'login' && pin.length === 4) {
            loginTimer = setTimeout(function () { loginTimer = null; verify(); }, 500);
        } else if (pin.length === currentMaxLength) {
            setTimeout(verify, 150);
        }
    }

    function clearPin() {
        if (loginTimer) { clearTimeout(loginTimer); loginTimer = null; }
        pin = '';
        updateDots();
        hideError();
    }

    function setDotCount(count) {
        currentMaxLength = count;
        dots.forEach(function (dot, index) {
            dot.style.display = index < count ? '' : 'none';
        });
    }

    function updateDots() {
        dots.forEach(function (dot, index) {
            dot.classList.toggle('filled', index < pin.length);
        });
    }

    function showError(message) {
        if (toastTimer) clearTimeout(toastTimer);
        toastEl.textContent = message;
        toastEl.classList.add('show');
        toastTimer = setTimeout(function () {
            toastEl.classList.remove('show');
        }, 2500);
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
        keypad.style.opacity = '0.5';
        keypad.style.pointerEvents = 'none';

        var request;
        if (mode === 'login') {
            request = pin.length <= 4 ? Api.verifyPin(pin) : Api.verifyAdminPin(pin);
        } else {
            request = mode === 'admin' ? Api.verifyAdminPin(pin) : Api.verifyPin(pin);
        }
        request.then(function (res) {
            isVerifying = false;
            loadingEl.classList.add('hidden');
            keypad.style.opacity = '1';
            keypad.style.pointerEvents = 'auto';

            if (!(res && res.success && res.data)) {
                showError((res && res.message) || 'PIN incorrecto');
                clearPin();
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

            clearPin();
            if (mode === 'login') App.navigate(employeeTarget || 'screen-menu');
            else if (mode === 'admin') App.navigate('screen-admin');
            else App.navigate(employeeTarget || 'screen-clock');
        });
    }

    function updateClock() {
        var now = new Date();
        var clockEl = document.getElementById('pin-clock');
        var dateEl = document.getElementById('pin-date');
        if (clockEl) clockEl.textContent = Utils.formatTime(now);
        if (dateEl) dateEl.textContent = Utils.formatDateLong(now);
    }

    function openForAdmin() {
        mode = 'admin';
        setDotCount(6);
        clearPin();
        if (promptEl) promptEl.textContent = 'Introduce el PIN de ajustes';
    }

    function openForEmployee(targetScreen) {
        mode = 'employee';
        employeeTarget = targetScreen || 'screen-clock';
        setDotCount(4);
        clearPin();
        if (promptEl) promptEl.textContent = 'Introduce tu PIN de empleado';
    }

    function openForLogin(targetScreen) {
        mode = 'login';
        employeeTarget = targetScreen || 'screen-menu';
        setDotCount(6);
        clearPin();
        if (promptEl) promptEl.textContent = 'Introduce tu PIN (4 o 6 digitos)';
    }

    return {
        init: init,
        clearPin: clearPin,
        openForAdmin: openForAdmin,
        openForEmployee: openForEmployee,
        openForLogin: openForLogin
    };
})();
