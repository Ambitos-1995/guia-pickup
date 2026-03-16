/* =====================================================
   ADMIN - Payments and employees (redesigned)
   ===================================================== */
var Admin = (function () {
    'use strict';

    var editingEmployee = null;
    var currentYear, currentMonth;
    var newFormVisible = false;

    var CALC_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="8" y1="6" x2="16" y2="6"/><line x1="16" y1="14" x2="16" y2="14"/><line x1="16" y1="18" x2="16" y2="18"/><line x1="12" y1="14" x2="12" y2="14"/><line x1="12" y1="18" x2="12" y2="18"/><line x1="8" y1="14" x2="8" y2="14"/><line x1="8" y1="18" x2="8" y2="18"/><line x1="8" y1="10" x2="16" y2="10"/></svg>';
    var SPINNER_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>';

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

        loadPayMonth();
        loadEmployees();
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

            if (!res || !res.success || !res.data || res.data.length === 0) {
                var empty = document.createElement('p');
                empty.className = 'loading-text';
                empty.textContent = 'No hay empleados registrados';
                list.appendChild(empty);
                return;
            }

            res.data.forEach(function (employee) {
                list.appendChild(renderEmployeeItem(employee));
            });
        });
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
                loadEmployees();
            } else {
                showFeedback('edit-emp-feedback', 'error', (res && res.message) || 'Error al guardar.');
            }
        });
    }

    return { init: init, show: show };
})();
