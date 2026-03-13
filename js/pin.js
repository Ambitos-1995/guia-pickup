/* =====================================================
   PIN - PIN entry screen logic
   ===================================================== */
var Pin = (function () {
    'use strict';

    var MAX_PIN_LENGTH = 8;
    var pin = '';
    var isVerifying = false;
    var mode = 'admin';
    var employeeTarget = 'screen-clock';

    var dots, errorEl, loadingEl, keypad, submitBtn, promptEl;

    function init() {
        dots = document.querySelectorAll('.pin-dot');
        errorEl = document.getElementById('pin-error');
        loadingEl = document.getElementById('pin-loading');
        keypad = document.getElementById('pin-keypad');
        submitBtn = document.getElementById('pin-submit-btn');
        promptEl = document.getElementById('pin-prompt');

        keypad.addEventListener('click', function (e) {
            var btn = e.target.closest('.key-btn');
            if (!btn || isVerifying) return;

            var key = btn.dataset.key;
            if (key === 'clear') clearPin();
            else if (key && pin.length < MAX_PIN_LENGTH) addDigit(key);
        });

        submitBtn.addEventListener('click', verify);

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
        if (pin.length >= MAX_PIN_LENGTH) return;
        pin += digit;
        updateDots();
        hideError();
    }

    function clearPin() {
        pin = '';
        updateDots();
        hideError();
    }

    function updateDots() {
        dots.forEach(function (dot, index) {
            dot.classList.toggle('filled', index < pin.length);
        });
    }

    function showError(message) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }

    function hideError() {
        errorEl.textContent = '';
        errorEl.classList.add('hidden');
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
        submitBtn.disabled = true;
        submitBtn.textContent = 'Verificando...';

        var request = mode === 'admin' ? Api.verifyAdminPin(pin) : Api.verifyPin(pin);
        request.then(function (res) {
            isVerifying = false;
            loadingEl.classList.add('hidden');
            keypad.style.opacity = '1';
            keypad.style.pointerEvents = 'auto';
            submitBtn.disabled = false;
            submitBtn.textContent = mode === 'employee' ? 'Entrar' : 'Acceder';

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
            if (mode === 'admin') App.navigate('screen-admin');
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
        clearPin();
        if (promptEl) promptEl.textContent = 'Introduce el PIN de ajustes';
        if (submitBtn) submitBtn.textContent = 'Acceder';
    }

    function openForEmployee(targetScreen) {
        mode = 'employee';
        employeeTarget = targetScreen || 'screen-clock';
        clearPin();
        if (promptEl) promptEl.textContent = 'Introduce tu PIN de empleado';
        if (submitBtn) submitBtn.textContent = 'Entrar';
    }

    return {
        init: init,
        clearPin: clearPin,
        openForAdmin: openForAdmin,
        openForEmployee: openForEmployee
    };
})();
