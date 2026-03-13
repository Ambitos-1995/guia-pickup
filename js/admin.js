/* =====================================================
   ADMIN - Payments and employees
   ===================================================== */
var Admin = (function () {
    'use strict';

    var editingEmployeeId = null;

    function init() {
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

        Utils.bindPress(document.getElementById('admin-pay-save'), savePayment);
        Utils.bindPress(document.getElementById('admin-pay-calculate'), calculatePayments);
        Utils.bindPress(document.getElementById('admin-emp-create'), createEmployee);
        Utils.bindPress(document.getElementById('edit-emp-cancel'), closeEditModal);
        Utils.bindPress(document.getElementById('edit-emp-save'), saveEditEmployee);

        var now = new Date();
        document.getElementById('admin-pay-year').value = now.getFullYear();
        document.getElementById('admin-pay-month').value = now.getMonth() + 1;
    }

    function show() {
        if (!App.hasAdminAccess()) {
            Pin.openForAdmin();
            App.navigate('screen-pin');
            return;
        }

        loadEmployees();
    }

    function savePayment() {
        var year = parseInt(document.getElementById('admin-pay-year').value, 10);
        var month = parseInt(document.getElementById('admin-pay-month').value, 10);
        var amount = parseFloat(document.getElementById('admin-pay-amount').value);

        if (!amount || amount <= 0) {
            showPayFeedback('error', 'Introduce un importe valido.');
            return;
        }

        var btn = document.getElementById('admin-pay-save');
        btn.disabled = true;
        btn.textContent = 'Guardando...';

        Api.setPaymentAmount(year, month, amount).then(function (res) {
            btn.disabled = false;
            btn.textContent = 'Guardar importe';

            if (res && res.success) {
                showPayFeedback('success', 'Importe guardado correctamente.');
            } else {
                showPayFeedback('error', (res && res.message) || 'No se pudo guardar.');
            }
        });
    }

    function calculatePayments() {
        var year = parseInt(document.getElementById('admin-pay-year').value, 10);
        var month = parseInt(document.getElementById('admin-pay-month').value, 10);
        var btn = document.getElementById('admin-pay-calculate');

        btn.disabled = true;
        btn.textContent = 'Calculando...';

        Api.calculatePayments(year, month).then(function (res) {
            btn.disabled = false;
            btn.textContent = 'Calcular pagos';

            if (res && res.success) {
                showPaymentResults(res.data || {});
            } else {
                showPayFeedback('error', (res && res.message) || 'No se pudieron calcular los pagos.');
            }
        });
    }

    function showPayFeedback(type, msg) {
        var el = document.getElementById('admin-pay-feedback');
        el.textContent = msg;
        el.className = 'employee-form-feedback ' + (type === 'success' ? 'feedback-success' : 'feedback-error');
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
            data.calculations.forEach(function (calculation) {
                var row = document.createElement('tr');
                row.appendChild(makeCell(calculation.employee_name || '--'));
                row.appendChild(makeCell((calculation.hours_worked || 0) + 'h'));
                row.appendChild(makeCell(statusLabel(calculation.status)));
                row.appendChild(makeCell(formatEuro(calculation.amount_earned || 0)));
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

    function statusLabel(status) {
        if (status === 'confirmed') return 'Confirmado';
        if (status === 'calculated') return 'Calculado';
        if (status === 'review_required') return 'Revision';
        return 'Pendiente';
    }

    function formatEuro(amount) {
        return Number(amount || 0).toFixed(2) + ' €';
    }

    function openEditModal(employee) {
        editingEmployeeId = employee.id;
        document.getElementById('edit-emp-name').value = employee.nombre || '';
        document.getElementById('edit-emp-surname').value = employee.apellido || '';
        document.getElementById('edit-emp-pin').value = '';
        hideEditFeedback();
        document.getElementById('modal-edit-emp').classList.remove('hidden');
    }

    function closeEditModal() {
        editingEmployeeId = null;
        document.getElementById('modal-edit-emp').classList.add('hidden');
    }

    function showEditFeedback(type, message) {
        var el = document.getElementById('edit-emp-feedback');
        el.textContent = message;
        el.className = 'employee-form-feedback ' + (type === 'success' ? 'feedback-success' : 'feedback-error');
    }

    function hideEditFeedback() {
        var el = document.getElementById('edit-emp-feedback');
        el.textContent = '';
        el.className = 'employee-form-feedback hidden';
    }

    function saveEditEmployee() {
        var nombre = document.getElementById('edit-emp-name').value.trim();
        var apellido = document.getElementById('edit-emp-surname').value.trim();
        var pin = document.getElementById('edit-emp-pin').value.trim();

        if (!nombre || !apellido) {
            showEditFeedback('error', 'Nombre y apellido son obligatorios.');
            return;
        }

        if (pin && !/^\d{4}$/.test(pin)) {
            showEditFeedback('error', 'El PIN debe ser exactamente 4 cifras.');
            return;
        }

        var btn = document.getElementById('edit-emp-save');
        btn.disabled = true;
        btn.textContent = 'Guardando...';

        Api.updateEmployee(editingEmployeeId, nombre, apellido, pin || null).then(function (res) {
            btn.disabled = false;
            btn.textContent = 'Guardar';

            if (res && res.success) {
                closeEditModal();
                loadEmployees();
            } else {
                showEditFeedback('error', (res && res.message) || 'Error al guardar.');
            }
        });
    }

    function createEmployee() {
        var nameEl = document.getElementById('emp-name');
        var surnameEl = document.getElementById('emp-surname');
        var pinEl = document.getElementById('emp-pin');
        var nombre = nameEl.value.trim();
        var apellido = surnameEl.value.trim();
        var pin = pinEl.value.trim();

        if (!nombre) {
            showEmpFeedback('error', 'Introduce el nombre del empleado.');
            return;
        }
        if (!apellido) {
            showEmpFeedback('error', 'Introduce el apellido del empleado.');
            return;
        }
        if (!/^\d{4}$/.test(pin)) {
            showEmpFeedback('error', 'El PIN debe ser exactamente 4 cifras.');
            return;
        }

        var btn = document.getElementById('admin-emp-create');
        btn.disabled = true;
        btn.textContent = 'Creando...';
        hideEmpFeedback();

        Api.createEmployee(nombre, apellido, pin).then(function (res) {
            btn.disabled = false;
            btn.textContent = 'Crear empleado';

            if (res && res.success) {
                nameEl.value = '';
                surnameEl.value = '';
                pinEl.value = '';
                showEmpFeedback('success', 'Empleado creado correctamente.');
                loadEmployees();
            } else {
                showEmpFeedback('error', (res && res.message) || 'No se pudo crear el empleado.');
            }
        });
    }

    function showEmpFeedback(type, message) {
        var el = document.getElementById('emp-feedback');
        el.textContent = message;
        el.className = 'employee-form-feedback ' + (type === 'success' ? 'feedback-success' : 'feedback-error');
    }

    function hideEmpFeedback() {
        var el = document.getElementById('emp-feedback');
        el.textContent = '';
        el.className = 'employee-form-feedback hidden';
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

        var avatar = document.createElement('div');
        avatar.className = 'employee-avatar';
        avatar.textContent = initials(employee.nombre, employee.apellido);

        var info = document.createElement('div');
        info.className = 'employee-info';

        var name = document.createElement('div');
        name.className = 'employee-name';
        name.textContent = ((employee.nombre || '') + ' ' + (employee.apellido || '')).trim();
        info.appendChild(name);

        var badge = document.createElement('span');
        badge.className = 'employee-badge ' + (employee.attendance_enabled ? 'badge-active' : 'badge-inactive');
        badge.textContent = employee.attendance_enabled ? 'Activo' : 'Inactivo';

        var button = document.createElement('button');
        button.className = 'btn-edit-emp';
        button.type = 'button';
        button.textContent = 'Editar';
        Utils.bindPress(button, function () {
            openEditModal(employee);
        });

        item.appendChild(avatar);
        item.appendChild(info);
        item.appendChild(badge);
        item.appendChild(button);
        return item;
    }

    function initials(nombre, apellido) {
        return ((nombre || '').charAt(0) + (apellido || '').charAt(0)).toUpperCase() || '--';
    }

    return { init: init, show: show };
})();
