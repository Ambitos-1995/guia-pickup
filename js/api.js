/* =====================================================
   API - Fetch wrappers (Supabase Edge Functions)
   ===================================================== */
var Api = (function () {
    'use strict';

    var ORG_SLUG = 'ambitos';
    var SUPABASE_PROJECT_URL = 'https://mzuvkinwebqgmnutchsv.supabase.co';
    var FUNCTIONS_BASE = SUPABASE_PROJECT_URL + '/functions/v1';

    function postJson(url, body, options) {
        var opts = options || {};
        var headers = { 'Content-Type': 'application/json' };
        var session = (typeof App !== 'undefined' && App.getSession) ? App.getSession() : null;

        if (opts.requiresAuth) {
            if (!session || !session.accessToken) {
                return Promise.resolve({ success: false, error: 'AUTH_REQUIRED', message: 'Sesion requerida' });
            }
            headers.Authorization = 'Bearer ' + session.accessToken;
        }

        return fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body || {})
        }).then(function (res) {
            return res.json().catch(function () {
                return { success: false, message: 'Respuesta invalida del servidor' };
            }).then(function (payload) {
                payload.httpStatus = res.status;
                if (opts.requiresAuth && (res.status === 401 || res.status === 403) &&
                    payload && (payload.error === 'AUTH_REQUIRED' || payload.error === 'SESSION_EXPIRED' || payload.error === 'TOKEN_INVALID' || payload.error === 'SESSION_NOT_FOUND')) {
                    if (typeof App !== 'undefined' && App.handleAuthFailure) {
                        App.handleAuthFailure(payload.message || 'Tu sesion ha caducado.');
                    }
                }
                if (opts.requiresAuth && session && session.accessToken &&
                    !(res.status === 401 || res.status === 403) &&
                    typeof App !== 'undefined' && App.touchSession) {
                    App.touchSession();
                }
                return payload;
            });
        }).catch(function () {
            return { success: false, message: 'Error de conexion' };
        });
    }

    function verifyAdminPin(pin) {
        return postJson(FUNCTIONS_BASE + '/kiosk-admin-verify', {
            orgSlug: ORG_SLUG,
            pin: pin
        });
    }

    function verifyPin(pin) {
        return postJson(FUNCTIONS_BASE + '/kiosk-employees', {
            action: 'verify',
            orgSlug: ORG_SLUG,
            pin: pin
        });
    }

    function getEmployees() {
        return postJson(FUNCTIONS_BASE + '/kiosk-employees', {
            action: 'list',
            orgSlug: ORG_SLUG
        }, { requiresAuth: true });
    }

    function updateEmployee(employeeId, nombre, apellido, pin, attendanceEnabled, role) {
        var body = { action: 'update', orgSlug: ORG_SLUG, employeeId: employeeId };
        if (nombre !== undefined) body.nombre = nombre;
        if (apellido !== undefined) body.apellido = apellido;
        if (pin) body.pin = pin;
        if (attendanceEnabled !== undefined) body.attendance_enabled = attendanceEnabled;
        if (role !== undefined) body.role = role;

        return postJson(FUNCTIONS_BASE + '/kiosk-employees', body, { requiresAuth: true });
    }

    function createEmployee(nombre, apellido, pin, role) {
        var body = {
            action: 'create',
            orgSlug: ORG_SLUG,
            nombre: nombre,
            apellido: apellido,
            pin: pin
        };
        if (role) body.role = role;
        return postJson(FUNCTIONS_BASE + '/kiosk-employees', body, { requiresAuth: true });
    }

    function listPaymentMonths() {
        return postJson(FUNCTIONS_BASE + '/kiosk-payment', {
            action: 'list-months',
            orgSlug: ORG_SLUG
        }, { requiresAuth: true });
    }

    function getPaymentSummary(year, month) {
        return postJson(FUNCTIONS_BASE + '/kiosk-payment', {
            action: 'get-summary',
            orgSlug: ORG_SLUG,
            year: year,
            month: month
        }, { requiresAuth: true });
    }

    function checkIn(clientDate) {
        return postJson(FUNCTIONS_BASE + '/kiosk-clock', {
            orgSlug: ORG_SLUG,
            action: 'check-in',
            clientDate: clientDate || Utils.today()
        }, { requiresAuth: true });
    }

    function getWeekSlots(year, week) {
        return postJson(FUNCTIONS_BASE + '/kiosk-schedule', {
            action: 'list',
            orgSlug: ORG_SLUG,
            year: year,
            week: week
        });
    }

    function assignSlot(slotId, employeeId) {
        var body = {
            action: 'assign',
            orgSlug: ORG_SLUG,
            slotId: slotId
        };

        if (employeeId) body.employeeId = employeeId;

        return postJson(FUNCTIONS_BASE + '/kiosk-schedule', body, { requiresAuth: true });
    }

    function createAndAssignSlot(year, week, dayOfWeek, hour, employeeId) {
        var body = {
            action: 'create-and-assign',
            orgSlug: ORG_SLUG,
            year: year,
            week: week,
            dayOfWeek: dayOfWeek,
            hour: hour
        };

        if (employeeId) body.employeeId = employeeId;

        return postJson(FUNCTIONS_BASE + '/kiosk-schedule', body, { requiresAuth: true });
    }

    function releaseSlot(slotId) {
        return postJson(FUNCTIONS_BASE + '/kiosk-schedule', {
            action: 'release',
            orgSlug: ORG_SLUG,
            slotId: slotId
        }, { requiresAuth: true });
    }

    function createAdminSlot(body) {
        return postJson(FUNCTIONS_BASE + '/kiosk-schedule', {
            action: 'create',
            orgSlug: ORG_SLUG,
            year: body.year,
            week: body.week,
            dayOfWeek: body.dayOfWeek,
            startTime: body.startTime,
            endTime: body.endTime
        }, { requiresAuth: true });
    }

    function updateAdminSlot(body) {
        return postJson(FUNCTIONS_BASE + '/kiosk-schedule', {
            action: 'update',
            orgSlug: ORG_SLUG,
            slotId: body.slotId,
            startTime: body.startTime,
            endTime: body.endTime
        }, { requiresAuth: true });
    }

    function deleteAdminSlot(slotId) {
        return postJson(FUNCTIONS_BASE + '/kiosk-schedule', {
            action: 'delete',
            orgSlug: ORG_SLUG,
            slotId: slotId
        }, { requiresAuth: true });
    }

    function getMyPaymentSummary(year, month) {
        return postJson(FUNCTIONS_BASE + '/kiosk-payment', {
            action: 'my-summary',
            orgSlug: ORG_SLUG,
            year: year,
            month: month
        }, { requiresAuth: true });
    }

    function setPaymentAmount(year, month, totalAmount) {
        return postJson(FUNCTIONS_BASE + '/kiosk-payment', {
            action: 'set-amount',
            orgSlug: ORG_SLUG,
            year: year,
            month: month,
            totalAmount: totalAmount
        }, { requiresAuth: true });
    }

    function calculatePayments(year, month) {
        return postJson(FUNCTIONS_BASE + '/kiosk-payment', {
            action: 'calculate',
            orgSlug: ORG_SLUG,
            year: year,
            month: month
        }, { requiresAuth: true });
    }

    return {
        ORG_SLUG: ORG_SLUG,
        verifyPin: verifyPin,
        verifyAdminPin: verifyAdminPin,
        checkIn: checkIn,
        getWeekSlots: getWeekSlots,
        assignSlot: assignSlot,
        createAndAssignSlot: createAndAssignSlot,
        releaseSlot: releaseSlot,
        createAdminSlot: createAdminSlot,
        updateAdminSlot: updateAdminSlot,
        deleteAdminSlot: deleteAdminSlot,
        getMyPaymentSummary: getMyPaymentSummary,
        setPaymentAmount: setPaymentAmount,
        calculatePayments: calculatePayments,
        getEmployees: getEmployees,
        createEmployee: createEmployee,
        updateEmployee: updateEmployee,
        listPaymentMonths: listPaymentMonths,
        getPaymentSummary: getPaymentSummary
    };
})();
