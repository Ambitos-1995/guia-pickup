/* =====================================================
   SCHEDULE - Public weekly schedule with PIN-based cell actions
   ===================================================== */
var Schedule = (function () {
    'use strict';

    var DEFAULT_HOURS = [15, 16, 17, 18, 19, 20];

    var currentYear, currentWeek;
    var gridEl, labelEl, rangeEl, contextEl, backBtn;
    var dialogEl, dialogModeEl, dialogTitleEl, dialogSummaryEl, dialogBodyEl, dialogFeedbackEl, dialogPinEl, dialogSubmitEl;

    var slotsData = [];
    var selectedSlot = null;
    var dialogMode = 'assign';
    var isSubmitting = false;
    var pendingDay = null;
    var pendingHour = null;

    function init() {
        gridEl = document.getElementById('schedule-grid');
        labelEl = document.getElementById('week-label');
        rangeEl = document.getElementById('week-range');
        contextEl = document.getElementById('schedule-context');
        backBtn = document.getElementById('schedule-back-btn');

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
    }

    function show() {
        var info = Utils.currentWeekInfo();
        currentYear = info.year;
        currentWeek = info.week;
        updateAccessMode();
        loadWeek();
    }

    function updateAccessMode() {
        if (backBtn) {
            backBtn.dataset.back = 'screen-menu';
        }

        if (contextEl) {
            contextEl.textContent = 'Pulsa cualquier celda, escribe tu PIN y tu nombre aparecera automaticamente.';
        }
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
        gridEl.innerHTML = '<div class="loading-text schedule-loading" style="grid-column:1/-1">Cargando horario...</div>';

        Api.getWeekSlots(currentYear, currentWeek).then(function (res) {
            slotsData = normalizeSlots((res && res.success && res.data) ? res.data : []);
            renderGrid();
        });
    }

    function renderGrid() {
        var weekDates = Utils.getWeekDates(currentYear, currentWeek);
        var todayIso = Utils.today();
        var hours = getHoursToRender(slotsData);
        var html = '';

        html += '<div class="sched-header sched-corner">Hora</div>';
        for (var d = 1; d <= 5; d++) {
            var headerDate = weekDates[d - 1];
            var isToday = Utils.formatDateISO(headerDate) === todayIso;
            html += '<div class="sched-header' + (isToday ? ' sched-header-today' : '') + '">';
            html += '<span class="sched-day-letter">' + Utils.dayOfWeekShort(d) + '</span>';
            html += '<span class="sched-day-date">' + pad2(headerDate.getDate()) + '</span>';
            html += '</div>';
        }

        for (var h = 0; h < hours.length; h++) {
            var hour = hours[h];
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

        if (!slot) {
            return '<button type="button" class="' + baseClass + ' sched-empty" data-day="' + day + '" data-hour="' + hour + '"></button>';
        }

        if (!slot.assignedEmployeeProfileId) {
            return '<button type="button" class="' + baseClass + ' sched-free" data-slot-id="' + slot.id + '" data-mode="assign"></button>';
        }

        var session = App.getSession();
        var isMine = session && slot.assignedEmployeeProfileId === session.employeeProfileId;
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
            openDialog('create-assign', null, day, hour);
            return;
        }

        var slotId = cell.dataset.slotId;
        var mode = cell.dataset.mode || 'assign';
        var slot = findSlotById(slotId);

        if (!slot) return;
        openDialog(mode, slot);
    }

    function openDialog(mode, slot, day, hour) {
        selectedSlot = slot;
        dialogMode = mode;
        pendingDay = day || null;
        pendingHour = hour || null;

        clearDialogFeedback();
        dialogPinEl.value = '';

        if (mode === 'create-assign' || mode === 'assign') {
            dialogEl.label = 'Asignar turno';
            dialogModeEl.textContent = 'Franja disponible';
            dialogTitleEl.textContent = 'Asignarte con tu PIN';
            dialogBodyEl.textContent = 'Introduce tu PIN de 4 cifras para reservar esta franja.';
            dialogSubmitEl.textContent = 'Asignarme';
            dialogSubmitEl.setAttribute('variant', 'brand');
            dialogSubmitEl.setAttribute('appearance', 'accent');
        } else {
            dialogEl.label = 'Liberar turno';
            dialogModeEl.textContent = 'Franja ocupada';
            dialogTitleEl.textContent = 'Gestionar franja ocupada';
            dialogBodyEl.textContent = 'Si eres la persona asignada, introduce tu PIN para liberar esta franja.';
            dialogSubmitEl.textContent = 'Liberar mi turno';
            dialogSubmitEl.setAttribute('variant', 'danger');
            dialogSubmitEl.setAttribute('appearance', 'filled');
        }

        if (mode === 'create-assign') {
            var dayName = Utils.DAY_NAMES[day];
            dialogSummaryEl.textContent = dayName + ' · ' + pad2(hour) + ':00 - ' + pad2(hour + 1) + ':00';
        } else {
            dialogSummaryEl.textContent = buildSlotSummary(slot);
        }

        dialogEl.open = true;

        window.setTimeout(function () {
            if (dialogPinEl && typeof dialogPinEl.focus === 'function') {
                dialogPinEl.focus();
            }
        }, 60);
    }

    function submitDialog() {
        if (isSubmitting) return;
        if (dialogMode !== 'create-assign' && !selectedSlot) return;

        var pin = String(dialogPinEl.value || '').trim();
        if (pin.length < 4) {
            showDialogFeedback('warning', 'Introduce tu PIN para continuar.');
            return;
        }

        isSubmitting = true;
        dialogSubmitEl.disabled = true;

        var request;

        if (dialogMode === 'create-assign') {
            request = Api.createAdminSlot({
                year: currentYear,
                week: currentWeek,
                dayOfWeek: pendingDay,
                startTime: pad2(pendingHour) + ':00:00',
                endTime: pad2(pendingHour + 1) + ':00:00'
            }).then(function (createRes) {
                if (!createRes || !createRes.success || !createRes.data) {
                    return { success: false, message: 'No se pudo crear la franja.' };
                }
                var newSlotId = createRes.data.slot_id || createRes.data.id;
                return Api.assignByPin(pin, newSlotId, currentYear, currentWeek);
            });
        } else if (dialogMode === 'assign') {
            request = Api.assignByPin(pin, selectedSlot.id, currentYear, currentWeek);
        } else {
            request = Api.modifyByPin(selectedSlot.id, pin, 'release', {
                signupId: selectedSlot.signupId,
                year: currentYear,
                week: currentWeek
            });
        }

        request.then(function (res) {
            if (res && res.success) {
                dialogEl.open = false;
                loadWeek();
                return;
            }

            showDialogFeedback('danger', (res && res.message) || defaultErrorMessage());
        }).catch(function () {
            showDialogFeedback('danger', defaultErrorMessage());
        }).finally(function () {
            isSubmitting = false;
            dialogSubmitEl.disabled = false;
        });
    }

    function resetDialog() {
        selectedSlot = null;
        dialogMode = 'assign';
        pendingDay = null;
        pendingHour = null;
        isSubmitting = false;
        dialogSubmitEl.disabled = false;
        dialogPinEl.value = '';
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
            normalized.push(normalizeSlot(rawSlots[i]));
        }

        return normalized;
    }

    function normalizeSlot(raw) {
        var startTime = raw.start_time || '00:00:00';
        var endTime = raw.end_time || addOneHour(startTime);

        return {
            id: raw.slot_id || raw.id,
            raw: raw,
            dayOfWeek: parseInt(raw.day_of_week, 10),
            startTime: startTime,
            endTime: endTime,
            startHour: parseInt(startTime.substring(0, 2), 10),
            assignedEmployeeProfileId: raw.assigned_employee_profile_id || raw.signup_employee_id || null,
            assignedEmployeeName: raw.assigned_employee_name || raw.signup_employee_name || '',
            assignedEmployeeCode: raw.assigned_employee_code || raw.signup_employee_code || '',
            signupId: raw.signup_id || null,
            status: raw.status || ((raw.assigned_employee_profile_id || raw.signup_employee_id) ? 'occupied' : 'free'),
            isEditableBySelf: raw.is_editable_by_self !== undefined ? !!raw.is_editable_by_self : !!raw.signup_id
        };
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
            if (String(slotsData[i].id) === String(slotId)) {
                return slotsData[i];
            }
        }
        return null;
    }

    function buildSlotSummary(slot) {
        var dayName = Utils.DAY_NAMES[slot.dayOfWeek];
        var assigned = slot.assignedEmployeeName ? ' · ' + firstName(slot.assignedEmployeeName) : '';
        return dayName + ' · ' + stripSeconds(slot.startTime) + ' - ' + stripSeconds(slot.endTime) + assigned;
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

    function addOneHour(time) {
        var hour = parseInt(String(time).substring(0, 2), 10);
        return pad2(hour + 1) + ':00:00';
    }

    function pad2(value) {
        return String(value).padStart(2, '0');
    }

    function firstName(name) {
        return String(name || '').split(' ')[0];
    }

    function defaultErrorMessage() {
        return (dialogMode === 'assign' || dialogMode === 'create-assign')
            ? 'No se pudo asignar la franja. PIN no valido o franja ocupada.'
            : 'No se pudo liberar la franja con ese PIN.';
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
