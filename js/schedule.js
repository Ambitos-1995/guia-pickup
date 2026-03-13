/* =====================================================
   SCHEDULE - Public schedule with employee/admin modes
   ===================================================== */
var Schedule = (function () {
    'use strict';

    var DEFAULT_HOURS = [15, 16, 17, 18, 19, 20];

    var currentYear, currentWeek;
    var gridEl, labelEl, rangeEl, contextEl, dialogEl;
    var dialogModeEl, dialogTitleEl, dialogSummaryEl, dialogBodyEl, dialogFeedbackEl, dialogPinEl, dialogSubmitEl;

    var slotsData = [];
    var selectedSlot = null;
    var dialogMode = 'assign';
    var pendingDay = null;
    var pendingHour = null;
    var isSubmitting = false;

    var cache = {};
    var CACHE_TTL = 60000;

    function init() {
        gridEl = document.getElementById('schedule-grid');
        labelEl = document.getElementById('week-label');
        rangeEl = document.getElementById('week-range');
        contextEl = document.getElementById('schedule-context');
        dialogEl = document.getElementById('schedule-slot-dialog');
        dialogModeEl = document.getElementById('schedule-slot-mode');
        dialogTitleEl = document.getElementById('schedule-slot-title');
        dialogSummaryEl = document.getElementById('schedule-slot-summary');
        dialogBodyEl = document.getElementById('schedule-slot-body');
        dialogFeedbackEl = document.getElementById('schedule-slot-feedback');
        dialogPinEl = document.getElementById('schedule-slot-pin');
        dialogSubmitEl = document.getElementById('schedule-slot-submit');

        document.getElementById('week-prev').addEventListener('click', function () {
            changeWeek(-1);
        });
        document.getElementById('week-next').addEventListener('click', function () {
            changeWeek(1);
        });

        gridEl.addEventListener('click', handleCellClick);
        dialogSubmitEl.addEventListener('click', submitDialog);
        dialogPinEl.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') submitDialog();
        });
        dialogEl.addEventListener('wa-after-hide', resetDialog);

        var info = Utils.currentWeekInfo();
        fetchAndCache(info.year, info.week);
    }

    function show() {
        var info = Utils.currentWeekInfo();
        currentYear = info.year;
        currentWeek = info.week;
        updateAccessMode();
        loadWeek();
    }

    function updateAccessMode() {
        if (!contextEl) return;

        if (App.hasAdminAccess()) {
            contextEl.textContent = 'Modo ajustes: crea franjas en huecos vacios y libera o borra franjas existentes.';
            return;
        }

        if (App.hasEmployeeAccess()) {
            contextEl.textContent = 'Sesion activa: puedes reservar una franja libre o liberar solo tus turnos.';
            return;
        }

        contextEl.textContent = 'Consulta el horario. Para reservar o liberar una franja te pediremos el PIN de empleado.';
    }

    function changeWeek(delta) {
        currentWeek += delta;
        if (currentWeek < 1) {
            currentYear--;
            currentWeek = Utils.getISOWeeksInYear(currentYear);
        } else if (currentWeek > Utils.getISOWeeksInYear(currentYear)) {
            currentYear++;
            currentWeek = 1;
        }
        loadWeek();
    }

    function loadWeek() {
        labelEl.textContent = 'Semana ' + String(currentWeek).padStart(2, '0');
        rangeEl.textContent = formatMonthLabel(currentYear, currentWeek);

        var key = currentYear + '-' + currentWeek;
        var cached = cache[key];

        if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
            slotsData = cached.data;
            renderGrid();
            fetchAndCache(currentYear, currentWeek);
            return;
        }

        if (cached) {
            slotsData = cached.data;
            renderGrid();
        } else {
            gridEl.innerHTML = '<div class="loading-text schedule-loading" style="grid-column:1/-1">Cargando horario...</div>';
        }

        fetchAndCache(currentYear, currentWeek);
    }

    function fetchAndCache(y, w) {
        var key = y + '-' + w;
        Api.getWeekSlots(y, w).then(function (res) {
            var data = normalizeSlots((res && res.success && res.data) ? res.data : []);
            cache[key] = { data: data, timestamp: Date.now() };
            if (currentYear === y && currentWeek === w) {
                slotsData = data;
                renderGrid();
            }
        });
    }

    function invalidateCache() {
        var key = currentYear + '-' + currentWeek;
        delete cache[key];
    }

    function renderGrid() {
        var weekDates = Utils.getWeekDates(currentYear, currentWeek);
        var todayIso = Utils.today();
        var hours = getHoursToRender(slotsData);
        var html = '';

        html += '<div class="sched-header sched-corner">Hora</div>';
        for (var d = 1; d <= 5; d++) {
            var date = weekDates[d - 1];
            var isToday = Utils.formatDateISO(date) === todayIso;
            html += '<div class="sched-header' + (isToday ? ' sched-header-today' : '') + '">';
            html += '<span class="sched-day-letter">' + Utils.dayOfWeekShort(d) + '</span>';
            html += '<span class="sched-day-date">' + pad2(date.getDate()) + '</span>';
            html += '</div>';
        }

        for (var i = 0; i < hours.length; i++) {
            var hour = hours[i];
            html += '<div class="sched-time"><span>' + pad2(hour) + ':00</span></div>';

            for (var day = 1; day <= 5; day++) {
                var slot = findSlot(day, hour);
                html += renderCell(slot, day, hour, weekDates[day - 1], todayIso);
            }
        }

        gridEl.innerHTML = html;
    }

    function renderCell(slot, day, hour, date, todayIso) {
        var dayIso = Utils.formatDateISO(date);
        var isToday = dayIso === todayIso;
        var baseClass = 'sched-cell' + (isToday ? ' sched-cell-today' : '');
        var session = App.getSession();

        if (!slot) {
            var emptyAttrs = ' data-day="' + day + '" data-hour="' + hour + '"';
            return '<button type="button" class="' + baseClass + ' sched-empty" ' + emptyAttrs + '></button>';
        }

        if (!slot.assignedEmployeeProfileId) {
            return '<button type="button" class="' + baseClass + ' sched-free" data-slot-id="' + slot.id + '" data-mode="assign"></button>';
        }

        var isMine = session && slot.assignedEmployeeProfileId === session.employeeId;
        var shortName = firstName(slot.assignedEmployeeName || slot.assignedEmployeeCode || 'Ocupada');
        var className = isMine ? 'sched-mine' : 'sched-taken';

        return '' +
            '<button type="button" class="' + baseClass + ' ' + className + '" data-slot-id="' + slot.id + '" data-mode="release">' +
                '<span class="sched-status">' + escapeHtml(shortName) + '</span>' +
            '</button>';
    }

    function handleCellClick(e) {
        var cell = e.target.closest('.sched-cell');
        if (!cell) return;

        if (cell.classList.contains('sched-empty')) {
            var day = parseInt(cell.dataset.day, 10);
            var hour = parseInt(cell.dataset.hour, 10);
            if (App.hasAdminAccess()) {
                openDialog('create', null, day, hour);
            } else {
                openDialog('assign-empty', null, day, hour);
            }
            return;
        }

        var slot = findSlotById(cell.dataset.slotId);
        if (!slot) return;

        if (cell.classList.contains('sched-free')) {
            openDialog(App.hasAdminAccess() ? 'delete' : 'assign', slot);
            return;
        }

        openDialog('release', slot);
    }

    function openDialog(mode, slot, day, hour) {
        selectedSlot = slot || null;
        dialogMode = mode;
        pendingDay = day || null;
        pendingHour = hour || null;
        clearDialogFeedback();

        var needsPin = (mode === 'assign' || mode === 'release' || mode === 'assign-empty') && !App.getSession();
        dialogPinEl.value = '';
        dialogPinEl.classList.toggle('hidden', !needsPin);

        if (mode === 'create') {
            dialogEl.label = 'Crear franja';
            dialogModeEl.textContent = 'Modo ajustes';
            dialogTitleEl.textContent = 'Crear nueva franja';
            dialogBodyEl.textContent = 'Se creara una franja libre de una hora en este hueco.';
            dialogSubmitEl.textContent = 'Crear franja';
            dialogSubmitEl.setAttribute('variant', 'brand');
        } else if (mode === 'delete') {
            dialogEl.label = 'Borrar franja';
            dialogModeEl.textContent = 'Modo ajustes';
            dialogTitleEl.textContent = 'Borrar franja libre';
            dialogBodyEl.textContent = 'Esta franja esta libre. Puedes borrarla para limpiar el horario.';
            dialogSubmitEl.textContent = 'Borrar franja';
            dialogSubmitEl.setAttribute('variant', 'danger');
        } else if (mode === 'assign' || mode === 'assign-empty') {
            dialogEl.label = 'Reservar franja';
            dialogModeEl.textContent = 'Franja disponible';
            dialogTitleEl.textContent = 'Reservar tu turno';
            dialogBodyEl.textContent = needsPin
                ? 'Introduce tu PIN de empleado para abrir sesion y reservar esta franja.'
                : 'Tu sesion de empleado esta activa. Confirma para reservar esta franja.';
            dialogSubmitEl.textContent = needsPin ? 'Entrar y reservar' : 'Reservar franja';
            dialogSubmitEl.setAttribute('variant', 'brand');
        } else {
            dialogEl.label = 'Liberar franja';
            dialogModeEl.textContent = App.hasAdminAccess() ? 'Modo ajustes' : 'Tu franja';
            dialogTitleEl.textContent = 'Liberar franja';
            dialogBodyEl.textContent = needsPin
                ? 'Introduce tu PIN de empleado para abrir sesion y liberar esta franja.'
                : App.hasAdminAccess()
                ? 'Como admin puedes liberar cualquier franja ocupada.'
                : 'Tu sesion esta activa. Confirma para liberar esta franja.';
            dialogSubmitEl.textContent = 'Liberar franja';
            dialogSubmitEl.setAttribute('variant', 'neutral');
        }

        if (mode === 'create' || mode === 'assign-empty') {
            dialogSummaryEl.textContent = Utils.DAY_NAMES[pendingDay] + ' · ' + pad2(pendingHour) + ':00 - ' + pad2(pendingHour + 1) + ':00';
        } else if (slot) {
            dialogSummaryEl.textContent = buildSlotSummary(slot);
        }

        dialogEl.open = true;
    }

    function submitDialog() {
        if (isSubmitting) return;

        if ((dialogMode === 'assign' || dialogMode === 'release' || dialogMode === 'assign-empty') && !ensureEmployeeSession()) {
            return;
        }

        isSubmitting = true;
        dialogSubmitEl.disabled = true;

        var request;
        if (dialogMode === 'create') {
            request = Api.createAdminSlot({
                year: currentYear,
                week: currentWeek,
                dayOfWeek: pendingDay,
                startTime: pad2(pendingHour) + ':00:00',
                endTime: pad2(pendingHour + 1) + ':00:00'
            });
        } else if (dialogMode === 'delete') {
            request = Api.deleteAdminSlot(selectedSlot.id);
        } else if (dialogMode === 'assign') {
            request = Api.assignSlot(selectedSlot.id);
        } else if (dialogMode === 'assign-empty') {
            request = Api.createAndAssignSlot(currentYear, currentWeek, pendingDay, pendingHour);
        } else {
            request = Api.releaseSlot(selectedSlot.id);
        }

        request.then(function (res) {
            if (res && res.success) {
                dialogEl.open = false;
                invalidateCache();
                loadWeek();
                return;
            }
            showDialogFeedback('danger', (res && res.message) || 'No se pudo completar la accion.');
        }).catch(function () {
            showDialogFeedback('danger', 'No se pudo completar la accion.');
        }).finally(function () {
            isSubmitting = false;
            dialogSubmitEl.disabled = false;
        });
    }

    function ensureEmployeeSession() {
        var session = App.getSession();
        if (session && session.role === 'respondent') {
            return true;
        }

        var pin = String(dialogPinEl.value || '').trim();
        if (!/^\d{4}$/.test(pin)) {
            showDialogFeedback('warning', 'Introduce tu PIN de 4 cifras para continuar.');
            return false;
        }

        isSubmitting = true;
        dialogSubmitEl.disabled = true;

        Api.verifyPin(pin).then(function (res) {
            if (res && res.success && res.data) {
                App.setSession({
                    accessToken: res.data.accessToken,
                    expiresAt: res.data.expiresAt,
                    role: res.data.role || 'respondent',
                    employeeId: res.data.employeeId || null,
                    employeeName: res.data.employeeName || '',
                    organizationId: res.data.organizationId || null,
                    currentStatus: res.data.currentStatus || 'not_checked_in'
                });
                dialogPinEl.value = '';
                dialogPinEl.classList.add('hidden');
                isSubmitting = false;
                dialogSubmitEl.disabled = false;
                submitDialog();
            } else {
                isSubmitting = false;
                dialogSubmitEl.disabled = false;
                showDialogFeedback('danger', (res && res.message) || 'PIN incorrecto.');
            }
        });

        return false;
    }

    function resetDialog() {
        selectedSlot = null;
        dialogMode = 'assign';
        pendingDay = null;
        pendingHour = null;
        isSubmitting = false;
        dialogSubmitEl.disabled = false;
        dialogPinEl.value = '';
        dialogPinEl.classList.remove('hidden');
        clearDialogFeedback();
    }

    function showDialogFeedback(variant, message) {
        dialogFeedbackEl.textContent = message;
        dialogFeedbackEl.setAttribute('variant', variant || 'neutral');
        dialogFeedbackEl.classList.remove('hidden');
    }

    function clearDialogFeedback() {
        dialogFeedbackEl.textContent = '';
        dialogFeedbackEl.classList.add('hidden');
        dialogFeedbackEl.setAttribute('variant', 'neutral');
    }

    function normalizeSlots(rawSlots) {
        var normalized = [];
        for (var i = 0; i < rawSlots.length; i++) {
            normalized.push({
                id: rawSlots[i].slot_id || rawSlots[i].id,
                dayOfWeek: parseInt(rawSlots[i].day_of_week, 10),
                startTime: rawSlots[i].start_time,
                endTime: rawSlots[i].end_time,
                startHour: parseInt(String(rawSlots[i].start_time).substring(0, 2), 10),
                assignedEmployeeProfileId: rawSlots[i].assigned_employee_profile_id || null,
                assignedEmployeeName: rawSlots[i].assigned_employee_name || '',
                assignedEmployeeCode: rawSlots[i].assigned_employee_code || '',
                status: rawSlots[i].status || (rawSlots[i].assigned_employee_profile_id ? 'occupied' : 'free')
            });
        }
        return normalized;
    }

    function getHoursToRender(slots) {
        var hours = DEFAULT_HOURS.slice();
        for (var i = 0; i < slots.length; i++) {
            if (hours.indexOf(slots[i].startHour) === -1) {
                hours.push(slots[i].startHour);
            }
        }
        hours.sort(function (a, b) { return a - b; });
        return hours;
    }

    function findSlot(dayOfWeek, hour) {
        for (var i = 0; i < slotsData.length; i++) {
            if (slotsData[i].dayOfWeek === dayOfWeek && slotsData[i].startHour === hour) {
                return slotsData[i];
            }
        }
        return null;
    }

    function findSlotById(slotId) {
        for (var i = 0; i < slotsData.length; i++) {
            if (String(slotsData[i].id) === String(slotId)) return slotsData[i];
        }
        return null;
    }

    function buildSlotSummary(slot) {
        var assigned = slot.assignedEmployeeName ? ' · ' + firstName(slot.assignedEmployeeName) : '';
        return Utils.DAY_NAMES[slot.dayOfWeek] + ' · ' + stripSeconds(slot.startTime) + ' - ' + stripSeconds(slot.endTime) + assigned;
    }

    function formatMonthLabel(year, week) {
        var dates = Utils.getWeekDates(year, week);
        var first = dates[0];
        var last = dates[dates.length - 1];
        if (first.getMonth() === last.getMonth()) {
            return Utils.MONTH_NAMES[first.getMonth()] + ' ' + year;
        }
        return Utils.MONTH_NAMES[first.getMonth()] + ' / ' + Utils.MONTH_NAMES[last.getMonth()] + ' ' + year;
    }

    function stripSeconds(time) {
        return String(time || '').slice(0, 5);
    }

    function pad2(value) {
        return String(value).padStart(2, '0');
    }

    function firstName(name) {
        return String(name || '').split(' ')[0];
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    return {
        init: init,
        show: show
    };
})();
