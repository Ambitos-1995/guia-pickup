/* =====================================================
   DIRECT - Shared tablet kiosk mode
   ===================================================== */
var Direct = (function () {
    'use strict';

    var DEFAULT_HOURS = [15, 16, 17, 18, 19, 20];
    var CACHE_TTL = 60000;
    var PERSISTED_SCHEDULE_KEY = 'pickup-direct-schedule-cache-v1';
    var CLOCK_RESET_MS = 3600;
    var CLOCK_ERROR_RESET_MS = 1800;
    var STATUS_RESET_MS = 3200;

    var currentYear = 0;
    var currentWeek = 0;
    var slotsData = [];
    var scheduleCache = {};
    var scheduleDialogState = null;
    var selectedSlot = null;
    var pendingDay = null;
    var pendingHour = null;
    var schedulePin = '';
    var scheduleBusy = false;
    var scheduleStatusTimer = 0;
    var clockPin = '';
    var clockBusy = false;
    var clockResetTimer = 0;
    var clockErrorTimer = 0;
    var lastRenderedHourCount = DEFAULT_HOURS.length;

    var weekPrevEl, weekNextEl, weekLabelEl, weekRangeEl;
    var scheduleGridEl, scheduleStatusEl;
    var dialogEl, dialogModeEl, dialogTitleEl, dialogSummaryEl, dialogFocusEl, dialogFocusDayEl, dialogFocusTimeEl, dialogBodyEl;
    var dialogPinPanelEl, dialogPinKickerEl, dialogPinDayEl, dialogPinTimeEl, dialogPinDotsEl, dialogPinDots, dialogPinKeypadEl;
    var dialogHelperEl, dialogFeedbackEl, dialogSubmitEl;
    var headerClockEl, quickClockEl, quickClockStateEl, quickClockFeedbackEl;
    var quickClockFeedbackBadgeEl, quickClockFeedbackNameEl, quickClockFeedbackMessageEl, quickClockFeedbackTimeEl;
    var quickClockDotsEl, quickClockDots, quickClockErrorEl, quickClockKeypadEl, quickClockLoadingEl;
    var panelSwitchEl, panelTabs, panelSections;
    var activePanel = 'schedule';

    function init() {
        weekPrevEl = document.getElementById('direct-week-prev');
        weekNextEl = document.getElementById('direct-week-next');
        weekLabelEl = document.getElementById('direct-week-label');
        weekRangeEl = document.getElementById('direct-week-range');
        scheduleGridEl = document.getElementById('direct-schedule-grid');
        scheduleStatusEl = document.getElementById('direct-schedule-status');

        dialogEl = document.getElementById('direct-schedule-dialog');
        dialogModeEl = document.getElementById('direct-dialog-mode');
        dialogTitleEl = document.getElementById('direct-dialog-title');
        dialogSummaryEl = document.getElementById('direct-dialog-summary');
        dialogFocusEl = document.getElementById('direct-dialog-focus');
        dialogFocusDayEl = document.getElementById('direct-dialog-focus-day');
        dialogFocusTimeEl = document.getElementById('direct-dialog-focus-time');
        dialogBodyEl = document.getElementById('direct-dialog-body');
        dialogPinPanelEl = document.getElementById('direct-dialog-pin-panel');
        dialogPinKickerEl = document.getElementById('direct-dialog-pin-kicker');
        dialogPinDayEl = document.getElementById('direct-dialog-pin-day');
        dialogPinTimeEl = document.getElementById('direct-dialog-pin-time');
        dialogPinDotsEl = document.getElementById('direct-dialog-pin-dots');
        dialogPinDots = dialogPinDotsEl ? dialogPinDotsEl.querySelectorAll('.pin-dot') : [];
        dialogPinKeypadEl = document.getElementById('direct-dialog-keypad');
        dialogHelperEl = document.getElementById('direct-dialog-helper');
        dialogFeedbackEl = document.getElementById('direct-dialog-feedback');
        dialogSubmitEl = document.getElementById('direct-dialog-submit');
        panelSwitchEl = document.getElementById('direct-panel-switch');
        panelTabs = document.querySelectorAll('.direct-panel-tab');
        panelSections = document.querySelectorAll('.direct-panel[data-panel-id]');

        headerClockEl = document.getElementById('direct-header-clock');
        quickClockEl = document.getElementById('direct-clock-time');
        quickClockStateEl = document.getElementById('direct-clock-state');
        quickClockFeedbackEl = document.getElementById('direct-clock-feedback');
        quickClockFeedbackBadgeEl = document.getElementById('direct-clock-feedback-badge');
        quickClockFeedbackNameEl = document.getElementById('direct-clock-feedback-name');
        quickClockFeedbackMessageEl = document.getElementById('direct-clock-feedback-message');
        quickClockFeedbackTimeEl = document.getElementById('direct-clock-feedback-time');
        quickClockDotsEl = document.getElementById('direct-pin-dots');
        quickClockDots = quickClockDotsEl ? quickClockDotsEl.querySelectorAll('.pin-dot') : [];
        quickClockErrorEl = document.getElementById('direct-clock-error');
        quickClockKeypadEl = document.getElementById('direct-pin-keypad');
        quickClockLoadingEl = document.getElementById('direct-clock-loading');

        Utils.bindPress(weekPrevEl, function () { changeWeek(-1); });
        Utils.bindPress(weekNextEl, function () { changeWeek(1); });
        Utils.delegatePress(scheduleGridEl, '.sched-cell', handleScheduleCellPress);
        Utils.bindPress(dialogSubmitEl, handleScheduleDialogSubmit);
        dialogEl.addEventListener('wa-after-hide', resetScheduleDialog);
        Utils.delegatePress(dialogPinKeypadEl, '.key-btn', function (event, button) {
            if (scheduleBusy || button.disabled) return;

            if (button.dataset.key === 'clear') {
                clearSchedulePin();
                return;
            }

            if (button.dataset.key) {
                addScheduleDigit(button.dataset.key);
            }
        });
        Utils.each(panelTabs, function (tab) {
            Utils.bindPress(tab, function () {
                setActivePanel(tab.getAttribute('data-panel-target') || 'schedule');
            });
        });

        Utils.delegatePress(quickClockKeypadEl, '.key-btn', function (event, button) {
            if (clockBusy) return;
            var key = button.dataset.key;
            if (key === 'clear') {
                clearClockPin();
                return;
            }
            if (key && clockPin.length < 4) {
                addClockDigit(key);
            }
        });

        document.addEventListener('keydown', handleKeydown);

        var info = Utils.currentWeekInfo();
        currentYear = info.year;
        currentWeek = info.week;
        syncResponsivePanels();
        updateClocks();
        setInterval(updateClocks, 1000);
        window.addEventListener('resize', function () {
            syncResponsivePanels();
            queueScheduleGridLayout();
        }, { passive: true });
        loadWeek();
    }

    function handleKeydown(event) {
        if (isEditableTarget(event.target)) {
            return;
        }

        if (isScheduleDialogCapturingPin()) {
            if (event.key >= '0' && event.key <= '9' && schedulePin.length < 4 && !scheduleBusy) {
                addScheduleDigit(event.key);
                event.preventDefault();
                return;
            }

            if (event.key === 'Backspace' && schedulePin.length > 0 && !scheduleBusy) {
                schedulePin = schedulePin.slice(0, -1);
                updateSchedulePinDots();
                clearScheduleFeedback();
                event.preventDefault();
                return;
            }
        }

        if (dialogEl && dialogEl.open) {
            return;
        }

        if (event.key >= '0' && event.key <= '9' && clockPin.length < 4 && !clockBusy) {
            addClockDigit(event.key);
            return;
        }

        if (event.key === 'Backspace' && clockPin.length > 0 && !clockBusy) {
            clockPin = clockPin.slice(0, -1);
            updateClockDots();
            hideClockError();
        }
    }

    function updateClocks() {
        var now = new Date();
        var shortTime = Utils.formatTime(now);
        var fullTime = Utils.formatTimeFull(now);
        if (headerClockEl) headerClockEl.textContent = shortTime;
        if (quickClockEl) renderQuickClock(fullTime);
    }

    function renderQuickClock(value) {
        var parts;
        if (!quickClockEl) return;

        parts = String(value || '').split(':');
        if (parts.length !== 3) {
            quickClockEl.textContent = String(value || '--:--:--');
            return;
        }

        quickClockEl.innerHTML = '' +
            '<span class="direct-clock-part">' + escapeHtml(parts[0]) + '</span>' +
            '<span class="direct-clock-separator" aria-hidden="true">:</span>' +
            '<span class="direct-clock-part">' + escapeHtml(parts[1]) + '</span>' +
            '<span class="direct-clock-separator" aria-hidden="true">:</span>' +
            '<span class="direct-clock-part">' + escapeHtml(parts[2]) + '</span>';
        quickClockEl.setAttribute('aria-label', String(value || '--:--:--'));
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
        var key = currentYear + '-' + currentWeek;
        var cached = scheduleCache[key] || readPersistedWeekCache(key);

        weekLabelEl.textContent = 'Semana ' + pad2(currentWeek);
        weekRangeEl.textContent = formatMonthLabel(currentYear, currentWeek);

        if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            scheduleCache[key] = cached;
            slotsData = cached.data;
            renderSchedule();
            fetchWeek(currentYear, currentWeek);
            return;
        }

        if (cached) {
            scheduleCache[key] = cached;
            slotsData = cached.data;
            renderSchedule();
        } else {
            scheduleGridEl.innerHTML = '<div class="loading-text schedule-loading" style="grid-column:1/-1">Cargando horario...</div>';
        }

        fetchWeek(currentYear, currentWeek);
    }

    function fetchWeek(year, week) {
        var key = year + '-' + week;
        Api.getWeekSlots(year, week).then(function (res) {
            var data = normalizeSlots(res && res.success && res.data ? res.data : []);
            scheduleCache[key] = {
                data: data,
                timestamp: Date.now()
            };
            persistWeekCache(key, scheduleCache[key]);
            if (currentYear === year && currentWeek === week) {
                slotsData = data;
                renderSchedule();
            }
        }).catch(function () {
            if (!slotsData.length) {
                scheduleGridEl.innerHTML = '<div class="loading-text schedule-loading" style="grid-column:1/-1">No se pudo cargar el horario.</div>';
            }
        });
    }

    function renderSchedule() {
        var weekDates = Utils.getWeekDates(currentYear, currentWeek);
        var todayIso = Utils.today();
        var hours = getHoursToRender(slotsData);
        var html = '';
        var day;
        var hour;
        var slot;

        lastRenderedHourCount = hours.length;

        html += '<div class="sched-header sched-corner">Hora</div>';
        for (day = 1; day <= 5; day++) {
            html += renderHeaderCell(weekDates[day - 1], day, todayIso);
        }

        for (var index = 0; index < hours.length; index++) {
            hour = hours[index];
            html += '<div class="sched-time"><span>' + pad2(hour) + ':00</span></div>';
            for (day = 1; day <= 5; day++) {
                slot = findSlot(day, hour);
                html += renderSlotCell(slot, day, hour, weekDates[day - 1], todayIso);
            }
        }

        scheduleGridEl.innerHTML = html;
        queueScheduleGridLayout();
    }

    function queueScheduleGridLayout() {
        if (!scheduleGridEl) return;

        requestAnimationFrame(function () {
            syncScheduleGridLayout();
            setTimeout(syncScheduleGridLayout, 60);
        });
    }

    function syncScheduleGridLayout() {
        var headerHeight;

        if (!scheduleGridEl || !lastRenderedHourCount) return;
        headerHeight = window.innerWidth <= 767 ? 52 : 58;
        scheduleGridEl.style.gridTemplateRows = headerHeight + 'px repeat(' + lastRenderedHourCount + ', minmax(0, 1fr))';
    }

    function renderHeaderCell(date, dayOfWeek, todayIso) {
        var isToday = Utils.formatDateISO(date) === todayIso;
        return '' +
            '<div class="sched-header' + (isToday ? ' sched-header-today' : '') + '">' +
                '<span class="sched-day-letter">' + escapeHtml(Utils.dayOfWeekShort(dayOfWeek)) + '</span>' +
                '<span class="sched-day-date">' + escapeHtml(pad2(date.getDate())) + '</span>' +
            '</div>';
    }

    function renderSlotCell(slot, day, hour, date, todayIso) {
        var baseClass = 'sched-cell';
        if (Utils.formatDateISO(date) === todayIso) {
            baseClass += ' sched-cell-today';
        }

        if (!slot) {
            return '<button type="button" class="' + baseClass + ' sched-empty" data-day="' + day + '" data-hour="' + hour + '"></button>';
        }

        if (!slot.assignedEmployeeProfileId) {
            return '<button type="button" class="' + baseClass + ' sched-free" data-slot-id="' + escapeHtml(slot.id) + '"></button>';
        }

        return '' +
            '<button type="button" class="' + baseClass + ' sched-taken" data-slot-id="' + escapeHtml(slot.id) + '">' +
                '<span class="sched-status">' + escapeHtml(firstName(slot.assignedEmployeeName || 'Reservada')) + '</span>' +
            '</button>';
    }

    function handleScheduleCellPress(event, cell) {
        var slot;
        if (cell.classList.contains('sched-empty')) {
            openScheduleDialog({
                key: 'create',
                badge: 'Hueco disponible',
                title: 'Crear y reservar franja',
                summary: '',
                focusDay: Utils.DAY_NAMES[parseInt(cell.dataset.day, 10)],
                focusTime: buildPendingTimeRange(parseInt(cell.dataset.hour, 10)),
                body: '',
                requiresPin: true,
                action: 'create',
                primaryLabel: 'Crear y reservar',
                compactLayout: true
            }, null, parseInt(cell.dataset.day, 10), parseInt(cell.dataset.hour, 10));
            return;
        }

        slot = findSlotById(cell.dataset.slotId);
        if (!slot) return;

        if (!slot.assignedEmployeeProfileId) {
            openScheduleDialog({
                key: 'assign',
                badge: 'Franja libre',
                title: 'Reservar franja',
                summary: buildSlotSummary(slot),
                focusDay: Utils.DAY_NAMES[slot.dayOfWeek],
                focusTime: buildSlotTimeRange(slot),
                body: 'Introduce tu PIN de 4 cifras para reservar esta franja.',
                requiresPin: true,
                action: 'assign',
                primaryLabel: 'Reservar franja',
                pinKicker: 'Vas a reservar'
            }, slot);
            return;
        }

        openScheduleDialog({
            key: 'occupied-info',
            badge: 'Franja ocupada',
            title: 'Franja reservada',
            summary: buildSlotSummary(slot),
            body: 'Esta franja ya esta ocupada. Si es tuya, pulsa "Es mi turno" para liberarla con tu PIN.',
            requiresPin: false,
            action: 'reveal-release',
            primaryLabel: 'Es mi turno'
        }, slot);
    }

    function openScheduleDialog(state, slot, day, hour) {
        setActivePanel('schedule');
        scheduleDialogState = state;
        selectedSlot = slot || null;
        pendingDay = day || null;
        pendingHour = hour || null;
        scheduleBusy = false;

        applyScheduleDialogState();
        dialogEl.open = true;
    }

    function applyScheduleDialogState() {
        var state = scheduleDialogState || {};
        dialogEl.classList.toggle('compact-create', !!state.compactLayout);
        dialogModeEl.textContent = state.badge || 'Turno';
        dialogTitleEl.textContent = state.title || 'Gestionar franja';
        dialogSummaryEl.textContent = state.summary || '--';
        dialogSummaryEl.classList.toggle('hidden', !state.summary);
        dialogFocusDayEl.textContent = state.focusDay || '';
        dialogFocusTimeEl.textContent = state.focusTime || '';
        dialogFocusEl.classList.toggle('hidden', !state.focusDay && !state.focusTime);
        dialogBodyEl.textContent = state.body || '';
        dialogBodyEl.classList.toggle('hidden', !state.body);
        dialogPinPanelEl.classList.toggle('hidden', !state.requiresPin);
        dialogSubmitEl.textContent = state.primaryLabel || 'Continuar';
        dialogSubmitEl.disabled = false;
        dialogPinKickerEl.textContent = state.pinKicker || 'Reserva seleccionada';
        dialogPinDayEl.textContent = state.focusDay || summaryDay(state.summary);
        dialogPinTimeEl.textContent = state.focusTime || summaryTime(state.summary);
        dialogHelperEl.textContent = state.requiresPin
            ? 'Tu PIN solo se usa para esta accion y no se guarda.'
            : 'Puedes cerrar este cuadro si solo estabas consultando la informacion.';
        clearScheduleFeedback();

        if (state.requiresPin) {
            clearSchedulePin();
        }
    }

    function handleScheduleDialogSubmit() {
        if (!scheduleDialogState || scheduleBusy) return;

        if (scheduleDialogState.action === 'reveal-release') {
            scheduleDialogState = {
                key: 'release',
                badge: 'Liberar franja',
                title: 'Liberar franja',
                summary: selectedSlot ? buildSlotSummary(selectedSlot) : '--',
                focusDay: selectedSlot ? Utils.DAY_NAMES[selectedSlot.dayOfWeek] : '',
                focusTime: selectedSlot ? buildSlotTimeRange(selectedSlot) : '',
                body: 'Introduce tu PIN de 4 cifras para liberar esta franja si realmente te pertenece.',
                requiresPin: true,
                action: 'release',
                primaryLabel: 'Liberar franja',
                compactLayout: false,
                pinKicker: 'Vas a liberar'
            };
            applyScheduleDialogState();
            return;
        }

        runScheduleProtectedAction();
    }

    function runScheduleProtectedAction() {
        var pin = normalizePin(schedulePin, 4);
        if (!/^\d{4}$/.test(pin)) {
            showScheduleFeedback('warning', 'Introduce un PIN valido de 4 cifras.');
            shakeSchedulePinDots();
            return;
        }

        scheduleBusy = true;
        dialogSubmitEl.disabled = true;
        clearScheduleFeedback();
        dialogPinKeypadEl.style.opacity = '0.5';
        dialogPinKeypadEl.style.pointerEvents = 'none';

        Api.verifyPin(pin).then(function (verifyRes) {
            if (!verifyRes || !verifyRes.success || !verifyRes.data || !verifyRes.data.accessToken) {
                throw createActionError((verifyRes && verifyRes.message) || 'PIN incorrecto');
            }

            return runScheduleActionWithToken(verifyRes.data.accessToken);
        }).then(function (actionRes) {
            if (!actionRes || !actionRes.success) {
                throw createActionError((actionRes && actionRes.message) || 'No se pudo completar la accion.');
            }

            dialogEl.open = false;
            invalidateCurrentWeek();
            loadWeek();

            if (scheduleDialogState.action === 'assign') {
                showScheduleStatus('success', 'Franja reservada correctamente.');
            } else if (scheduleDialogState.action === 'create') {
                showScheduleStatus('success', 'Franja creada y reservada correctamente.');
            } else {
                showScheduleStatus('success', 'Franja liberada correctamente.');
            }
        }).catch(function (error) {
            showScheduleFeedback('danger', error && error.message ? error.message : 'No se pudo completar la accion.');
            if (error && error.message === 'PIN incorrecto') {
                shakeSchedulePinDots();
                clearSchedulePin();
            }
        }).then(function () {
            scheduleBusy = false;
            dialogSubmitEl.disabled = false;
            dialogPinKeypadEl.style.opacity = '1';
            dialogPinKeypadEl.style.pointerEvents = 'auto';
        });
    }

    function runScheduleActionWithToken(accessToken) {
        if (!scheduleDialogState) {
            return Promise.resolve({ success: false, message: 'No hay accion activa.' });
        }

        if (scheduleDialogState.action === 'assign' && selectedSlot) {
            return Api.assignSlot(selectedSlot.id, { accessToken: accessToken });
        }

        if (scheduleDialogState.action === 'create') {
            return Api.createAndAssignSlot(currentYear, currentWeek, pendingDay, pendingHour, { accessToken: accessToken });
        }

        if (scheduleDialogState.action === 'release' && selectedSlot) {
            return Api.releaseSlot(selectedSlot.id, { accessToken: accessToken });
        }

        return Promise.resolve({ success: false, message: 'Accion no valida.' });
    }

    function resetScheduleDialog() {
        scheduleDialogState = null;
        selectedSlot = null;
        pendingDay = null;
        pendingHour = null;
        schedulePin = '';
        scheduleBusy = false;
        dialogEl.classList.remove('compact-create');
        dialogModeEl.textContent = 'Turno';
        dialogTitleEl.textContent = 'Gestionar franja';
        dialogSummaryEl.textContent = '--';
        dialogSummaryEl.classList.remove('hidden');
        dialogFocusDayEl.textContent = '';
        dialogFocusTimeEl.textContent = '';
        dialogFocusEl.classList.add('hidden');
        dialogBodyEl.textContent = '';
        dialogBodyEl.classList.remove('hidden');
        dialogPinKickerEl.textContent = 'Reserva seleccionada';
        dialogPinDayEl.textContent = '';
        dialogPinTimeEl.textContent = '';
        updateSchedulePinDots();
        dialogHelperEl.textContent = 'Tu PIN solo se usa para esta accion y no se guarda.';
        dialogPinPanelEl.classList.add('hidden');
        dialogPinKeypadEl.style.opacity = '1';
        dialogPinKeypadEl.style.pointerEvents = 'auto';
        clearScheduleFeedback();
    }

    function showScheduleFeedback(variant, message) {
        dialogFeedbackEl.textContent = message;
        dialogFeedbackEl.setAttribute('variant', variant || 'neutral');
        dialogFeedbackEl.classList.remove('hidden');
    }

    function clearScheduleFeedback() {
        dialogFeedbackEl.textContent = '';
        dialogFeedbackEl.classList.add('hidden');
        dialogFeedbackEl.setAttribute('variant', 'neutral');
    }

    function showScheduleStatus(variant, message) {
        if (scheduleStatusTimer) {
            clearTimeout(scheduleStatusTimer);
        }

        scheduleStatusEl.textContent = message;
        scheduleStatusEl.setAttribute('variant', variant || 'neutral');
        scheduleStatusEl.classList.remove('hidden');
        scheduleStatusTimer = setTimeout(function () {
            scheduleStatusTimer = 0;
            scheduleStatusEl.classList.add('hidden');
            scheduleStatusEl.textContent = '';
            scheduleStatusEl.setAttribute('variant', 'neutral');
        }, STATUS_RESET_MS);
    }

    function addClockDigit(digit) {
        if (clockPin.length >= 4) return;
        if (clockResetTimer) {
            clearTimeout(clockResetTimer);
            clockResetTimer = 0;
        }
        clockPin += digit;
        updateClockDots();
        hideClockError();

        if (clockPin.length === 4) {
            setTimeout(processQuickClockPin, 140);
        }
    }

    function clearClockPin() {
        clockPin = '';
        updateClockDots();
        hideClockError();
        if (clockErrorTimer) {
            clearTimeout(clockErrorTimer);
            clockErrorTimer = 0;
        }
    }

    function updateClockDots() {
        Utils.each(quickClockDots, function (dot, index) {
            dot.classList.toggle('filled', index < clockPin.length);
        });
    }

    function addScheduleDigit(digit) {
        if (schedulePin.length >= 4) return;
        schedulePin += digit;
        updateSchedulePinDots();
        clearScheduleFeedback();
    }

    function clearSchedulePin() {
        schedulePin = '';
        updateSchedulePinDots();
        clearScheduleFeedback();
    }

    function updateSchedulePinDots() {
        Utils.each(dialogPinDots, function (dot, index) {
            dot.classList.toggle('filled', index < schedulePin.length);
        });
    }

    function shakeSchedulePinDots() {
        if (!dialogPinDotsEl) return;
        dialogPinDotsEl.classList.remove('shake');
        void dialogPinDotsEl.offsetWidth;
        dialogPinDotsEl.classList.add('shake');
    }

    function processQuickClockPin() {
        if (clockBusy || clockPin.length !== 4) return;

        clockBusy = true;
        quickClockLoadingEl.classList.remove('hidden');
        quickClockKeypadEl.style.opacity = '0.5';
        quickClockKeypadEl.style.pointerEvents = 'none';

        Api.verifyPin(clockPin).then(function (verifyRes) {
            if (!verifyRes || !verifyRes.success || !verifyRes.data || !verifyRes.data.accessToken) {
                throw createActionError((verifyRes && verifyRes.message) || 'PIN incorrecto');
            }

            if (verifyRes.data.currentStatus === 'checked_out') {
                showQuickClockResult('neutral', 'Turno completado', verifyRes.data.employeeName || 'Empleado', 'Ya has fichado entrada y salida hoy.');
                return null;
            }

            if (verifyRes.data.currentStatus === 'checked_in') {
                return Api.checkOut({ accessToken: verifyRes.data.accessToken }).then(function (clockRes) {
                    if (!clockRes || !clockRes.success) {
                        throw createActionError((clockRes && clockRes.message) || 'No se pudo registrar la salida.', {
                            employeeName: verifyRes.data.employeeName || 'Empleado'
                        });
                    }
                    showQuickClockResult('success', 'SALIDA', (clockRes.data && clockRes.data.employeeName) || verifyRes.data.employeeName || 'Empleado', (clockRes && clockRes.message) || 'Salida registrada.');
                    return null;
                });
            }

            return Api.checkIn({ accessToken: verifyRes.data.accessToken }).then(function (clockRes) {
                if (!clockRes || !clockRes.success) {
                    throw createActionError((clockRes && clockRes.message) || 'No se pudo registrar la entrada.', {
                        employeeName: verifyRes.data.employeeName || 'Empleado'
                    });
                }
                showQuickClockResult('success', 'ENTRADA', (clockRes.data && clockRes.data.employeeName) || verifyRes.data.employeeName || 'Empleado', (clockRes && clockRes.message) || 'Entrada registrada.');
                return null;
            });
        }).catch(function (error) {
            if (error && error.message === 'PIN incorrecto') {
                showQuickClockError(error.message);
                return;
            }
            showQuickClockResult('error', 'Aviso', error && error.employeeName ? error.employeeName : '', error && error.message ? error.message : 'No se pudo completar el fichaje.');
        }).then(function () {
            clockBusy = false;
            quickClockLoadingEl.classList.add('hidden');
            quickClockKeypadEl.style.opacity = '1';
            quickClockKeypadEl.style.pointerEvents = 'auto';
        });
    }

    function showQuickClockError(message) {
        clearClockPin();
        quickClockErrorEl.textContent = message;
        quickClockErrorEl.classList.remove('hidden');
        quickClockDotsEl.classList.remove('shake');
        void quickClockDotsEl.offsetWidth;
        quickClockDotsEl.classList.add('shake');

        if (clockErrorTimer) {
            clearTimeout(clockErrorTimer);
        }
        clockErrorTimer = setTimeout(function () {
            clockErrorTimer = 0;
            hideClockError();
        }, CLOCK_ERROR_RESET_MS);
    }

    function hideClockError() {
        quickClockErrorEl.textContent = '';
        quickClockErrorEl.classList.add('hidden');
    }

    function showQuickClockResult(kind, badge, employeeName, message) {
        setActivePanel('clock');
        if (clockResetTimer) {
            clearTimeout(clockResetTimer);
        }

        quickClockFeedbackEl.classList.remove('hidden', 'is-success', 'is-error', 'is-neutral');
        quickClockFeedbackEl.classList.add(kind === 'error' ? 'is-error' : kind === 'neutral' ? 'is-neutral' : 'is-success');
        quickClockFeedbackBadgeEl.textContent = badge;
        quickClockFeedbackNameEl.textContent = employeeName || 'Punto directo';
        quickClockFeedbackMessageEl.textContent = message;
        quickClockFeedbackTimeEl.textContent = Utils.formatTime(new Date());
        quickClockStateEl.classList.add('hidden');
        hideClockError();
        clearClockPin();

        clockResetTimer = setTimeout(function () {
            resetQuickClockPanel();
        }, CLOCK_RESET_MS);
    }

    function resetQuickClockPanel() {
        if (clockResetTimer) {
            clearTimeout(clockResetTimer);
            clockResetTimer = 0;
        }
        clearClockPin();
        quickClockFeedbackEl.classList.add('hidden');
        quickClockFeedbackEl.classList.remove('is-success', 'is-error', 'is-neutral');
        quickClockStateEl.classList.remove('hidden');
        quickClockLoadingEl.classList.add('hidden');
        quickClockKeypadEl.style.opacity = '1';
        quickClockKeypadEl.style.pointerEvents = 'auto';
        clockBusy = false;
    }

    function invalidateCurrentWeek() {
        var key = currentYear + '-' + currentWeek;
        delete scheduleCache[key];
        removePersistedWeekCache(key);
    }

    function readPersistedWeekCache(key) {
        var cacheStore;
        try {
            if (!window.localStorage) return null;
            cacheStore = JSON.parse(window.localStorage.getItem(PERSISTED_SCHEDULE_KEY) || '{}');
        } catch (error) {
            return null;
        }

        if (!cacheStore || !cacheStore[key] || !Array.isArray(cacheStore[key].data)) {
            return null;
        }

        return cacheStore[key];
    }

    function persistWeekCache(key, value) {
        var cacheStore = {};
        try {
            if (!window.localStorage) return;
            cacheStore = JSON.parse(window.localStorage.getItem(PERSISTED_SCHEDULE_KEY) || '{}') || {};
            cacheStore[key] = {
                data: Array.isArray(value.data) ? value.data : [],
                timestamp: Number(value.timestamp) || Date.now()
            };
            window.localStorage.setItem(PERSISTED_SCHEDULE_KEY, JSON.stringify(cacheStore));
        } catch (error) {}
    }

    function removePersistedWeekCache(key) {
        var cacheStore;
        try {
            if (!window.localStorage) return;
            cacheStore = JSON.parse(window.localStorage.getItem(PERSISTED_SCHEDULE_KEY) || '{}') || {};
            delete cacheStore[key];
            window.localStorage.setItem(PERSISTED_SCHEDULE_KEY, JSON.stringify(cacheStore));
        } catch (error) {}
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
            if (String(slotsData[i].id) === String(slotId)) {
                return slotsData[i];
            }
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

    function buildPendingTimeRange(hour) {
        return pad2(hour) + ':00 - ' + pad2(hour + 1) + ':00';
    }

    function buildSlotTimeRange(slot) {
        return stripSeconds(slot.startTime) + ' - ' + stripSeconds(slot.endTime);
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

    function normalizePin(value, maxLength) {
        return String(value || '').replace(/\D/g, '').slice(0, maxLength || 4);
    }

    function syncResponsivePanels() {
        if (window.innerWidth > 1100) {
            panelSwitchEl.classList.remove('is-compact');
            Utils.each(panelSections, function (section) {
                section.classList.add('is-active');
            });
            Utils.each(panelTabs, function (tab) {
                tab.classList.toggle('is-active', tab.getAttribute('data-panel-target') === activePanel);
                tab.setAttribute('aria-pressed', tab.getAttribute('data-panel-target') === activePanel ? 'true' : 'false');
            });
            return;
        }

        panelSwitchEl.classList.add('is-compact');
        setActivePanel(activePanel);
    }

    function setActivePanel(panelId) {
        activePanel = panelId === 'clock' ? 'clock' : 'schedule';

        Utils.each(panelTabs, function (tab) {
            var isActive = tab.getAttribute('data-panel-target') === activePanel;
            tab.classList.toggle('is-active', isActive);
            tab.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });

        if (window.innerWidth > 1100) {
            Utils.each(panelSections, function (section) {
                section.classList.add('is-active');
            });
            queueScheduleGridLayout();
            return;
        }

        Utils.each(panelSections, function (section) {
            var isActive = section.getAttribute('data-panel-id') === activePanel;
            section.classList.toggle('is-active', isActive);
        });

        if (activePanel === 'schedule') {
            queueScheduleGridLayout();
        }
    }

    function isEditableTarget(target) {
        var element = target && target.nodeType === 1 ? target : null;
        if (!element) return false;

        var tagName = String(element.tagName || '').toLowerCase();
        if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
            return true;
        }

        return !!element.isContentEditable;
    }

    function isScheduleDialogCapturingPin() {
        return !!(dialogEl && dialogEl.open && scheduleDialogState && scheduleDialogState.requiresPin);
    }

    function summaryDay(summary) {
        return String(summary || '').split(' - ')[0] || '';
    }

    function summaryTime(summary) {
        var parts = String(summary || '').split(' - ');
        if (parts.length < 3) return '';
        return parts[1] + ' - ' + parts[2];
    }

    function stripSeconds(time) {
        return String(time || '').slice(0, 5);
    }

    function firstName(value) {
        return String(value || '').split(' ')[0] || 'Reservada';
    }

    function pad2(value) {
        return String(value).padStart(2, '0');
    }

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function createActionError(message, details) {
        var error = new Error(message || 'Error');
        error.isActionError = true;
        if (details && details.employeeName) {
            error.employeeName = details.employeeName;
        }
        return error;
    }

    return {
        init: init
    };
})();

window.addEventListener('load', function () {
    Direct.init();
});
