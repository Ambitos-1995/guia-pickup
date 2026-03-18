/* =====================================================
   CLOCK - Fichar entrada / salida con conciliacion
   ===================================================== */
var Clock = (function () {
    'use strict';

    var clockTimer;
    var syncTimer;
    var todaySlotRequestId = 0;
    var timeEl, statusEl, todaySlotEl;
    var btnIn, btnOut, feedbackEl, feedbackMsg, feedbackScheduleBtn;
    var SYNC_INTERVAL_MS = 5000;

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
        if (!session) {
            Pin.openForLogin('screen-menu', 'screen-menu');
            App.navigate('screen-pin');
            return;
        }

        updateClock();
        clockTimer = setInterval(updateClock, 1000);
        refreshStatus();
        refreshRemoteState();
        syncTimer = setInterval(refreshRemoteState, SYNC_INTERVAL_MS);
    }

    function hide() {
        if (clockTimer) clearInterval(clockTimer);
        if (syncTimer) clearInterval(syncTimer);
        clockTimer = 0;
        syncTimer = 0;
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
        var requestId;
        if (!session) return;

        var info = Utils.currentWeekInfo();
        var today = new Date();
        var dow = today.getDay();

        if (dow === 0 || dow === 6) {
            todaySlotEl.textContent = 'Hoy no hay turno (fin de semana)';
            return;
        }

        todaySlotEl.textContent = 'Cargando turno de hoy...';
        requestId = ++todaySlotRequestId;

        Api.getWeekSlots(info.year, info.week).then(function (res) {
            if (!res || !res.success || !res.data) {
                if (requestId !== todaySlotRequestId) return;
                todaySlotEl.textContent = 'No se pudo comprobar el turno de hoy';
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

            if (requestId !== todaySlotRequestId) return;

            if (mySlot) {
                todaySlotEl.textContent = 'Hoy tienes turno de ' +
                    mySlot.start_time.substring(0, 5) + ' a ' +
                    mySlot.end_time.substring(0, 5);
            } else {
                todaySlotEl.textContent = 'No tienes turno asignado hoy';
            }
        }).catch(function () {
            if (requestId !== todaySlotRequestId) return;
            todaySlotEl.textContent = 'No se pudo comprobar el turno de hoy';
        });
    }

    function refreshRemoteState() {
        var session = App.getSession();
        if (!session) return;

        Api.getClockStatus().then(function (res) {
            if (!(res && res.success && res.data)) return;

            session = App.getSession();
            if (!session) return;

            session.currentStatus = res.data.currentStatus || session.currentStatus || 'not_checked_in';
            if (typeof res.data.employeeName === 'string' && res.data.employeeName) {
                session.employeeName = res.data.employeeName;
            }
            App.setSession(session);
            refreshStatus();
        }).catch(function () {});

        loadTodaySlot();
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
                refreshRemoteState();
                showFeedback('success', res.message || 'Entrada registrada');
                setTimeout(function () { App.navigate('screen-menu'); }, 1800);
                return;
            }

            if (res && res.data && res.data.reason === 'outside_schedule') {
                showFeedback('error', buildClockScheduleMessage(res), false);
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
                refreshRemoteState();
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

    function buildClockScheduleMessage(res) {
        if (res && typeof res.message === 'string' && res.message) {
            return res.message;
        }

        if (res && res.data && res.data.nextSlotLabel) {
            return 'Ahora no tienes turno. Tu proximo horario es ' + res.data.nextSlotLabel + '.';
        }

        if (res && res.data && res.data.slotStart && res.data.slotEnd) {
            return 'No es tu hora. Tu turno es de ' + res.data.slotStart + ' a ' + res.data.slotEnd;
        }

        return 'Error al fichar';
    }

    return { init: init, show: show, hide: hide };
})();
