/* =====================================================
   API - Fetch wrappers (Supabase Edge Functions)
   ===================================================== */
var Api = (function () {
    'use strict';

    var ORG_SLUG = 'ambitos';
    var SUPABASE_PROJECT_URL = 'https://mzuvkinwebqgmnutchsv.supabase.co';
    var FUNCTIONS_BASE = SUPABASE_PROJECT_URL + '/functions/v1';

    /** POST JSON helper */
    function postJson(url, body) {
        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(function (res) { return res.json(); })
          .catch(function () { return { success: false, message: 'Error de conexion' }; });
    }

    // ---- ADMIN: Verify admin PIN ----

    function verifyAdminPin(pin) {
        return postJson(FUNCTIONS_BASE + '/kiosk-admin-verify', {
            orgSlug: ORG_SLUG,
            pin: pin
        });
    }

    // ---- EMPLOYEES: Verify employee PIN ----

    function verifyPin(pin) {
        return postJson(FUNCTIONS_BASE + '/kiosk-employees', {
            action: 'verify',
            orgSlug: ORG_SLUG,
            pin: pin
        });
    }

    // ---- EMPLOYEES: List (admin) ----

    function getEmployees(adminPin) {
        return postJson(FUNCTIONS_BASE + '/kiosk-employees', {
            action: 'list',
            orgSlug: ORG_SLUG,
            adminPin: adminPin
        });
    }

    // ---- EMPLOYEES: Create (admin) ----

    function updateEmployee(employeeId, nombre, apellido, pin, adminPin) {
        var body = { action: 'update', orgSlug: ORG_SLUG, adminPin: adminPin, employeeId: employeeId };
        if (nombre) body.nombre = nombre;
        if (apellido) body.apellido = apellido;
        if (pin) body.pin = pin;
        return postJson(FUNCTIONS_BASE + '/kiosk-employees', body);
    }

    function createEmployee(nombre, apellido, pin, adminPin) {
        return postJson(FUNCTIONS_BASE + '/kiosk-employees', {
            action: 'create',
            orgSlug: ORG_SLUG,
            adminPin: adminPin,
            nombre: nombre,
            apellido: apellido,
            pin: pin
        });
    }

    // ---- CLOCK: Check in / Check out ----

    function checkIn(pin, clientDate) {
        return postJson(FUNCTIONS_BASE + '/kiosk-clock', {
            orgSlug: ORG_SLUG,
            pin: pin,
            action: 'check-in',
            clientDate: clientDate || Utils.today(),
            tzOffset: -new Date().getTimezoneOffset()
        });
    }

    // ---- SCHEDULE: Slots (Supabase Edge Functions) ----

    function getWeekSlots(year, week) {
        return postJson(FUNCTIONS_BASE + '/kiosk-schedule', {
            action: 'list', orgSlug: ORG_SLUG, year: year, week: week
        });
    }

    function assignByPin(pin, slotId, year, week) {
        return postJson(FUNCTIONS_BASE + '/kiosk-schedule', {
            action: 'assign', orgSlug: ORG_SLUG,
            pin: pin, slotId: slotId, year: year, week: week
        });
    }

    function createAdminSlot(body) {
        var session = (typeof App !== 'undefined') ? App.getSession() : null;
        var adminPin = (session && session.pin) || '';
        return postJson(FUNCTIONS_BASE + '/kiosk-schedule', {
            action: 'create', orgSlug: ORG_SLUG, adminPin: adminPin,
            year: body.year, week: body.week,
            dayOfWeek: body.dayOfWeek, startTime: body.startTime, endTime: body.endTime
        });
    }

    function modifyByPin(slotId, pin, action, options) {
        return postJson(FUNCTIONS_BASE + '/kiosk-schedule', {
            action: 'release', orgSlug: ORG_SLUG,
            pin: pin, slotId: slotId,
            signupId: options && options.signupId ? options.signupId : slotId,
            year: options && options.year ? options.year : null,
            week: options && options.week ? options.week : null
        });
    }

    // ---- PAYMENTS ----

    function getMyPaymentSummary(pin, year, month) {
        return postJson(FUNCTIONS_BASE + '/kiosk-payment', {
            action: 'my-summary', orgSlug: ORG_SLUG,
            pin: pin, year: year, month: month
        });
    }

    function setPaymentAmount(year, month, totalAmount, adminPin) {
        return postJson(FUNCTIONS_BASE + '/kiosk-payment', {
            action: 'set-amount', orgSlug: ORG_SLUG,
            adminPin: adminPin, year: year, month: month, totalAmount: totalAmount
        });
    }

    function calculatePayments(year, month, adminPin) {
        return postJson(FUNCTIONS_BASE + '/kiosk-payment', {
            action: 'calculate', orgSlug: ORG_SLUG,
            adminPin: adminPin, year: year, month: month
        });
    }

    return {
        ORG_SLUG: ORG_SLUG,
        verifyPin: verifyPin,
        verifyAdminPin: verifyAdminPin,
        checkIn: checkIn,
        getWeekSlots: getWeekSlots,
        assignByPin: assignByPin,
        modifyByPin: modifyByPin,
        createAdminSlot: createAdminSlot,
        getMyPaymentSummary: getMyPaymentSummary,
        setPaymentAmount: setPaymentAmount,
        calculatePayments: calculatePayments,
        getEmployees: getEmployees,
        createEmployee: createEmployee,
        updateEmployee: updateEmployee
    };
})();
