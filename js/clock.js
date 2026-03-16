/* =====================================================
   CLOCK - Fichar entrada / salida con conciliacion
   ===================================================== */
var Clock = (function () {
    'use strict';

    var clockTimer;
    var timeEl, statusEl, todaySlotEl;
    var btnIn, btnOut, feedbackEl, feedbackMsg, feedbackScheduleBtn;

    function init() {
        timeEl = document.getElementById('clock-time');
        statusEl = document.getElementById('clock-status');
        todaySlotEl = document.getElementById('clock-today-slot');
        btnIn = document.getElementById('btn-check-in');
        btnOut = document.getElementById('btn-check-out');
        feedbackEl = document.getElementById('clock-feedback');
        feedbackMsg = document.getElementById('feedback-msg');
        feedbackScheduleBtn = document.getElementById('feedback-schedule-btn');

        Utils.bindPress(btnIn, doCheckIn);
        Utils.bindPress(btnOut, doCheckOut);
        Utils.bindPress(feedbackScheduleBtn, function () {
            App.navigate('screen-schedule');
        });
    }

    function show() {
        var session = App.getSession();
        if (!session || session.role !== 'respondent') {
            Pin.openForEmployee('screen-clock');
            App.navigate('screen-pin');
            return;
        }

        updateClock();
        clockTimer = setInterval(updateClock, 1000);
        refreshStatus();
        loadTodaySlot();
    }

    function hide() {
        if (clockTimer) clearInterval(clockTimer);
    }

    function updateClock() {
        if (timeEl) timeEl.textContent = Utils.formatTimeFull(new Date());
    }

    function refreshStatus() {
        var session = App.getSession();
        if (!session) return;

        feedbackEl.classList.add('hidden');

        if (session.currentStatus === 'checked_in') {
            statusEl.className = 'clock-status status-pending-out';
            statusEl.textContent = 'Entrada registrada hoy';
            btnIn.classList.add('hidden');
            btnOut.classList.remove('hidden');
        } else if (session.currentStatus === 'checked_out') {
            statusEl.className = 'clock-status status-done';
            statusEl.textContent = 'Turno completado hoy';
            btnIn.classList.add('hidden');
            btnOut.classList.add('hidden');
        } else {
            statusEl.className = 'clock-status status-pending-in';
            statusEl.textContent = 'Entrada pendiente';
            btnIn.classList.remove('hidden');
            btnOut.classList.add('hidden');
        }
    }

    function loadTodaySlot() {
        var session = App.getSession();
        if (!session) return;

        var info = Utils.currentWeekInfo();
        var today = new Date();
        var dow = today.getDay();

        if (dow === 0 || dow === 6) {
            todaySlotEl.textContent = 'Hoy no hay turno (fin de semana)';
            return;
        }

        todaySlotEl.textContent = 'Cargando turno de hoy...';

        Api.getWeekSlots(info.year, info.week).then(function (res) {
            if (!res || !res.success || !res.data) {
                todaySlotEl.textContent = '';
                return;
            }

            var mySlot = null;
            for (var i = 0; i < res.data.length; i++) {
                var slot = res.data[i];
                if (slot.day_of_week === dow && slot.assigned_employee_profile_id === session.employeeId) {
                    mySlot = slot;
                    break;
                }
            }

            if (mySlot) {
                todaySlotEl.textContent = 'Hoy tienes turno de ' +
                    mySlot.start_time.substring(0, 5) + ' a ' +
                    mySlot.end_time.substring(0, 5);
            } else {
                todaySlotEl.textContent = 'No tienes turno asignado hoy';
            }
        });
    }

    function doCheckIn() {
        var session = App.getSession();
        if (!session) return;

        btnIn.disabled = true;
        btnIn.textContent = 'Procesando...';

        Api.checkIn().then(function (res) {
            btnIn.disabled = false;
            btnIn.textContent = 'ENTRADA';

            if (res && res.success) {
                session.currentStatus = 'checked_in';
                App.setSession(session);
                showFeedback('success', res.message || 'Entrada registrada');
                setTimeout(function () { App.navigate('screen-menu'); }, 1800);
                return;
            }

            if (res && res.data && res.data.reason === 'outside_schedule') {
                showFeedback('error', 'No es tu hora. Tu turno es de ' + res.data.slotStart + ' a ' + res.data.slotEnd, false);
            } else {
                showFeedback('error', (res && res.message) || 'Error al fichar', res && res.message === 'No tienes turno asignado hoy');
            }
        });
    }

    function doCheckOut() {
        var session = App.getSession();
        if (!session) return;

        btnOut.disabled = true;
        btnOut.textContent = 'Procesando...';

        Api.checkOut().then(function (res) {
            btnOut.disabled = false;
            btnOut.textContent = 'SALIDA';

            if (res && res.success) {
                session.currentStatus = 'checked_out';
                App.setSession(session);
                showFeedback('success', res.message || 'Salida registrada');
                setTimeout(function () { App.navigate('screen-menu'); }, 1800);
                return;
            }

            showFeedback('error', (res && res.message) || 'Error al fichar salida', false);
        });
    }

    function showFeedback(type, message, showScheduleBtn) {
        feedbackEl.classList.remove('hidden', 'feedback-success', 'feedback-error');
        feedbackEl.classList.add('feedback-' + type);
        feedbackMsg.textContent = message;
        btnIn.classList.add('hidden');
        btnOut.classList.add('hidden');
        if (showScheduleBtn) feedbackScheduleBtn.classList.remove('hidden');
        else feedbackScheduleBtn.classList.add('hidden');
    }

    return { init: init, show: show, hide: hide };
})();
