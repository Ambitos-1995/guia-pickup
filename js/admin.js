/* =====================================================
   ADMIN - Admin panel (payments, employees)
   ===================================================== */
var Admin = (function () {
    'use strict';

    function init() {
        var tabs = document.querySelectorAll('.admin-tab');
        tabs.forEach(function (tab) {
            tab.addEventListener('click', function () {
                tabs.forEach(function (t) { t.classList.remove('active'); });
                tab.classList.add('active');

                document.querySelectorAll('.admin-section').forEach(function (section) {
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

        document.getElementById('admin-pay-save').addEventListener('click', savePayment);
        document.getElementById('admin-pay-calculate').addEventListener('click', doCalculatePayments);
        document.getElementById('admin-emp-create').addEventListener('click', createEmployee);
        document.getElementById('edit-emp-cancel').addEventListener('click', closeEditModal);
        document.getElementById('edit-emp-save').addEventListener('click', saveEditEmployee);

        var now = new Date();
        document.getElementById('admin-pay-year').value = now.getFullYear();
        document.getElementById('admin-pay-month').value = now.getMonth() + 1;
    }

    function show() {
        loadEmployees();
    }

    // ---- PAYMENTS ----

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

        Api.setPaymentAmount(year, month, amount, getAdminPin()).then(function (res) {
            btn.disabled = false;
            btn.textContent = 'Guardar importe';

            if (res && res.success) {
                showPayFeedback('success', 'Importe de ' + amount.toFixed(2) + '\u20AC guardado correctamente.');
            } else {
                showPayFeedback('error', res.message || 'No se pudo guardar.');
            }
        });
    }

    function doCalculatePayments() {
        var year = parseInt(document.getElementById('admin-pay-year').value, 10);
        var month = parseInt(document.getElementById('admin-pay-month').value, 10);

        var btn = document.getElementById('admin-pay-calculate');
        btn.disabled = true;
        btn.textContent = 'Calculando...';

        Api.calculatePayments(year, month, getAdminPin()).then(function (res) {
            btn.disabled = false;
            btn.textContent = 'Calcular pagos';

            if (res && res.success) {
                showPaymentResults(res.data);
            } else {
                showPayFeedback('error', res.message || 'Error al calcular. Guarda el importe primero.');
            }
        });
    }

    function showPayFeedback(type, msg) {
        var el = document.getElementById('admin-pay-feedback');
        if (!el) return;
        el.textContent = msg;
        el.className = 'employee-form-feedback ' + (type === 'success' ? 'feedback-success' : 'feedback-error');
    }

    function showPaymentResults(data) {
        var resultsEl = document.getElementById('admin-pay-results');
        var tbody = document.getElementById('admin-pay-tbody');
        var tfoot = document.getElementById('admin-pay-tfoot');

        resultsEl.classList.remove('hidden');

        if (!data || !data.calculations || data.calculations.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:#6b7280">Sin turnos asignados este mes</td></tr>';
            tfoot.innerHTML = '<tr><td>Tarifa/hora</td><td></td><td>' + (data && data.rate_per_hour ? data.rate_per_hour.toFixed(2) + ' \u20AC' : '--') + '</td></tr>' +
                              '<tr><td>Para la entidad</td><td>' + (data && data.total_slot_hours ? data.total_slot_hours + 'h' : '') + '</td><td>' + (data && data.total_seur_amount ? data.total_seur_amount.toFixed(2) + ' \u20AC' : '0 \u20AC') + '</td></tr>';
            return;
        }

        var html = '';
        for (var i = 0; i < data.calculations.length; i++) {
            var c = data.calculations[i];
            html += '<tr>';
            html += '<td>' + (c.employee_name || '--') + '</td>';
            html += '<td>' + (c.hours_worked || 0) + 'h</td>';
            html += '<td>' + (c.amount_earned != null ? c.amount_earned.toFixed(2) + ' \u20AC' : '0 \u20AC') + '</td>';
            html += '</tr>';
        }
        tbody.innerHTML = html;

        tfoot.innerHTML =
            '<tr class="tfoot-rate"><td>Tarifa/hora</td><td>' + data.total_slot_hours + 'h totales</td><td>' + data.rate_per_hour.toFixed(2) + ' \u20AC/h</td></tr>' +
            '<tr><td>Total empleados</td><td>' + data.assigned_hours + 'h</td><td>' + data.total_paid.toFixed(2) + ' \u20AC</td></tr>' +
            '<tr class="tfoot-org"><td>Para la entidad</td><td>' + data.free_hours + 'h libres</td><td>' + data.org_keeps.toFixed(2) + ' \u20AC</td></tr>';
    }

    // ---- EMPLOYEES ----

    var editingEmployeeId = null;

    function openEditModal(id, nombre, apellido) {
        editingEmployeeId = id;
        document.getElementById('edit-emp-name').value = nombre;
        document.getElementById('edit-emp-surname').value = apellido;
        document.getElementById('edit-emp-pin').value = '';
        hideEditFeedback();
        document.getElementById('modal-edit-emp').classList.remove('hidden');
    }

    function closeEditModal() {
        document.getElementById('modal-edit-emp').classList.add('hidden');
        editingEmployeeId = null;
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

        Api.updateEmployee(editingEmployeeId, nombre, apellido, pin || null, getAdminPin())
            .then(function (res) {
                btn.disabled = false;
                btn.textContent = 'Guardar';
                if (res && res.success) {
                    closeEditModal();
                    loadEmployees();
                } else {
                    showEditFeedback('error', res.message || 'Error al guardar.');
                }
            });
    }

    function getAdminPin() {
        var s = App.getSession();
        return (s && s.pin) || '';
    }

    function createEmployee() {
        var nameEl = document.getElementById('emp-name');
        var surnameEl = document.getElementById('emp-surname');
        var pinEl = document.getElementById('emp-pin');

        var nombre = nameEl.value.trim();
        var apellido = surnameEl.value.trim();
        var pin = pinEl.value.trim();

        // Validation
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

        Api.createEmployee(nombre, apellido, pin, getAdminPin()).then(function (res) {
            btn.disabled = false;
            btn.textContent = 'Crear empleado';

            if (res && res.success) {
                showEmpFeedback('success', 'Empleado ' + nombre + ' ' + apellido + ' creado correctamente.');
                nameEl.value = '';
                surnameEl.value = '';
                pinEl.value = '';
                loadEmployees();
            } else {
                showEmpFeedback('error', res.message || 'No se pudo crear el empleado.');
            }
        }).catch(function () {
            btn.disabled = false;
            btn.textContent = 'Crear empleado';
            showEmpFeedback('error', 'Error de conexion al crear el empleado.');
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
        list.innerHTML = '<p class="loading-text">Cargando empleados...</p>';

        Api.getEmployees(getAdminPin()).then(function (res) {
            if (!res || !res.data || res.data.length === 0) {
                list.innerHTML = '<p class="loading-text">No hay empleados registrados</p>';
                return;
            }

            var html = '';
            for (var i = 0; i < res.data.length; i++) {
                var emp = res.data[i];
                var fullName = (emp.nombre || '') + ' ' + (emp.apellido || '');
                fullName = fullName.trim() || emp.employee_code || emp.id;
                var initials = fullName.split(' ').map(function (w) { return w[0] || ''; }).join('').substring(0, 2).toUpperCase();
                var badgeClass = emp.attendance_enabled ? 'badge-active' : 'badge-inactive';
                var badgeText = emp.attendance_enabled ? 'Activo' : 'Inactivo';

                html += '<div class="employee-item">';
                html += '<div class="employee-avatar">' + initials + '</div>';
                html += '<div class="employee-info">';
                html += '<div class="employee-name">' + fullName + '</div>';
                html += '</div>';
                html += '<span class="employee-badge ' + badgeClass + '">' + badgeText + '</span>';
                html += '<button class="btn-edit-emp" data-id="' + emp.id + '" data-nombre="' + (emp.nombre || '') + '" data-apellido="' + (emp.apellido || '') + '">Editar</button>';
                html += '</div>';
            }
            list.innerHTML = html;
            list.querySelectorAll('.btn-edit-emp').forEach(function (btn) {
                btn.addEventListener('click', function () {
                    openEditModal(btn.dataset.id, btn.dataset.nombre, btn.dataset.apellido);
                });
            });
        });
    }

    return { init: init, show: show };
})();
