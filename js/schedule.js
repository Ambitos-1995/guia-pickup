/* =====================================================
   SCHEDULE - Public schedule with employee/admin modes
   ===================================================== */
var Schedule = (function () {
    'use strict';

    var DEFAULT_HOURS = [15, 16, 17, 18, 19, 20];
    var AUTH_REDIRECT_MS = 3000;
    var CACHE_TTL = 60000;

    var currentYear, currentWeek;
    var gridEl, labelEl, rangeEl, contextEl, dialogEl;
    var dialogModeEl, dialogTitleEl, dialogSummaryEl, dialogBodyEl, dialogNoteEl;
    var dialogFeedbackEl, dialogSubmitEl, dialogSecondaryEl;
    var dialogAdminPanelEl, dialogEmployeeEl, dialogHelperEl;

    var slotsData = [];
    var selectedSlot = null;
    var dialogState = null;
    var pendingDay = null;
    var pendingHour = null;
    var isSubmitting = false;
    var authRedirectTimer = 0;
    var dialogToken = 0;

    var cache = {};
    var employeesCache = null;
    var employeesPromise = null;

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
        dialogNoteEl = document.getElementById('schedule-slot-note');
        dialogFeedbackEl = document.getElementById('schedule-slot-feedback');
        dialogSubmitEl = document.getElementById('schedule-slot-submit');
        dialogSecondaryEl = document.getElementById('schedule-slot-secondary');
        dialogAdminPanelEl = document.getElementById('schedule-slot-admin-panel');
        dialogEmployeeEl = document.getElementById('schedule-slot-employee');
        dialogHelperEl = document.getElementById('schedule-slot-helper');

        document.getElementById('week-prev').addEventListener('click', function () {
            changeWeek(-1);
        });
        document.getElementById('week-next').addEventListener('click', function () {
            changeWeek(1);
        });

        gridEl.addEventListener('click', handleCellClick);
        dialogSubmitEl.addEventListener('click', submitDialog);
        dialogSecondaryEl.addEventListener('click', submitSecondaryDialog);
        dialogEmployeeEl.addEventListener('change', updateActionAvailability);
        dialogEl.addEventListener('wa-after-hide', function () {
            resetDialog();
            handleDialogViewportChange();
        });

        var info = Utils.currentWeekInfo();
        fetchAndCache(info.year, info.week);
    }

    function show() {
        var info = Utils.currentWeekInfo();
        currentYear = info.year;
        currentWeek = info.week;
        updateAccessMode();
        if (App.hasAdminAccess()) {
            loadAdminEmployees(true).catch(function () {});
        }
        loadWeek();
    }

    function updateAccessMode() {
        if (!contextEl) return;

        if (App.hasAdminAccess()) {
            contextEl.textContent = 'Modo ajustes: asigna, reasigna, libera o borra franjas usando la lista real de empleados.';
            return;
        }

        if (App.hasEmployeeAccess()) {
            contextEl.textContent = 'Sesion activa: puedes reservar franjas libres, crear la tuya en un hueco vacio y liberar solo tus turnos.';
            return;
        }

        contextEl.textContent = 'Consulta el horario. Para reservar o gestionar una franja debes iniciar sesion desde el panel publico.';
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

        if (window.matchMedia('(max-width: 767px)').matches) {
            gridEl.style.setProperty('--schedule-grid-rows-mobile', '46px repeat(' + hours.length + ', minmax(0, 1fr))');
        } else {
            gridEl.style.removeProperty('--schedule-grid-rows-mobile');
        }

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
            return '<button type="button" class="' + baseClass + ' sched-empty" data-day="' + day + '" data-hour="' + hour + '"></button>';
        }

        if (!slot.assignedEmployeeProfileId) {
            return '<button type="button" class="' + baseClass + ' sched-free" data-slot-id="' + slot.id + '"></button>';
        }

        var isMine = session && slot.assignedEmployeeProfileId === session.employeeId;
        var shortName = firstName(slot.assignedEmployeeName || slot.assignedEmployeeCode || 'Ocupada');
        var className = isMine ? 'sched-mine' : 'sched-taken';

        return '' +
            '<button type="button" class="' + baseClass + ' ' + className + '" data-slot-id="' + slot.id + '">' +
                '<span class="sched-status">' + escapeHtml(shortName) + '</span>' +
            '</button>';
    }

    function handleCellClick(e) {
        var cell = e.target.closest('.sched-cell');
        if (!cell) return;

        var session = App.getSession();
        if (!App.isScreen('screen-schedule')) return;

        if (cell.classList.contains('sched-empty')) {
            var day = parseInt(cell.dataset.day, 10);
            var hour = parseInt(cell.dataset.hour, 10);

            if (!session) {
                openAuthRequiredDialog('reserve', null, day, hour);
                return;
            }

            if (App.hasAdminAccess()) {
                openAdminCreateDialog(day, hour);
            } else {
                openEmployeeCreateDialog(day, hour);
            }
            return;
        }

        var slot = findSlotById(cell.dataset.slotId);
        if (!slot) return;

        if (!session) {
            openAuthRequiredDialog(slot.assignedEmployeeProfileId ? 'manage' : 'reserve', slot);
            return;
        }

        if (App.hasAdminAccess()) {
            if (slot.assignedEmployeeProfileId) {
                openAdminOccupiedDialog(slot);
            } else {
                openAdminFreeDialog(slot);
            }
            return;
        }

        if (!slot.assignedEmployeeProfileId) {
            openEmployeeAssignDialog(slot);
        } else if (slot.assignedEmployeeProfileId === session.employeeId) {
            openEmployeeReleaseDialog(slot);
        } else {
            openEmployeeInfoDialog(slot);
        }
    }

    function openAuthRequiredDialog(intent, slot, day, hour) {
        openDialog({
            key: 'auth-required',
            label: 'Sesion requerida',
            badge: 'Sesion requerida',
            title: 'Inicia sesion desde el panel publico',
            summary: slot ? buildSlotSummary(slot) : buildPendingSummary(day, hour),
            body: intent === 'manage'
                ? 'Para gestionar el horario debes primero iniciar sesion.'
                : 'Para reservar debes primero iniciar sesion.',
            note: 'Te llevamos al panel publico en 3 segundos.',
            primaryAction: '',
            secondaryAction: '',
            showAdminPanel: false
        });

        cancelAuthRedirect();
        authRedirectTimer = setTimeout(function () {
            authRedirectTimer = 0;
            if (dialogEl) dialogEl.open = false;
            App.navigate('screen-menu');
        }, AUTH_REDIRECT_MS);
    }

    function openEmployeeAssignDialog(slot) {
        openDialog({
            key: 'employee-assign',
            label: 'Reservar franja',
            badge: 'Franja disponible',
            title: 'Reservar tu turno',
            summary: buildSlotSummary(slot),
            body: 'Tu sesion de empleado esta activa. Confirma para reservar esta franja.',
            note: '',
            primaryAction: 'employee-assign',
            primaryLabel: 'Reservar franja',
            primaryVariant: 'brand',
            primaryAppearance: 'accent',
            secondaryAction: '',
            showAdminPanel: false
        }, slot);
    }

    function openEmployeeCreateDialog(day, hour) {
        openDialog({
            key: 'employee-create',
            label: 'Crear y reservar franja',
            badge: 'Hueco disponible',
            title: 'Crear y reservar tu turno',
            summary: buildPendingSummary(day, hour),
            body: 'No existe franja en este hueco. Al confirmar se creara y quedara reservada a tu nombre.',
            note: '',
            primaryAction: 'employee-create',
            primaryLabel: 'Crear y reservar',
            primaryVariant: 'brand',
            primaryAppearance: 'accent',
            secondaryAction: '',
            showAdminPanel: false
        }, null, day, hour);
    }

    function openEmployeeReleaseDialog(slot) {
        openDialog({
            key: 'employee-release',
            label: 'Liberar franja',
            badge: 'Tu franja',
            title: 'Liberar franja',
            summary: buildSlotSummary(slot),
            body: 'Tu sesion esta activa. Confirma para liberar esta franja.',
            note: '',
            primaryAction: 'employee-release',
            primaryLabel: 'Liberar franja',
            primaryVariant: 'neutral',
            primaryAppearance: 'outlined',
            secondaryAction: '',
            showAdminPanel: false
        }, slot);
    }

    function openEmployeeInfoDialog(slot) {
        openDialog({
            key: 'employee-info',
            label: 'Franja ocupada',
            badge: 'Ocupada',
            title: 'Franja reservada',
            summary: buildSlotSummary(slot),
            body: 'Esta franja ya esta ocupada por otro companero. Solo esa persona o un admin puede modificarla.',
            note: '',
            primaryAction: '',
            secondaryAction: '',
            showAdminPanel: false
        }, slot);
    }

    function openAdminCreateDialog(day, hour) {
        openDialog({
            key: 'admin-create-assign',
            label: 'Crear y asignar franja',
            badge: 'Modo ajustes',
            title: 'Crear y asignar nueva franja',
            summary: buildPendingSummary(day, hour),
            body: 'Selecciona a quien quieres asignar este nuevo puesto.',
            note: '',
            primaryAction: 'admin-create-assign',
            primaryLabel: 'Crear y asignar',
            primaryVariant: 'brand',
            primaryAppearance: 'accent',
            secondaryAction: '',
            showAdminPanel: true,
            requiresEmployeeSelection: true,
            helperText: 'Selecciona un empleado para crear y asignar esta franja.',
            selectedEmployeeId: ''
        }, null, day, hour);
    }

    function openAdminFreeDialog(slot) {
        openDialog({
            key: 'admin-assign-free',
            label: 'Gestionar franja libre',
            badge: 'Modo ajustes',
            title: 'Franja libre',
            summary: buildSlotSummary(slot),
            body: 'La franja ya existe y esta libre. Puedes asignarla a un empleado o borrarla.',
            note: '',
            primaryAction: 'admin-assign-free',
            primaryLabel: 'Asignar franja',
            primaryVariant: 'brand',
            primaryAppearance: 'accent',
            secondaryAction: 'admin-delete',
            secondaryLabel: 'Borrar franja',
            secondaryVariant: 'danger',
            secondaryAppearance: 'outlined',
            showAdminPanel: true,
            requiresEmployeeSelection: true,
            helperText: 'Selecciona un empleado para asignar esta franja.',
            selectedEmployeeId: ''
        }, slot);
    }

    function openAdminOccupiedDialog(slot) {
        openDialog({
            key: 'admin-manage-occupied',
            label: 'Gestionar franja ocupada',
            badge: 'Modo ajustes',
            title: 'Reasignar o liberar franja',
            summary: buildSlotSummary(slot),
            body: 'Puedes reasignar esta franja a otra persona o liberarla si necesitas quitar ese puesto.',
            note: '',
            primaryAction: 'admin-reassign',
            primaryLabel: 'Reasignar franja',
            primaryVariant: 'brand',
            primaryAppearance: 'accent',
            secondaryAction: 'admin-release',
            secondaryLabel: 'Liberar franja',
            secondaryVariant: 'neutral',
            secondaryAppearance: 'outlined',
            showAdminPanel: true,
            requiresEmployeeSelection: true,
            helperText: 'Selecciona a otro empleado para reasignar la franja o usa liberar.',
            sameSelectionHelperText: 'Selecciona a otra persona para reasignar esta franja.',
            selectedEmployeeId: slot.assignedEmployeeProfileId || '',
            currentAssigneeId: slot.assignedEmployeeProfileId || ''
        }, slot);
    }

    function openDialog(state, slot, day, hour) {
        selectedSlot = slot || null;
        dialogState = state || null;
        pendingDay = day || null;
        pendingHour = hour || null;
        isSubmitting = false;
        dialogToken++;
        cancelAuthRedirect();
        clearDialogFeedback();

        dialogEl.label = state.label || 'Gestionar franja';
        dialogModeEl.textContent = state.badge || '';
        dialogModeEl.classList.toggle('hidden', !state.badge);
        dialogTitleEl.textContent = state.title || 'Gestionar franja';
        dialogSummaryEl.textContent = state.summary || '--';
        dialogBodyEl.textContent = state.body || '';
        dialogBodyEl.classList.toggle('hidden', !state.body);
        dialogNoteEl.textContent = state.note || '';
        dialogNoteEl.classList.toggle('hidden', !state.note);

        setupFooterButtons(state);
        setupAdminPanel(state, dialogToken);

        dialogEl.open = true;
        handleDialogViewportChange();
    }

    function setupFooterButtons(state) {
        configureDialogButton(dialogSubmitEl, state.primaryLabel, state.primaryVariant, state.primaryAppearance, !state.primaryAction);
        configureDialogButton(dialogSecondaryEl, state.secondaryLabel, state.secondaryVariant, state.secondaryAppearance, !state.secondaryAction);
    }

    function configureDialogButton(button, label, variant, appearance, hidden) {
        button.textContent = label || '';
        button.setAttribute('variant', variant || 'neutral');
        button.setAttribute('appearance', appearance || 'outlined');
        button.classList.toggle('hidden', !!hidden);
        button.disabled = !!hidden;
    }

    function setupAdminPanel(state, token) {
        dialogAdminPanelEl.classList.toggle('hidden', !state.showAdminPanel);
        if (!state.showAdminPanel) {
            dialogEmployeeEl.innerHTML = '<option value="">Selecciona un empleado</option>';
            dialogEmployeeEl.value = '';
            dialogEmployeeEl.disabled = true;
            dialogHelperEl.textContent = '';
            dialogHelperEl.classList.add('hidden');
            updateActionAvailability();
            return;
        }

        dialogHelperEl.textContent = 'Cargando empleados...';
        dialogHelperEl.classList.remove('hidden');
        dialogEmployeeEl.innerHTML = '<option value="">Cargando empleados...</option>';
        dialogEmployeeEl.disabled = true;
        updateActionAvailability();

        loadAdminEmployees(false).then(function (employees) {
            if (!dialogState || token !== dialogToken || !dialogState.showAdminPanel) return;
            populateEmployeeSelect(employees, state.selectedEmployeeId || '');
            dialogEmployeeEl.disabled = employees.length === 0;
            if (!employees.length) {
                dialogHelperEl.textContent = state.secondaryAction
                    ? 'No hay empleados disponibles para asignar. Aun puedes usar la accion secundaria.'
                    : 'No hay empleados disponibles para asignar esta franja.';
                dialogHelperEl.classList.remove('hidden');
            }
            updateActionAvailability();
            handleDialogViewportChange();
        }).catch(function (error) {
            if (!dialogState || token !== dialogToken || !dialogState.showAdminPanel) return;
            dialogEmployeeEl.innerHTML = '<option value="">No disponible</option>';
            dialogEmployeeEl.disabled = true;
            dialogHelperEl.textContent = '';
            dialogHelperEl.classList.add('hidden');
            showDialogFeedback('danger', error && error.message ? error.message : 'No se pudo cargar la lista de empleados.');
            updateActionAvailability();
        });
    }

    function populateEmployeeSelect(employees, selectedEmployeeId) {
        var options = ['<option value="">Selecciona un empleado</option>'];
        for (var i = 0; i < employees.length; i++) {
            var label = employeeDisplayName(employees[i]);
            if (employees[i].attendance_enabled === false) {
                label += ' (inactivo)';
            }
            options.push('<option value="' + escapeHtml(employees[i].id) + '">' + escapeHtml(label) + '</option>');
        }
        dialogEmployeeEl.innerHTML = options.join('');
        dialogEmployeeEl.value = selectedEmployeeId || '';
    }

    function submitDialog() {
        runDialogAction(dialogState && dialogState.primaryAction);
    }

    function submitSecondaryDialog() {
        runDialogAction(dialogState && dialogState.secondaryAction);
    }

    function runDialogAction(action) {
        if (!action || isSubmitting) return;

        var selectedEmployeeId = getSelectedEmployeeId();
        var actionNeedsEmployeeSelection = dialogState && dialogState.requiresEmployeeSelection && action === dialogState.primaryAction;
        if (actionNeedsEmployeeSelection) {
            if (!selectedEmployeeId) {
                showDialogFeedback('warning', 'Selecciona un empleado para continuar.');
                updateActionAvailability();
                return;
            }
            if (dialogState.currentAssigneeId && selectedEmployeeId === dialogState.currentAssigneeId && action === 'admin-reassign') {
                showDialogFeedback('warning', 'Selecciona a otra persona para reasignar la franja.');
                updateActionAvailability();
                return;
            }
        }

        var request = null;

        if (action === 'employee-assign') {
            request = Api.assignSlot(selectedSlot.id);
        } else if (action === 'employee-create') {
            request = Api.createAndAssignSlot(currentYear, currentWeek, pendingDay, pendingHour);
        } else if (action === 'employee-release') {
            request = Api.releaseSlot(selectedSlot.id);
        } else if (action === 'admin-create-assign') {
            request = Api.createAndAssignSlot(currentYear, currentWeek, pendingDay, pendingHour, selectedEmployeeId);
        } else if (action === 'admin-assign-free' || action === 'admin-reassign') {
            request = Api.assignSlot(selectedSlot.id, selectedEmployeeId);
        } else if (action === 'admin-release') {
            request = Api.releaseSlot(selectedSlot.id);
        } else if (action === 'admin-delete') {
            request = Api.deleteAdminSlot(selectedSlot.id);
        }

        if (!request) return;

        isSubmitting = true;
        setDialogBusy(true);
        clearDialogFeedback();

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
            setDialogBusy(false);
            updateActionAvailability();
        });
    }

    function setDialogBusy(busy) {
        var selectionLocked = busy || !dialogState || !dialogState.showAdminPanel || dialogEmployeeEl.options.length <= 1;

        if (!dialogSubmitEl.classList.contains('hidden')) {
            dialogSubmitEl.disabled = busy;
        }
        if (!dialogSecondaryEl.classList.contains('hidden')) {
            dialogSecondaryEl.disabled = busy;
        }
        dialogEmployeeEl.disabled = selectionLocked;
    }

    function updateActionAvailability() {
        if (!dialogState) return;

        if (dialogState.showAdminPanel) {
            var selectedEmployeeId = getSelectedEmployeeId();
            var helper = dialogState.helperText || '';
            var disablePrimary = false;

            if (dialogState.requiresEmployeeSelection && !selectedEmployeeId) {
                disablePrimary = true;
            }

            if (dialogState.currentAssigneeId && selectedEmployeeId && selectedEmployeeId === dialogState.currentAssigneeId && dialogState.primaryAction === 'admin-reassign') {
                disablePrimary = true;
                helper = dialogState.sameSelectionHelperText || helper;
            }

            if (!selectedEmployeeId && dialogEmployeeEl.options.length <= 1 && dialogState.secondaryAction) {
                helper = 'No hay empleados disponibles para asignar. Puedes usar la accion secundaria.';
            }

            dialogHelperEl.textContent = helper;
            dialogHelperEl.classList.toggle('hidden', !helper);

            if (!dialogSubmitEl.classList.contains('hidden')) {
                dialogSubmitEl.disabled = isSubmitting || disablePrimary;
            }
            if (!dialogSecondaryEl.classList.contains('hidden')) {
                dialogSecondaryEl.disabled = isSubmitting;
            }
            dialogEmployeeEl.disabled = isSubmitting || dialogEmployeeEl.options.length <= 1;
            return;
        }

        dialogHelperEl.textContent = '';
        dialogHelperEl.classList.add('hidden');
        if (!dialogSubmitEl.classList.contains('hidden')) {
            dialogSubmitEl.disabled = isSubmitting;
        }
        if (!dialogSecondaryEl.classList.contains('hidden')) {
            dialogSecondaryEl.disabled = isSubmitting;
        }
        dialogEmployeeEl.disabled = true;
    }

    function getSelectedEmployeeId() {
        return String(dialogEmployeeEl.value || '').trim();
    }

    function loadAdminEmployees(forceRefresh) {
        if (!forceRefresh && employeesCache) {
            return Promise.resolve(employeesCache);
        }
        if (!forceRefresh && employeesPromise) {
            return employeesPromise;
        }

        employeesPromise = Api.getEmployees().then(function (res) {
            if (!res || !res.success) {
                throw new Error((res && res.message) || 'No se pudo cargar la lista de empleados.');
            }

            var employees = Array.isArray(res.data) ? res.data.slice() : [];
            employees.sort(function (a, b) {
                var nameA = employeeDisplayName(a);
                var nameB = employeeDisplayName(b);
                return nameA.localeCompare(nameB, 'es', { sensitivity: 'base' });
            });

            employeesCache = employees;
            employeesPromise = null;
            return employees;
        }).catch(function (error) {
            employeesPromise = null;
            throw error;
        });

        return employeesPromise;
    }

    function resetDialog() {
        var keepAuthRedirect = !!(dialogState && dialogState.key === 'auth-required' && authRedirectTimer);
        if (!keepAuthRedirect) {
            cancelAuthRedirect();
        }
        selectedSlot = null;
        dialogState = null;
        pendingDay = null;
        pendingHour = null;
        isSubmitting = false;
        dialogToken++;
        dialogEl.label = 'Gestionar franja';
        dialogModeEl.classList.remove('hidden');
        dialogModeEl.textContent = 'Turno';
        dialogTitleEl.textContent = 'Gestionar franja';
        dialogSummaryEl.textContent = '--';
        dialogBodyEl.textContent = '';
        dialogBodyEl.classList.remove('hidden');
        dialogNoteEl.textContent = '';
        dialogNoteEl.classList.add('hidden');
        dialogAdminPanelEl.classList.add('hidden');
        dialogEmployeeEl.innerHTML = '<option value="">Selecciona un empleado</option>';
        dialogEmployeeEl.value = '';
        dialogEmployeeEl.disabled = true;
        dialogHelperEl.textContent = '';
        dialogHelperEl.classList.add('hidden');
        configureDialogButton(dialogSubmitEl, 'Continuar', 'brand', 'accent', false);
        configureDialogButton(dialogSecondaryEl, '', 'neutral', 'outlined', true);
        clearDialogFeedback();
    }

    function cancelAuthRedirect() {
        if (authRedirectTimer) {
            clearTimeout(authRedirectTimer);
            authRedirectTimer = 0;
        }
    }

    function handleDialogViewportChange() {
        if (!App.requestViewportUpdate) return;

        App.requestViewportUpdate();
        setTimeout(function () {
            App.requestViewportUpdate();
        }, 120);
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
        var assigned = slot.assignedEmployeeName ? ' - ' + slot.assignedEmployeeName : '';
        return Utils.DAY_NAMES[slot.dayOfWeek] + ' - ' + stripSeconds(slot.startTime) + ' - ' + stripSeconds(slot.endTime) + assigned;
    }

    function buildPendingSummary(day, hour) {
        return Utils.DAY_NAMES[day] + ' - ' + pad2(hour) + ':00 - ' + pad2(hour + 1) + ':00';
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

    function employeeDisplayName(employee) {
        return (((employee && employee.nombre) || '') + (((employee && employee.apellido) ? ' ' + employee.apellido : ''))).trim();
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

    function refreshIfVisible() {
        if (typeof App !== 'undefined' && App.isScreen('screen-schedule')) {
            fetchAndCache(currentYear, currentWeek);
        }
    }

    return {
        init: init,
        show: show,
        invalidateCache: invalidateCache,
        refreshIfVisible: refreshIfVisible
    };
})();
