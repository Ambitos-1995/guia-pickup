/* =====================================================
   ADMIN - Payments and employees (redesigned)
   ===================================================== */
var Admin = (function () {
    'use strict';

    var editingEmployee = null;
    var currentYear, currentMonth;
    var receiptYear, receiptMonth;
    var newFormVisible     = false;
    var acuerdoFormVisible = false;
    var employeeSelectCache = null;

    var CALC_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="14"/><line x1="16" y1="18" x2="16" y2="18"/><line x1="12" y1="14" x2="12" y2="14"/><line x1="12" y1="18" x2="12" y2="18"/><line x1="8" y1="14" x2="8" y2="14"/><line x1="8" y1="18" x2="8" y2="18"/><line x1="8" y1="10" x2="16" y2="10"/></svg>';
    var SPINNER_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';
    var DOWNLOAD_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';

    /* --- Shared feedback helper --- */
    function showFeedback(elementId, type, message, autoHideMs) {
        var el = document.getElementById(elementId);
        el.textContent = message;
        el.className = 'employee-form-feedback ' + (type === 'success' ? 'feedback-success' : 'feedback-error');
        if (autoHideMs) {
            setTimeout(function () { el.className = 'employee-form-feedback hidden'; }, autoHideMs);
        }
    }

    function hideFeedback(elementId) {
        var el = document.getElementById(elementId);
        el.textContent = '';
        el.className = 'employee-form-feedback hidden';
    }

    function formatEuro(amount) {
        return Number(amount || 0).toFixed(2) + ' \u20AC';
    }

    function initials(nombre, apellido) {
        return ((nombre || '').charAt(0) + (apellido || '').charAt(0)).toUpperCase() || '--';
    }

    function statusLabel(status) {
        if (status === 'confirmed') return 'Confirmado';
        if (status === 'calculated') return 'Calculado';
        if (status === 'review_required') return 'Revision';
        return 'Pendiente';
    }

    function init() {
        /* --- Tabs --- */
        var tabs = document.querySelectorAll('.admin-tab');
        Utils.each(tabs, function (tab) {
            Utils.bindPress(tab, function () {
                Utils.each(tabs, function (item) { item.classList.remove('active'); });
                tab.classList.add('active');

                Utils.each(document.querySelectorAll('.admin-section'), function (section) {
                    section.classList.add('hidden');
                    section.classList.remove('active');
                });

                var target = document.getElementById(tab.dataset.tab);
                if (target) {
                    target.classList.remove('hidden');
                    target.classList.add('active');

                    if (target.id === 'admin-payments') {
                        loadPayMonth();
                    } else if (target.id === 'admin-employees') {
                        loadEmployees();
                    } else if (target.id === 'admin-acuerdos') {
                        loadAcuerdosList();
                    } else if (target.id === 'admin-recibos') {
                        loadReceiptMonth();
                    }
                }
            });
        });

        /* --- Payments --- */
        Utils.bindPress(document.getElementById('admin-pay-prev'), function () { changePayMonth(-1); });
        Utils.bindPress(document.getElementById('admin-pay-next'), function () { changePayMonth(1); });
        Utils.bindPress(document.getElementById('admin-pay-save'), savePayment);
        Utils.bindPress(document.getElementById('admin-pay-calculate'), calculatePayments);

        var now = new Date();
        currentYear = now.getFullYear();
        currentMonth = now.getMonth() + 1;

        /* --- Employees --- */
        Utils.bindPress(document.getElementById('admin-emp-toggle-form'), toggleNewForm);
        Utils.bindPress(document.getElementById('admin-emp-create'), createEmployee);
        Utils.bindPress(document.getElementById('edit-emp-cancel'), closeEditModal);
        Utils.bindPress(document.getElementById('edit-emp-save'), saveEditEmployee);

        /* Role selector changes PIN label in create form */
        var roleSelect = document.getElementById('emp-role');
        if (roleSelect) {
            roleSelect.addEventListener('change', function () {
                updatePinLabel(roleSelect.value, 'emp-pin-label', 'emp-pin');
            });
        }

        /* Role selector changes PIN label in edit form */
        var editRoleSelect = document.getElementById('edit-emp-role');
        if (editRoleSelect) {
            editRoleSelect.addEventListener('change', function () {
                updatePinLabel(editRoleSelect.value, 'edit-emp-pin-label', 'edit-emp-pin');
            });
        }

        /* --- Acuerdos --- */
        Utils.bindPress(document.getElementById('admin-acuerdo-nuevo'), toggleAcuerdoForm);
        Utils.bindPress(document.getElementById('admin-acuerdo-crear'), createAcuerdo);

        /* --- Recibos --- */
        Utils.bindPress(document.getElementById('admin-receipt-prev'), function () { changeReceiptMonth(-1); });
        Utils.bindPress(document.getElementById('admin-receipt-next'), function () { changeReceiptMonth(1); });
        Utils.bindPress(document.getElementById('admin-receipt-generate'), function () { generateReceipts(); });
        Utils.bindPress(document.getElementById('admin-receipt-bulk-pdf'), function () { downloadBulkPdf(); });

        /* Active toggle in edit modal */
        var toggleBtn = document.getElementById('edit-emp-active');
        if (toggleBtn) {
            Utils.bindPress(toggleBtn, function () {
                toggleBtn.classList.toggle('active');
                var label = document.getElementById('edit-emp-active-label');
                if (label) label.textContent = toggleBtn.classList.contains('active') ? 'Activo' : 'Inactivo';
            });
        }
    }

    function updatePinLabel(role, labelId, inputId) {
        var label = document.getElementById(labelId);
        var input = document.getElementById(inputId);
        if (role === 'admin') {
            if (label) label.textContent = 'PIN (6 cifras)';
            if (input) { input.maxLength = 6; input.placeholder = '123456'; input.pattern = '[0-9]{6}'; }
        } else {
            if (label) label.textContent = 'PIN (4 cifras)';
            if (input) { input.maxLength = 4; input.placeholder = '1234'; input.pattern = '[0-9]{4}'; }
        }
    }

    /* ===== SHOW ===== */
    function show() {
        if (!App.hasAdminAccess()) {
            Pin.openForAdmin();
            App.navigate('screen-pin');
            return;
        }

        var activeTab = document.querySelector('.admin-tab.active');
        var activeTabId = activeTab ? activeTab.dataset.tab : 'admin-payments';

        if (activeTabId === 'admin-employees') {
            loadEmployees();
            return;
        }
        if (activeTabId === 'admin-acuerdos') {
            loadAcuerdosList();
            return;
        }
        if (activeTabId === 'admin-recibos') {
            loadReceiptMonth();
            return;
        }

        loadPayMonth();
    }

    /* =========================================================
       PAYMENTS TAB
       ========================================================= */
    function changePayMonth(delta) {
        currentMonth += delta;
        if (currentMonth < 1) { currentYear--; currentMonth = 12; }
        else if (currentMonth > 12) { currentYear++; currentMonth = 1; }
        loadPayMonth();
    }

    function loadPayMonth() {
        var label = document.getElementById('admin-pay-month-label');
        label.textContent = Utils.MONTH_NAMES[currentMonth - 1] + ' ' + currentYear;

        var amountEl = document.getElementById('admin-pay-summary-amount');
        var statusEl = document.getElementById('admin-pay-summary-status');
        var resultsEl = document.getElementById('admin-pay-results');

        amountEl.textContent = '...';
        statusEl.textContent = 'Cargando';
        statusEl.className = 'admin-pay-summary-badge';
        resultsEl.classList.add('hidden');

        /* Read-only: fetch existing summary without recalculating */
        Api.getPaymentSummary(currentYear, currentMonth).then(function (res) {
            if (res && res.success && res.data && res.data.configured) {
                var data = res.data;
                amountEl.textContent = formatEuro(data.total_seur_amount || 0);
                document.getElementById('admin-pay-amount').value = data.total_seur_amount || '';

                if (data.calculations && data.calculations.length > 0) {
                    statusEl.textContent = 'Calculado';
                    statusEl.className = 'admin-pay-summary-badge badge-calculated';
                    showPaymentResults(data);
                } else {
                    statusEl.textContent = 'Configurado';
                    statusEl.className = 'admin-pay-summary-badge badge-configured';
                }
            } else {
                amountEl.textContent = '0.00 \u20AC';
                statusEl.textContent = 'Sin configurar';
                statusEl.className = 'admin-pay-summary-badge';
                document.getElementById('admin-pay-amount').value = '';
            }
        });
    }

    function savePayment() {
        var amount = parseFloat(document.getElementById('admin-pay-amount').value);
        if (!amount || amount <= 0) {
            showFeedback('admin-pay-feedback', 'error', 'Introduce un importe valido.', 4000);
            return;
        }

        var btn = document.getElementById('admin-pay-save');
        btn.disabled = true;
        btn.textContent = 'Guardando...';

        Api.setPaymentAmount(currentYear, currentMonth, amount).then(function (res) {
            btn.disabled = false;
            btn.textContent = 'Guardar';

            if (res && res.success) {
                showFeedback('admin-pay-feedback', 'success', 'Importe guardado.', 4000);
                loadPayMonth();
            } else {
                showFeedback('admin-pay-feedback', 'error', (res && res.message) || 'No se pudo guardar.', 4000);
            }
        });
    }

    function calculatePayments() {
        var btn = document.getElementById('admin-pay-calculate');
        btn.disabled = true;
        btn.innerHTML = SPINNER_ICON + ' Calculando...';

        Api.calculatePayments(currentYear, currentMonth).then(function (res) {
            btn.disabled = false;
            btn.innerHTML = CALC_ICON + ' Calcular pagos';

            if (res && res.success) {
                showPaymentResults(res.data || {});
                loadPayMonth();
            } else {
                showFeedback('admin-pay-feedback', 'error', (res && res.message) || 'No se pudieron calcular los pagos.', 4000);
            }
        });
    }

    function showPaymentResults(data) {
        var resultsEl = document.getElementById('admin-pay-results');
        var tbody = document.getElementById('admin-pay-tbody');
        var tfoot = document.getElementById('admin-pay-tfoot');

        resultsEl.classList.remove('hidden');
        tbody.textContent = '';
        tfoot.textContent = '';

        if (!data.calculations || data.calculations.length === 0) {
            var emptyRow = document.createElement('tr');
            var emptyCell = document.createElement('td');
            emptyCell.colSpan = 4;
            emptyCell.style.textAlign = 'center';
            emptyCell.style.color = '#6b7280';
            emptyCell.textContent = 'Sin fichajes conciliados este mes';
            emptyRow.appendChild(emptyCell);
            tbody.appendChild(emptyRow);
        } else {
            data.calculations.forEach(function (calc) {
                var row = document.createElement('tr');
                row.appendChild(makeCell(calc.employee_name || '--'));
                row.appendChild(makeCell((calc.hours_worked || 0) + 'h'));
                row.appendChild(makeCell(statusLabel(calc.status)));
                row.appendChild(makeCell(formatEuro(calc.amount_earned || 0)));
                tbody.appendChild(row);
            });
        }

        tfoot.appendChild(makeFootRow('Tarifa/hora', (data.total_validated_hours || 0) + 'h validadas', formatEuro(data.rate_per_hour || 0) + '/h'));
        tfoot.appendChild(makeFootRow('Total pagado', '', formatEuro(data.total_paid || 0)));
        tfoot.appendChild(makeFootRow('En revision', String(data.review_required_count || 0), formatEuro(data.org_keeps || 0) + ' pendiente'));
    }

    function makeFootRow(label, middle, value) {
        var row = document.createElement('tr');
        row.appendChild(makeCell(label));
        row.appendChild(makeCell(middle || ''));
        row.appendChild(makeCell(''));
        row.appendChild(makeCell(value || ''));
        return row;
    }

    function makeCell(text) {
        var cell = document.createElement('td');
        cell.textContent = text;
        return cell;
    }

    /* =========================================================
       EMPLOYEES TAB
       ========================================================= */
    function toggleNewForm() {
        newFormVisible = !newFormVisible;
        var wrap = document.getElementById('admin-emp-form-wrap');
        var btn = document.getElementById('admin-emp-toggle-form');

        if (newFormVisible) {
            wrap.classList.add('open');
            btn.classList.add('open');
        } else {
            wrap.classList.remove('open');
            btn.classList.remove('open');
        }
    }

    function createEmployee() {
        var nameEl = document.getElementById('emp-name');
        var surnameEl = document.getElementById('emp-surname');
        var pinEl = document.getElementById('emp-pin');
        var roleEl = document.getElementById('emp-role');
        var nombre = nameEl.value.trim();
        var apellido = surnameEl.value.trim();
        var pin = pinEl.value.trim();
        var role = roleEl ? roleEl.value : 'employee';

        if (!nombre) { showFeedback('emp-feedback', 'error', 'Introduce el nombre del empleado.'); return; }
        if (!apellido) { showFeedback('emp-feedback', 'error', 'Introduce el apellido del empleado.'); return; }

        if (role === 'admin') {
            if (!/^\d{6}$/.test(pin)) { showFeedback('emp-feedback', 'error', 'El PIN de administrador debe ser 6 cifras.'); return; }
        } else {
            if (!/^\d{4}$/.test(pin)) { showFeedback('emp-feedback', 'error', 'El PIN debe ser exactamente 4 cifras.'); return; }
        }

        var btn = document.getElementById('admin-emp-create');
        btn.disabled = true;
        btn.textContent = 'Creando...';
        hideFeedback('emp-feedback');

        Api.createEmployee(nombre, apellido, pin, role).then(function (res) {
            btn.disabled = false;
            btn.textContent = 'Crear empleado';

            if (res && res.success) {
                nameEl.value = '';
                surnameEl.value = '';
                pinEl.value = '';
                if (roleEl) roleEl.value = 'employee';
                updatePinLabel('employee', 'emp-pin-label', 'emp-pin');
                showFeedback('emp-feedback', 'success', 'Empleado creado correctamente.', 4000);
                employeeSelectCache = null;
                loadEmployees();
                if (newFormVisible) toggleNewForm();
            } else {
                showFeedback('emp-feedback', 'error', (res && res.message) || 'No se pudo crear el empleado.');
            }
        });
    }

    function loadEmployees() {
        var list = document.getElementById('admin-employee-list');
        list.textContent = '';

        var loading = document.createElement('p');
        loading.className = 'loading-text';
        loading.textContent = 'Cargando empleados...';
        list.appendChild(loading);

        Api.getEmployees().then(function (res) {
            list.textContent = '';

            if (!res || !res.success) {
                renderEmployeeState(list, resolveEmployeeLoadError(res), true);
                return;
            }

            if (!res.data || res.data.length === 0) {
                renderEmployeeState(list, 'No hay empleados registrados');
                return;
            }

            res.data.forEach(function (employee) {
                list.appendChild(renderEmployeeItem(employee));
            });
        }).catch(function () {
            list.textContent = '';
            renderEmployeeState(list, 'No se pudieron cargar los empleados.', true);
        });
    }

    function renderEmployeeState(list, message, isError) {
        var state = document.createElement('p');
        state.className = 'loading-text';
        state.textContent = message;
        if (isError) {
            state.style.color = '#b91c1c';
        }
        list.appendChild(state);
    }

    function resolveEmployeeLoadError(res) {
        if (res && (res.error === 'AUTH_REQUIRED' || res.error === 'SESSION_EXPIRED' || res.error === 'SESSION_NOT_FOUND' || res.error === 'TOKEN_INVALID')) {
            return 'La sesion de ajustes ha caducado. Vuelve a entrar.';
        }

        return (res && res.message) || 'No se pudieron cargar los empleados.';
    }

    function renderEmployeeItem(employee) {
        var item = document.createElement('div');
        item.className = 'employee-item';

        /* Avatar */
        var avatar = document.createElement('div');
        avatar.className = 'employee-avatar' + (employee.role === 'admin' ? ' avatar-admin' : '');
        avatar.textContent = initials(employee.nombre, employee.apellido);

        /* Info */
        var info = document.createElement('div');
        info.className = 'employee-info';

        var name = document.createElement('div');
        name.className = 'employee-name';
        name.textContent = ((employee.nombre || '') + ' ' + (employee.apellido || '')).trim();
        info.appendChild(name);

        var meta = document.createElement('div');
        meta.className = 'employee-meta';

        var statusBadge = document.createElement('span');
        statusBadge.className = 'employee-badge ' + (employee.attendance_enabled ? 'badge-active' : 'badge-inactive');
        statusBadge.textContent = employee.attendance_enabled ? 'Activo' : 'Inactivo';
        meta.appendChild(statusBadge);

        if (employee.role === 'admin') {
            var adminBadge = document.createElement('span');
            adminBadge.className = 'employee-badge badge-admin';
            adminBadge.textContent = 'Admin';
            meta.appendChild(adminBadge);
        }

        info.appendChild(meta);

        /* Actions */
        var actions = document.createElement('div');
        actions.className = 'employee-actions';

        var toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'toggle-switch' + (employee.attendance_enabled ? ' active' : '');
        toggle.setAttribute('aria-label', employee.attendance_enabled ? 'Desactivar empleado' : 'Activar empleado');
        var knob = document.createElement('span');
        knob.className = 'toggle-knob';
        toggle.appendChild(knob);
        Utils.bindPress(toggle, function () {
            toggleActive(employee.id, employee.attendance_enabled);
        });
        actions.appendChild(toggle);

        var editBtn = document.createElement('button');
        editBtn.className = 'btn-edit-emp';
        editBtn.type = 'button';
        editBtn.setAttribute('aria-label', 'Editar empleado');
        editBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>';
        Utils.bindPress(editBtn, function () {
            openEditModal(employee);
        });
        actions.appendChild(editBtn);

        item.appendChild(avatar);
        item.appendChild(info);
        item.appendChild(actions);
        return item;
    }

    function toggleActive(employeeId, currentState) {
        Api.updateEmployee(employeeId, undefined, undefined, null, !currentState, undefined).then(function (res) {
            if (res && res.success) {
                employeeSelectCache = null;
                loadEmployees();
            }
        });
    }

    /* ===== Edit Modal ===== */
    function openEditModal(employee) {
        editingEmployee = employee;
        document.getElementById('edit-emp-name').value = employee.nombre || '';
        document.getElementById('edit-emp-surname').value = employee.apellido || '';
        document.getElementById('edit-emp-pin').value = '';

        var roleSelect = document.getElementById('edit-emp-role');
        if (roleSelect) roleSelect.value = employee.role || 'employee';
        updatePinLabel(employee.role || 'employee', 'edit-emp-pin-label', 'edit-emp-pin');

        var toggleBtn = document.getElementById('edit-emp-active');
        var toggleLabel = document.getElementById('edit-emp-active-label');
        if (toggleBtn) {
            toggleBtn.classList.toggle('active', !!employee.attendance_enabled);
        }
        if (toggleLabel) toggleLabel.textContent = employee.attendance_enabled ? 'Activo' : 'Inactivo';

        hideFeedback('edit-emp-feedback');
        document.getElementById('modal-edit-emp').classList.remove('hidden');
    }

    function closeEditModal() {
        editingEmployee = null;
        document.getElementById('modal-edit-emp').classList.add('hidden');
    }

    function saveEditEmployee() {
        var nombre = document.getElementById('edit-emp-name').value.trim();
        var apellido = document.getElementById('edit-emp-surname').value.trim();
        var pin = document.getElementById('edit-emp-pin').value.trim();
        var roleSelect = document.getElementById('edit-emp-role');
        var role = roleSelect ? roleSelect.value : undefined;
        var toggleBtn = document.getElementById('edit-emp-active');
        var isActive = toggleBtn ? toggleBtn.classList.contains('active') : undefined;

        if (!nombre || !apellido) {
            showFeedback('edit-emp-feedback', 'error', 'Nombre y apellido son obligatorios.');
            return;
        }

        if (pin) {
            if (role === 'admin' && !/^\d{6}$/.test(pin)) {
                showFeedback('edit-emp-feedback', 'error', 'El PIN de administrador debe ser 6 cifras.');
                return;
            }
            if (role === 'employee' && !/^\d{4}$/.test(pin)) {
                showFeedback('edit-emp-feedback', 'error', 'El PIN de empleado debe ser 4 cifras.');
                return;
            }
        }

        if (role === 'admin' && editingEmployee && editingEmployee.role !== 'admin' && !pin) {
            showFeedback('edit-emp-feedback', 'error', 'Al cambiar a administrador debes establecer un PIN de 6 cifras.');
            return;
        }

        if (role === 'employee' && editingEmployee && editingEmployee.role === 'admin' && !pin) {
            showFeedback('edit-emp-feedback', 'error', 'Al cambiar a empleado debes establecer un PIN de 4 cifras.');
            return;
        }

        var btn = document.getElementById('edit-emp-save');
        btn.disabled = true;
        btn.textContent = 'Guardando...';

        Api.updateEmployee(editingEmployee.id, nombre, apellido, pin || null, isActive, role).then(function (res) {
            btn.disabled = false;
            btn.textContent = 'Guardar';

            if (res && res.success) {
                closeEditModal();
                employeeSelectCache = null;
                loadEmployees();
            } else {
                showFeedback('edit-emp-feedback', 'error', (res && res.message) || 'Error al guardar.');
            }
        });
    }

    /* =========================================================
       ACUERDOS TAB
       ========================================================= */

    function toggleAcuerdoForm() {
        acuerdoFormVisible = !acuerdoFormVisible;
        var wrap = document.getElementById('admin-acuerdo-form-wrap');
        var btn  = document.getElementById('admin-acuerdo-nuevo');
        if (wrap) wrap.classList.toggle('open', acuerdoFormVisible);
        if (btn)  btn.classList.toggle('open', acuerdoFormVisible);

        if (acuerdoFormVisible) {
            populateEmployeeSelect();
        }
    }

    function populateEmployeeSelect() {
        var select = document.getElementById('acuerdo-emp-select');
        if (!select) return;

        if (employeeSelectCache) {
            renderEmployeeOptions(select, employeeSelectCache);
            return;
        }

        Api.getEmployees().then(function (res) {
            if (!res || !res.success || !res.data) return;
            employeeSelectCache = res.data;
            renderEmployeeOptions(select, res.data);
        });
    }

    function renderEmployeeOptions(select, employees) {
        while (select.options.length > 1) {
            select.remove(1);
        }
        employees.forEach(function (emp) {
            if (emp.role === 'admin') return;
            var opt = document.createElement('option');
            opt.value       = emp.id;
            opt.textContent = emp.nombre + ' ' + (emp.apellido || '');
            select.appendChild(opt);
        });
    }

    function createAcuerdo() {
        var empSelect = document.getElementById('acuerdo-emp-select');
        var representanteInput = document.getElementById('acuerdo-representante');
        var empId = empSelect ? String(empSelect.value || '').trim() : '';
        var representante = representanteInput ? String(representanteInput.value || '').trim() : '';

        hideFeedback('acuerdo-form-feedback');

        if (!empId)         { showFeedback('acuerdo-form-feedback', 'error', 'Selecciona un participante.'); return; }
        if (!representante) { showFeedback('acuerdo-form-feedback', 'error', 'Escribe el nombre del representante.'); return; }

        var btn = document.getElementById('admin-acuerdo-crear');
        if (btn) { btn.disabled = true; btn.textContent = 'Creando...'; }

        Api.createContract({
            employeeId:          empId,
            activityDescription: 'Gesti\u00f3n del Punto de Entrega SEUR \u2014 Punto Inclusivo',
            schedule:            'Seg\u00fan turnos elegidos libremente por el/la Participante',
            validityText:        '3 meses, renovable autom\u00e1ticamente',
            representativeName:  representante
        }).then(function (res) {
            if (btn) { btn.disabled = false; btn.textContent = 'Crear acuerdo'; }

            if (res && res.success) {
                showFeedback('acuerdo-form-feedback', 'success', 'Acuerdo creado correctamente.', 3000);
                var s = document.getElementById('acuerdo-emp-select');
                var r = document.getElementById('acuerdo-representante');
                if (s) s.value = '';
                if (r) r.value = '';
                toggleAcuerdoForm();
                loadAcuerdosList();
            } else {
                showFeedback('acuerdo-form-feedback', 'error', (res && res.message) || 'Error al crear el acuerdo.');
            }
        });
    }

    function loadAcuerdosList() {
        var list = document.getElementById('admin-acuerdo-list');
        if (!list) return;
        list.textContent = '';

        var loading = document.createElement('p');
        loading.className   = 'loading-text';
        loading.textContent = 'Cargando acuerdos...';
        list.appendChild(loading);

        Api.listAllContracts().then(function (res) {
            list.textContent = '';

            if (!res || !res.success) {
                renderEmployeeState(list, 'No se pudieron cargar los acuerdos.', true);
                return;
            }

            if (!res.contracts || res.contracts.length === 0) {
                renderEmployeeState(list, 'No hay acuerdos registrados aún.');
                return;
            }

            res.contracts.forEach(function (c) {
                list.appendChild(renderAcuerdoRow(c));
            });
        });
    }

    function renderAcuerdoRow(contract) {
        var row = document.createElement('div');
        row.className = 'acuerdo-row';

        var statusLabel = '<span class="acuerdo-status acuerdo-status--pending">Pendiente participante</span>';
        if (contract.status === 'pending_admin') {
            statusLabel = '<span class="acuerdo-status acuerdo-status--pending">Pendiente fundacion</span>';
        } else if (contract.status === 'signed') {
            statusLabel = '<span class="acuerdo-status acuerdo-status--signed">Firmado</span>';
        } else if (contract.status === 'cancelled') {
            statusLabel = '<span class="acuerdo-status acuerdo-status--cancel">Cancelado</span>';
        }

        var dateStr = contract.created_at
            ? new Date(contract.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })
            : '—';

        var info = document.createElement('div');
        info.className   = 'acuerdo-row-info';
        info.innerHTML   =
            '<div class="acuerdo-row-name">' + escapeHtml(contract.employee_name || '—') + '</div>' +
            '<div class="acuerdo-row-date">' + dateStr + ' · ' + statusLabel + '</div>';

        row.appendChild(info);

        if (contract.status === 'signed') {
            var dlBtn = document.createElement('button');
            dlBtn.className = 'btn-acuerdo-descargar';
            dlBtn.innerHTML = DOWNLOAD_ICON + ' PDF';
            (function (id) {
                Utils.bindPress(dlBtn, function () {
                    downloadContractPdf(id, dlBtn);
                });
            }(contract.id));
            row.appendChild(dlBtn);
        } else {
            var btn = document.createElement('button');
            btn.className   = 'btn-acuerdo-iniciar';
            btn.textContent = contract.status === 'pending_admin' ? 'Cofirmar' : 'Iniciar firma';
            (function (id) {
                Utils.bindPress(btn, function () {
                    App.navigateToContract(id);
                });
            }(contract.id));
            row.appendChild(btn);
        }

        return row;
    }

    function escapeHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // ── PDF download ────────────────────────────────────────────────────────

    function downloadContractPdf(contractId, btnEl) {
        if (btnEl) {
            btnEl.disabled = true;
            btnEl.textContent = 'Generando\u2026';
        }
        function resetBtn() {
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.innerHTML = DOWNLOAD_ICON + ' PDF';
            }
        }
        Api.getContractPdfData(contractId).then(function (res) {
            resetBtn();
            if (!res || !res.success || !res.data) {
                App.showToast('No se pudo obtener el acuerdo', 'error');
                return;
            }
            generateContractPdf(res.data);
        }).catch(function () {
            resetBtn();
            App.showToast('Error de conexion', 'error');
        });
    }

    function generateContractPdf(data) {
        var jsPDF = window.jspdf && window.jspdf.jsPDF;
        if (!jsPDF) {
            App.showToast('Error: libreria PDF no disponible', 'error');
            return;
        }

        var doc = new jsPDF({ unit: 'mm', format: 'a4' });
        var pw = 210;
        var margin = 20;
        var cw = pw - 2 * margin;
        var y = margin;
        var lineH = 5;

        function checkPage(needed) {
            if (y + needed > 277) {
                doc.addPage();
                y = margin;
            }
        }

        // Title
        doc.setFontSize(13);
        doc.setFont('helvetica', 'bold');
        doc.text('ACUERDO DE PARTICIPACION EN ACTIVIDAD OCUPACIONAL', pw / 2, y, { align: 'center' });
        y += 12;

        // Opening
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        var opening = 'Entre la Fundacion Ambitos (\u00abla Fundacion\u00bb) y ' + (data.employee_name || '\u2014') + ' (\u00abel/la Participante\u00bb), ambas partes acuerdan lo siguiente:';
        var openLines = doc.splitTextToSize(opening, cw);
        checkPage(openLines.length * lineH + 8);
        doc.text(openLines, margin, y);
        y += openLines.length * lineH + 8;

        // Clauses
        var clauses = getContractClauses();
        doc.setFontSize(10);
        for (var i = 0; i < clauses.length; i++) {
            var cl = clauses[i];
            var titleLines = doc.splitTextToSize(cl.title, cw);
            var textLines = doc.splitTextToSize(cl.text, cw);
            var needed = titleLines.length * lineH + textLines.length * lineH + 8;
            checkPage(needed);

            doc.setFont('helvetica', 'bold');
            doc.text(titleLines, margin, y);
            y += titleLines.length * lineH + 2;
            doc.setFont('helvetica', 'normal');
            doc.text(textLines, margin, y);
            y += textLines.length * lineH + 6;
        }

        // Closing
        doc.setFont('helvetica', 'italic');
        var closing = 'Ambas partes firman electronicamente a continuacion en senal de conformidad.';
        var closingLines = doc.splitTextToSize(closing, cw);
        checkPage(closingLines.length * lineH + 8);
        doc.text(closingLines, margin, y);
        y += closingLines.length * lineH + 12;

        // Signatures
        checkPage(70);
        var colW = cw / 2 - 5;
        var rightX = margin + colW + 10;

        doc.setDrawColor(180, 180, 180);
        doc.setLineWidth(0.3);
        doc.line(margin, y, margin + cw, y);
        y += 8;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.text('El/la Participante:', margin, y);
        doc.text('Por la Fundacion:', rightX, y);
        y += 6;

        if (data.participant_sign_base64) {
            try { doc.addImage(data.participant_sign_base64, 'PNG', margin, y, colW, 22); } catch (_e) { /* skip */ }
        }
        if (data.admin_sign_base64) {
            try { doc.addImage(data.admin_sign_base64, 'PNG', rightX, y, colW, 22); } catch (_e) { /* skip */ }
        }
        y += 28;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        if (data.participant_signed_at) {
            doc.text(formatPdfDate(data.participant_signed_at), margin, y);
        }
        if (data.admin_signed_at) {
            doc.text(formatPdfDate(data.admin_signed_at), rightX, y);
        }
        y += 6;
        doc.text(data.employee_name || '', margin, y);
        doc.text(data.representative_name || '', rightX, y);
        y += 5;
        if (data.admin_signer_name) {
            doc.text('Firmado por: ' + data.admin_signer_name, rightX, y);
            y += 5;
        }

        // Hash
        y += 4;
        doc.setFontSize(7);
        doc.setTextColor(120, 120, 120);
        if (data.document_hash) {
            doc.text('Hash del documento: ' + data.document_hash, margin, y);
        }

        // Download
        var safeName = (data.employee_name || 'acuerdo').replace(/[^a-zA-Z0-9\u00c0-\u017f]/g, '_').replace(/_+/g, '_');
        doc.save('Acuerdo_' + safeName + '.pdf');
    }

    function getContractClauses() {
        return [
            {
                title: 'Primera \u2014 Objeto',
                text: 'El/la Participante se incorpora voluntariamente a la actividad ocupacional de gestion del Punto de Entrega SEUR \u2014 Punto Inclusivo, operado por la Fundacion. Esta actividad forma parte de un programa de terapia ocupacional y no constituye relacion laboral de ningun tipo.'
            },
            {
                title: 'Segunda \u2014 Marco legal',
                text: 'La presente actividad se enmarca en el Real Decreto 2274/1985, de 4 de diciembre, por el que se regulan los Centros Ocupacionales para personas con discapacidad, y se desarrolla bajo los principios de la terapia ocupacional como profesion sanitaria regulada por la Ley 44/2003 de Ordenacion de las Profesiones Sanitarias, la Ley 24/2014 del Consejo General de Colegios de Terapeutas Ocupacionales y la Ley 1/2017 de la Comunidad de Madrid.'
            },
            {
                title: 'Tercera \u2014 Horario',
                text: 'El/la Participante escoge libremente los turnos en los que desea participar cada semana, de acuerdo con la disponibilidad del punto de entrega. No existe obligacion de asistencia minima.'
            },
            {
                title: 'Cuarta \u2014 Gratificacion',
                text: 'El/la Participante recibira mensualmente una gratificacion proporcional a las horas efectivamente realizadas durante ese mes. Esta gratificacion tiene caracter terapeutico-ocupacional y no constituye salario ni retribucion laboral. La retribucion se empleara para reforzar las actividades de ocio y tiempo libre.'
            },
            {
                title: 'Quinta \u2014 Voluntariedad y baja',
                text: 'La participacion es completamente voluntaria. Cualquiera de las partes puede dar por finalizado este acuerdo en cualquier momento, sin necesidad de preaviso ni penalizacion.'
            },
            {
                title: 'Sexta \u2014 Seguro y cobertura',
                text: 'La Fundacion garantiza que el/la Participante esta cubierto/a por un seguro de responsabilidad civil y accidentes durante el desarrollo de la actividad.'
            },
            {
                title: 'Septima \u2014 Proteccion de datos',
                text: 'Los datos personales del Participante se tratan conforme al Reglamento (UE) 2016/679 (RGPD) y la Ley Organica 3/2018 (LOPDGDD). La Fundacion es responsable del tratamiento, con la finalidad exclusiva de gestionar esta actividad ocupacional. El/la Participante puede ejercer sus derechos de acceso, rectificacion, supresion y portabilidad dirigiendose a la Fundacion.'
            },
            {
                title: 'Octava \u2014 Vigencia',
                text: 'Este acuerdo tiene una duracion de tres meses desde la fecha de firma, renovable automaticamente por periodos iguales salvo comunicacion en contrario por cualquiera de las partes.'
            }
        ];
    }

    function formatPdfDate(isoStr) {
        try {
            var d = new Date(isoStr);
            return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
                ' ' + d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
        } catch (_e) {
            return isoStr || '';
        }
    }

    /* =========================================================
       RECIBOS TAB
       ========================================================= */

    function initReceiptMonth() {
        var now = new Date();
        receiptYear = now.getFullYear();
        receiptMonth = now.getMonth() + 1;
        updateReceiptLabel();
    }

    function updateReceiptLabel() {
        var label = document.getElementById('admin-receipt-month-label');
        if (label) label.textContent = Utils.MONTH_NAMES[receiptMonth - 1] + ' ' + receiptYear;
    }

    function changeReceiptMonth(delta) {
        if (!receiptYear) initReceiptMonth();
        receiptMonth += delta;
        if (receiptMonth < 1) { receiptYear--; receiptMonth = 12; }
        else if (receiptMonth > 12) { receiptYear++; receiptMonth = 1; }
        loadReceiptMonth();
    }

    function loadReceiptMonth() {
        if (!receiptYear) initReceiptMonth();
        updateReceiptLabel();

        var list = document.getElementById('admin-receipt-list');
        list.textContent = '';

        var loading = document.createElement('p');
        loading.className = 'loading-text';
        loading.textContent = 'Cargando recibos...';
        list.appendChild(loading);

        hideFeedback('admin-receipt-feedback');

        Api.listReceipts(receiptYear, receiptMonth).then(function (res) {
            list.textContent = '';

            if (!res || !res.success) {
                renderEmployeeState(list, (res && res.message) || 'No se pudieron cargar los recibos.', true);
                return;
            }

            renderReceiptList(res.receipts || []);
        }).catch(function () {
            list.textContent = '';
            renderEmployeeState(list, 'Error de conexion al cargar recibos.', true);
        });
    }

    function renderReceiptList(receipts) {
        var list = document.getElementById('admin-receipt-list');
        list.textContent = '';

        var summaryEl = document.getElementById('admin-receipt-summary');
        var counterEl = document.getElementById('admin-receipt-counter');
        var generateBtn = document.getElementById('admin-receipt-generate');
        var bulkBtn = document.getElementById('admin-receipt-bulk-pdf');

        if (!receipts || receipts.length === 0) {
            renderEmployeeState(list, 'No hay recibos para este mes.');
            if (summaryEl) summaryEl.classList.add('hidden');
            if (generateBtn) generateBtn.innerHTML = CALC_ICON + ' Generar recibos';
            if (bulkBtn) bulkBtn.classList.add('hidden');
            return;
        }

        var signed = 0;
        receipts.forEach(function (r) {
            if (r.status === 'signed') signed++;
        });

        /* Summary */
        if (summaryEl) summaryEl.classList.remove('hidden');
        if (counterEl) counterEl.textContent = signed + ' de ' + receipts.length + ' firmados';

        /* Generate button label */
        if (generateBtn) {
            generateBtn.innerHTML = CALC_ICON + ' Regenerar pendientes';
        }

        /* Bulk PDF button */
        if (bulkBtn) {
            if (signed > 0) {
                bulkBtn.classList.remove('hidden');
            } else {
                bulkBtn.classList.add('hidden');
            }
        }

        /* Render rows */
        receipts.forEach(function (receipt) {
            list.appendChild(renderReceiptRow(receipt));
        });
    }

    function renderReceiptRow(receipt) {
        var row = document.createElement('div');
        row.className = 'receipt-row';

        var info = document.createElement('div');
        info.className = 'receipt-row-info';

        var name = receipt.employee_name || receipt.employee_name_snapshot || '\u2014';
        var statusLbl, statusClass;
        if (receipt.status === 'signed') {
            statusClass = 'receipt-status--signed';
            var dateStr = receipt.employee_signed_at
                ? new Date(receipt.employee_signed_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' })
                : '';
            statusLbl = 'Firmado' + (dateStr ? ' ' + dateStr : '');
        } else {
            statusClass = 'receipt-status--pending';
            statusLbl = 'Pendiente';
        }

        info.innerHTML =
            '<div class="receipt-row-name">' + escapeHtml(name) + '</div>' +
            '<div class="receipt-row-meta">' +
                escapeHtml(Number(receipt.hours_worked || 0).toFixed(1)) + 'h \u00b7 ' +
                escapeHtml(Number(receipt.amount_earned || 0).toFixed(2)) + ' \u20ac \u00b7 ' +
                '<span class="receipt-status ' + statusClass + '">' + statusLbl + '</span>' +
            '</div>';
        row.appendChild(info);

        if (receipt.status === 'signed') {
            var dlBtn = document.createElement('button');
            dlBtn.className = 'btn-receipt-pdf';
            dlBtn.innerHTML = DOWNLOAD_ICON + ' PDF';
            (function (id) {
                Utils.bindPress(dlBtn, function () { downloadReceiptPdf(id, dlBtn); });
            })(receipt.id);
            row.appendChild(dlBtn);
        }

        return row;
    }

    function generateReceipts() {
        if (!receiptYear) initReceiptMonth();
        var btn = document.getElementById('admin-receipt-generate');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = SPINNER_ICON + ' Generando...';
        }
        hideFeedback('admin-receipt-feedback');

        Api.generateReceipts(receiptYear, receiptMonth).then(function (res) {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = CALC_ICON + ' Generar recibos';
            }

            if (res && res.success) {
                var msg = 'Recibos generados: ' + (res.generated || 0);
                if (res.skippedSigned) msg += ' (omitidos firmados: ' + res.skippedSigned + ')';
                showFeedback('admin-receipt-feedback', 'success', msg, 5000);
                loadReceiptMonth();
            } else {
                showFeedback('admin-receipt-feedback', 'error', (res && res.message) || 'No se pudieron generar los recibos.', 5000);
            }
        }).catch(function () {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = CALC_ICON + ' Generar recibos';
            }
            showFeedback('admin-receipt-feedback', 'error', 'Error de conexion.', 5000);
        });
    }

    function downloadReceiptPdf(receiptId, btnEl) {
        if (btnEl) {
            btnEl.disabled = true;
            btnEl.textContent = 'Generando\u2026';
        }
        function resetBtn() {
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.innerHTML = DOWNLOAD_ICON + ' PDF';
            }
        }

        Api.getReceiptPdf(receiptId).then(function (res) {
            resetBtn();
            if (!res || !res.success || !res.pdfBase64) {
                showFeedback('admin-receipt-feedback', 'error', (res && res.message) || 'No se pudo descargar el recibo.', 4000);
                return;
            }
            triggerPdfDownload(res.pdfBase64, 'Recibo_' + receiptId + '.pdf');
        }).catch(function () {
            resetBtn();
            showFeedback('admin-receipt-feedback', 'error', 'Error de conexion.', 4000);
        });
    }

    function downloadBulkPdf() {
        if (!receiptYear) initReceiptMonth();
        var btn = document.getElementById('admin-receipt-bulk-pdf');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = SPINNER_ICON + ' Generando...';
        }

        Api.getBulkReceiptPdf(receiptYear, receiptMonth).then(function (res) {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = DOWNLOAD_ICON + ' Descargar todos';
            }

            if (!res || !res.success || !res.pdfBase64) {
                showFeedback('admin-receipt-feedback', 'error', (res && res.message) || 'No se pudo generar el PDF.', 4000);
                return;
            }

            var filename = res.filename || ('Recibos_' + receiptYear + '_' + String(receiptMonth).padStart(2, '0') + '.pdf');
            triggerPdfDownload(res.pdfBase64, filename);
        }).catch(function () {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = DOWNLOAD_ICON + ' Descargar todos';
            }
            showFeedback('admin-receipt-feedback', 'error', 'Error de conexion.', 4000);
        });
    }

    function triggerPdfDownload(base64, filename) {
        var binary = atob(base64);
        var bytes = new Uint8Array(binary.length);
        for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        var blob = new Blob([bytes], { type: 'application/pdf' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    return { init: init, show: show };
})();
