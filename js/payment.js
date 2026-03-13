/* =====================================================
   PAYMENT - Employee payment summary
   ===================================================== */
var Payment = (function () {
    'use strict';

    var currentYear, currentMonth;
    var labelEl, hoursEl, totalEl, noteEl, statusEl;

    function init() {
        labelEl = document.getElementById('pay-month-label');
        hoursEl = document.getElementById('pay-hours');
        totalEl = document.getElementById('pay-total');
        noteEl = document.getElementById('payment-note');
        statusEl = document.getElementById('payment-status');

        Utils.bindPress(document.getElementById('pay-month-prev'), function () {
            changeMonth(-1);
        });
        Utils.bindPress(document.getElementById('pay-month-next'), function () {
            changeMonth(1);
        });
    }

    function show() {
        var session = App.getSession();
        if (!session || session.role !== 'respondent') {
            Pin.openForEmployee('screen-payment');
            App.navigate('screen-pin');
            return;
        }

        var now = new Date();
        currentYear = now.getFullYear();
        currentMonth = now.getMonth() + 1;
        loadMonth();
    }

    function changeMonth(delta) {
        currentMonth += delta;
        if (currentMonth < 1) {
            currentYear--;
            currentMonth = 12;
        } else if (currentMonth > 12) {
            currentYear++;
            currentMonth = 1;
        }
        loadMonth();
    }

    function animateValue(el, endText, duration) {
        var match = endText.match(/^([\d.]+)/);
        if (!match) { el.textContent = endText; return; }
        var endVal = parseFloat(match[1]);
        var suffix = endText.substring(match[1].length);
        var isDecimal = endText.indexOf('.') !== -1;
        var startTime = null;
        var dur = duration || 600;

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            var progress = Math.min((timestamp - startTime) / dur, 1);
            var eased = 1 - Math.pow(1 - progress, 3);
            var current = eased * endVal;
            el.textContent = (isDecimal ? current.toFixed(2) : Math.round(current)) + suffix;
            if (progress < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    }

    function loadMonth() {
        labelEl.textContent = Utils.MONTH_NAMES[currentMonth - 1] + ' ' + currentYear;
        hoursEl.textContent = '--';
        hoursEl.classList.add('pay-value-loading');
        totalEl.textContent = '--';
        totalEl.classList.add('pay-value-loading');
        statusEl.textContent = '';
        statusEl.className = 'payment-status hidden';
        noteEl.textContent = 'Cargando...';

        Api.getMyPaymentSummary(currentYear, currentMonth).then(function (res) {
            hoursEl.classList.remove('pay-value-loading');
            totalEl.classList.remove('pay-value-loading');

            if (!(res && res.success && res.data)) {
                hoursEl.textContent = '0h';
                totalEl.textContent = '0 €';
                noteEl.textContent = 'No hay datos para este mes.';
                return;
            }

            var data = res.data;
            animateValue(hoursEl, (data.hours_worked || 0) + 'h', 500);
            animateValue(totalEl, Number(data.amount_earned || 0).toFixed(2) + ' \u20AC', 700);
            renderStatus(data.status, data.notes || '');
        });
    }

    function renderStatus(status, notes) {
        statusEl.classList.remove('hidden');
        if (status === 'confirmed') {
            statusEl.textContent = 'Pago confirmado';
            statusEl.className = 'payment-status payment-status-confirmed';
            noteEl.textContent = 'La liquidacion de este mes ya esta confirmada.';
        } else if (status === 'calculated') {
            statusEl.textContent = 'Liquidacion calculada';
            statusEl.className = 'payment-status payment-status-calculated';
            noteEl.textContent = 'Importe calculado segun los fichajes conciliados.';
        } else if (status === 'review_required') {
            statusEl.textContent = 'Revision manual requerida';
            statusEl.className = 'payment-status payment-status-review';
            noteEl.textContent = notes || 'Hay fichajes que requieren revision antes de cerrar el pago.';
        } else {
            statusEl.textContent = 'Pendiente';
            statusEl.className = 'payment-status payment-status-pending';
            noteEl.textContent = 'Todavia no hay liquidacion cerrada para este mes.';
        }
    }

    return { init: init, show: show };
})();
