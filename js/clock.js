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

        window.addEventListener('offline-clock-queue-empty', handleQueueEmpty);
        window.addEventListener('offline-clock-queue-dropped', handleQueueDropped);
        window.addEventListener('offline-clock-queue-blocked', handleQueueBlocked);
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
        var hasPending = hasPendingClockActions(session);
        var effectiveStatus;
        if (!session) return;
        effectiveStatus = getEffectiveStatus(session);

        feedbackEl.classList.add('hidden');

        if (hasPending) {
            statusEl.className = 'clock-status status-pending-sync';
            statusEl.textContent = 'Pendiente de sincronizacion';
            btnIn.classList.add('hidden');
            btnOut.classList.add('hidden');
            return;
        }

        if (effectiveStatus === 'checked_in') {
            statusEl.className = 'clock-status status-pending-out';
            statusEl.textContent = 'Entrada registrada hoy';
            btnIn.classList.add('hidden');
            btnOut.classList.remove('hidden');
        } else if (effectiveStatus === 'checked_out') {
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

        if (hasPendingClockActions(session)) {
            refreshStatus();
            loadTodaySlot();
            return;
        }

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

            // Aviso TMG: si el empleado ya hizo check_out hoy pero aún tiene
            // otro slot consecutivo abierto dentro de su ventana de entrada,
            // mostrarle un mensaje claro para evitar el caso Liu Yuhang (slot
            // 18-19 sin fichar tras salir del 17-18).
            maybeShowNextSlotPrompt(session.currentStatus, res.data.todaySlots);
        }).catch(function () {});

        loadTodaySlot();
    }

    function maybeShowNextSlotPrompt(currentStatus, todaySlots) {
        if (currentStatus !== 'checked_out') return;
        if (!Array.isArray(todaySlots) || todaySlots.length === 0) return;

        var now = new Date();
        var openSlot = null;
        for (var i = 0; i < todaySlots.length; i++) {
            var slot = todaySlots[i];
            if (!slot || slot.state === 'closed') continue;
            var startStr = (slot.start_time || '').slice(0, 5);
            var endStr = (slot.end_time || '').slice(0, 5);
            if (!startStr || !endStr) continue;
            var parts = startStr.split(':');
            var endParts = endStr.split(':');
            var startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(parts[0], 10), parseInt(parts[1], 10), 0, 0);
            var endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(endParts[0], 10), parseInt(endParts[1], 10), 0, 0);
            var windowStart = new Date(startDate.getTime() - 15 * 60000);
            if (now >= windowStart && now <= endDate) {
                openSlot = { start: startStr, end: endStr };
                break;
            }
        }

        if (!openSlot) return;

        feedbackEl.classList.remove('hidden', 'feedback-success', 'feedback-error');
        feedbackEl.classList.add('feedback-warning');
        feedbackMsg.textContent =
            'Tienes otro turno hoy de ' + openSlot.start + ' a ' + openSlot.end +
            '. Pulsa Entrada para fichar el siguiente.';
        // Re-activamos el botón Entrada para que pueda fichar el siguiente turno.
        btnIn.classList.remove('hidden');
        btnOut.classList.add('hidden');
        statusEl.className = 'clock-status status-pending-in';
        statusEl.textContent = 'Siguiente turno disponible';
    }

    function doCheckIn() {
        var session = App.getSession();
        var clientTimestamp;
        if (!session) return;

        btnIn.disabled = true;
        btnIn.textContent = 'Procesando...';
        clientTimestamp = new Date().toISOString();

        OfflineClockQueue.checkIn({
            accessToken: session.accessToken,
            offlineClockToken: session.offlineClockToken || '',
            offlineClockTokenExpiresAt: session.offlineClockTokenExpiresAt || '',
            clientDate: Utils.today(),
            clientTimestamp: clientTimestamp,
            employeeId: session.employeeId,
            employeeName: session.employeeName,
            organizationId: session.organizationId
        }).then(function (res) {
            btnIn.disabled = false;
            btnIn.textContent = 'ENTRADA';

            if (res && res.success) {
                session.currentStatus = (res.data && res.data.currentStatus) || 'checked_in';
                App.setSession(session);
                if (res.queued) {
                    showFeedback('warning', res.message || 'Entrada guardada sin conexion. Se sincronizara automaticamente.');
                    setTimeout(function () { App.navigate('screen-menu'); }, 1800);
                    return;
                }

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
        var clientTimestamp;
        if (!session) return;

        btnOut.disabled = true;
        btnOut.textContent = 'Procesando...';
        clientTimestamp = new Date().toISOString();

        OfflineClockQueue.checkOut({
            accessToken: session.accessToken,
            offlineClockToken: session.offlineClockToken || '',
            offlineClockTokenExpiresAt: session.offlineClockTokenExpiresAt || '',
            clientDate: Utils.today(),
            clientTimestamp: clientTimestamp,
            employeeId: session.employeeId,
            employeeName: session.employeeName,
            organizationId: session.organizationId
        }).then(function (res) {
            btnOut.disabled = false;
            btnOut.textContent = 'SALIDA';

            if (res && res.success) {
                session.currentStatus = (res.data && res.data.currentStatus) || 'checked_out';
                App.setSession(session);
                if (res.queued) {
                    showFeedback('warning', res.message || 'Salida guardada sin conexion. Se sincronizara automaticamente.');
                    setTimeout(function () { App.navigate('screen-menu'); }, 1800);
                    return;
                }

                refreshRemoteState();
                showFeedback('success', res.message || 'Salida registrada');
                setTimeout(function () { App.navigate('screen-menu'); }, 1800);
                return;
            }

            showFeedback('error', (res && res.message) || 'Error al fichar salida', false);
        });
    }

    function showFeedback(type, message, showScheduleBtn) {
        feedbackEl.classList.remove('hidden', 'feedback-success', 'feedback-error', 'feedback-warning');
        feedbackEl.classList.add('feedback-' + type);
        feedbackMsg.textContent = message;
        btnIn.classList.add('hidden');
        btnOut.classList.add('hidden');
        if (showScheduleBtn) feedbackScheduleBtn.classList.remove('hidden');
        else feedbackScheduleBtn.classList.add('hidden');
    }

    function hasPendingClockActions(session) {
        if (!(typeof OfflineClockQueue !== 'undefined' && OfflineClockQueue.hasPendingForEmployee)) {
            return false;
        }

        return !!(session && session.employeeId && OfflineClockQueue.hasPendingForEmployee(session.employeeId));
    }

    function getEffectiveStatus(session) {
        if (!session) return 'not_checked_in';
        if (!(typeof OfflineClockQueue !== 'undefined' && OfflineClockQueue.getOptimisticStatus)) {
            return session.currentStatus || 'not_checked_in';
        }

        return OfflineClockQueue.getOptimisticStatus(session.employeeId, session.currentStatus || 'not_checked_in');
    }

    function handleQueueEmpty() {
        if (!App.isScreen('screen-clock')) return;
        refreshRemoteState();
    }

    function handleQueueDropped(event) {
        var detail = event && event.detail ? event.detail : {};
        var session = App.getSession();
        if (!session || detail.employeeId !== session.employeeId) return;

        refreshRemoteState();
        if (App.isScreen('screen-clock')) {
            showFeedback('error', detail.message || 'Un fichaje pendiente no pudo sincronizarse.', false);
        }
    }

    function handleQueueBlocked(event) {
        var detail = event && event.detail ? event.detail : {};
        var session = App.getSession();
        if (!session || detail.employeeId !== session.employeeId) return;

        refreshStatus();
        if (App.isScreen('screen-clock')) {
            showFeedback('warning', detail.message || 'Conectate y vuelve a validar tu PIN para sincronizar el fichaje pendiente.', false);
        }
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
