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

    var dots, errorEl, loadingEl, keypad, submitBtn;
    var promptEl;

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
            if (key === 'clear') {
                clearPin();
            } else if (key && pin.length < MAX_PIN_LENGTH) {
                addDigit(key);
            }
        });

        submitBtn.addEventListener('click', verify);

        // Keyboard support
        document.addEventListener('keydown', function (e) {
            if (!App.isScreen('screen-pin') || isVerifying) return;
            if (e.key >= '0' && e.key <= '9') {
                addDigit(e.key);
            } else if (e.key === 'Backspace') {
                if (pin.length > 0) {
                    pin = pin.slice(0, -1);
                    updateDots();
                }
            } else if (e.key === 'Enter') {
                verify();
            }
        });

        // Clock
        updateClock();
        setInterval(updateClock, 1000);
    }

    function addDigit(d) {
        if (pin.length >= MAX_PIN_LENGTH) return;
        pin += d;
        updateDots();
        hideError();
    }

    function clearPin() {
        pin = '';
        updateDots();
        hideError();
    }

    function updateDots() {
        dots.forEach(function (dot, i) {
            dot.classList.toggle('filled', i < pin.length);
        });
    }

    function showError(msg) {
        errorEl.textContent = msg;
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

        console.log('[PIN] Enviando verify, modo:', mode, 'pin:', pin);
        var request = mode === 'admin'
            ? Api.verifyAdminPin(pin)
            : Api.verifyPin(pin);

        request.then(function (res) {
            console.log('[PIN] Respuesta:', JSON.stringify(res));
            isVerifying = false;
            loadingEl.classList.add('hidden');
            keypad.style.opacity = '1';
            keypad.style.pointerEvents = 'auto';
            submitBtn.disabled = false;
            submitBtn.textContent = 'Acceder';

            if (res && res.success && res.data) {
                if (mode === 'admin' && res.data.role !== 'admin' && res.data.role !== 'org_admin') {
                    showError('Ese PIN no tiene acceso a ajustes');
                    clearPin();
                    return;
                }

                console.log('[PIN] Acceso OK, modo:', mode);
                App.setSession({
                    pin: pin,
                    employeeProfileId: res.data.employeeProfileId,
                    userId: res.data.userId,
                    employeeCode: res.data.employeeCode,
                    employeeName: res.data.employeeName,
                    photoUrl: res.data.photoUrl,
                    currentStatus: res.data.currentStatus,
                    role: res.data.role || 'respondent'
                });
                clearPin();

                if (mode === 'admin') {
                    App.navigate('screen-admin');
                } else if (mode === 'employee') {
                    App.navigate(employeeTarget);
                } else {
                    App.navigate('screen-menu');
                }
            } else {
                showError('PIN incorrecto');
                clearPin();
            }
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
        hideError();
        if (promptEl) promptEl.textContent = 'Introduce el PIN de ajustes';
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Acceder';
        }
    }

    function openForEmployee(targetScreen) {
        mode = 'employee';
        employeeTarget = targetScreen || 'screen-clock';
        clearPin();
        hideError();
        if (promptEl) promptEl.textContent = 'Introduce tu PIN de empleado';
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Fichar';
        }
    }

    return {
        init: init,
        clearPin: clearPin,
        openForAdmin: openForAdmin,
        openForEmployee: openForEmployee
    };
})();
