/* =====================================================
   PAYMENT - User payment view (read-only)
   ===================================================== */
var Payment = (function () {
    'use strict';

    var currentYear, currentMonth;
    var labelEl, hoursEl, rateEl, totalEl, noteEl;

    function init() {
        labelEl = document.getElementById('pay-month-label');
        hoursEl = document.getElementById('pay-hours');
        rateEl = document.getElementById('pay-rate');
        totalEl = document.getElementById('pay-total');
        noteEl = document.getElementById('payment-note');

        document.getElementById('pay-month-prev').addEventListener('click', function () {
            changeMonth(-1);
        });
        document.getElementById('pay-month-next').addEventListener('click', function () {
            changeMonth(1);
        });
    }

    function show() {
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

    function loadMonth() {
        labelEl.textContent = Utils.MONTH_NAMES[currentMonth - 1] + ' ' + currentYear;
        hoursEl.textContent = '--';
        rateEl.textContent = '--';
        totalEl.textContent = '--';
        noteEl.textContent = 'Cargando...';

        var session = App.getSession();
        if (!session) return;

        Api.getMyPaymentSummary(session.pin, currentYear, currentMonth).then(function (res) {
            if (res && res.success && res.data) {
                var d = res.data;
                hoursEl.textContent = d.hours_worked + 'h';
                rateEl.textContent = d.hourly_rate ? (d.hourly_rate.toFixed(2) + ' \u20AC/h') : '--';
                totalEl.textContent = d.amount_earned ? (d.amount_earned.toFixed(2) + ' \u20AC') : '0 \u20AC';
                noteEl.textContent = d.status === 'confirmed'
                    ? 'Pago confirmado'
                    : d.status === 'calculated'
                    ? 'Pendiente de confirmacion'
                    : 'Los pagos se calculan a final de mes.';
            } else {
                hoursEl.textContent = '0h';
                rateEl.textContent = '--';
                totalEl.textContent = '0 \u20AC';
                noteEl.textContent = 'No hay datos para este mes.';
            }
        });
    }

    return { init: init, show: show };
})();
