/* =====================================================
   CLOCK - Fichar (Check in solo — salida automatica)
   ===================================================== */
var Clock = (function () {
    'use strict';

    var clockTimer;
    var timeEl, statusEl, todaySlotEl;
    var btnIn, feedbackEl, feedbackMsg, feedbackScheduleBtn;

    function init() {
        timeEl = document.getElementById('clock-time');
        statusEl = document.getElementById('clock-status');
        todaySlotEl = document.getElementById('clock-today-slot');
        btnIn = document.getElementById('btn-check-in');
        feedbackEl = document.getElementById('clock-feedback');
        feedbackMsg = document.getElementById('feedback-msg');
        feedbackScheduleBtn = document.getElementById('feedback-schedule-btn');

        btnIn.addEventListener('click', doCheckIn);
        feedbackScheduleBtn.addEventListener('click', function () {
            App.navigate('screen-schedule');
        });
    }

    function show() {
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

        var status = session.currentStatus;

        if (status === 'not_checked_in' || status === 'checked_out') {
            statusEl.className = 'clock-status status-pending-in';
            statusEl.textContent = 'ENTRADA pendiente';
            btnIn.classList.remove('hidden');
        } else if (status === 'checked_in') {
            statusEl.className = 'clock-status status-done';
            statusEl.textContent = 'Entrada registrada hoy';
            btnIn.classList.add('hidden');
        } else {
            statusEl.className = 'clock-status status-done';
            statusEl.textContent = 'Fichaje completo hoy';
            btnIn.classList.add('hidden');
        }
    }

    function loadTodaySlot() {
        var session = App.getSession();
        if (!session) return;

        var info = Utils.currentWeekInfo();
        var today = new Date();
        var dow = today.getDay(); // 0=Sun, 1=Mon...

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
                var s = res.data[i];
                if (s.day_of_week === dow && s.assigned_employee_profile_id === session.employeeProfileId) {
                    mySlot = s;
                    break;
                }
            }

            if (mySlot) {
                var start = mySlot.start_time.substring(0, 5);
                var end = mySlot.end_time.substring(0, 5);
                todaySlotEl.textContent = 'Hoy tienes turno de ' + start + ' a ' + end;
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

        Api.checkIn(session.pin).then(function (res) {
            btnIn.disabled = false;
            btnIn.textContent = 'ENTRADA';

            if (res && res.success) {
                var endTime = res.data && res.data.shiftEndTime ? ' · Turno hasta las ' + res.data.shiftEndTime : '';
                showFeedback('success', (res.message || 'Entrada registrada') + endTime);
                session.currentStatus = 'checked_in';
                App.setSession(session);
                setTimeout(function () { App.navigate('screen-menu'); }, 3000);
            } else {
                var noShift = res && res.message === 'No tienes turno asignado hoy';
                showFeedback('error', res.message || 'Error al fichar', noShift);
            }
        });
    }

    function showFeedback(type, msg, showScheduleBtn) {
        feedbackEl.classList.remove('hidden', 'feedback-success', 'feedback-error');
        feedbackEl.classList.add('feedback-' + type);
        feedbackMsg.textContent = msg;
        btnIn.classList.add('hidden');
        if (showScheduleBtn) {
            feedbackScheduleBtn.classList.remove('hidden');
        } else {
            feedbackScheduleBtn.classList.add('hidden');
        }
    }

    return { init: init, show: show, hide: hide };
})();
