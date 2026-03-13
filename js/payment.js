/* =====================================================
   PAYMENT - Employee payment summary
   ===================================================== */
var Payment = (function () {
    'use strict';

    var currentYear, currentMonth;
    var labelEl, hoursEl, rateEl, totalEl, noteEl, statusEl;

    function init() {
        labelEl = document.getElementById('pay-month-label');
        hoursEl = document.getElementById('pay-hours');
        rateEl = document.getElementById('pay-rate');
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

    function loadMonth() {
        labelEl.textContent = Utils.MONTH_NAMES[currentMonth - 1] + ' ' + currentYear;
        hoursEl.textContent = '--';
        rateEl.textContent = '--';
        totalEl.textContent = '--';
        statusEl.textContent = '';
        statusEl.className = 'payment-status hidden';
        noteEl.textContent = 'Cargando...';

        Api.getMyPaymentSummary(currentYear, currentMonth).then(function (res) {
            if (!(res && res.success && res.data)) {
                hoursEl.textContent = '0h';
                rateEl.textContent = '--';
                totalEl.textContent = '0 €';
                noteEl.textContent = 'No hay datos para este mes.';
                return;
            }

            var data = res.data;
            hoursEl.textContent = (data.hours_worked || 0) + 'h';
            rateEl.textContent = data.hourly_rate ? data.hourly_rate.toFixed(2) + ' €/h' : '--';
            totalEl.textContent = Number(data.amount_earned || 0).toFixed(2) + ' €';
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
