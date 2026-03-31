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
        var accessToken = typeof opts.accessToken === 'string' ? opts.accessToken.trim() : '';
        var offlineClockToken = typeof opts.offlineClockToken === 'string' ? opts.offlineClockToken.trim() : '';

        if (opts.requiresAuth) {
            if (!accessToken && !offlineClockToken) {
                if (!session || !session.accessToken) {
                    return Promise.resolve({ success: false, error: 'AUTH_REQUIRED', message: 'Sesion requerida' });
                }
                accessToken = session.accessToken;
            }
            if (accessToken) {
                headers.Authorization = 'Bearer ' + accessToken;
            }
        }

        if (offlineClockToken) {
            headers['X-Kiosk-Clock-Token'] = offlineClockToken;
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
                if (!opts.suppressTouchSession && opts.requiresAuth && !opts.accessToken && !opts.offlineClockToken && session && session.accessToken &&
                    !(res.status === 401 || res.status === 403) &&
                    typeof App !== 'undefined' && App.touchSession) {
                    App.touchSession();
                }
                if (!opts.silentAuthFailure && opts.requiresAuth && (res.status === 401 || res.status === 403) &&
                    payload && (payload.error === 'AUTH_REQUIRED' || payload.error === 'SESSION_EXPIRED' || payload.error === 'TOKEN_INVALID' || payload.error === 'SESSION_NOT_FOUND')) {
                    if (typeof App !== 'undefined' && App.handleAuthFailure) {
                        App.handleAuthFailure(payload.message || 'Tu sesion ha caducado.');
                    }
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

    function buildAuthOptions(options) {
        var resolved = options || {};
        var authOptions = {
            requiresAuth: true,
            silentAuthFailure: !!resolved.silentAuthFailure,
            suppressTouchSession: !!resolved.suppressTouchSession
        };

        if (resolved.accessToken) {
            authOptions.accessToken = resolved.accessToken;
        }
        if (resolved.offlineClockToken) {
            authOptions.offlineClockToken = resolved.offlineClockToken;
        }

        return authOptions;
    }

    function resolveEmployeeAndOptions(employeeIdOrOptions, options) {
        if (employeeIdOrOptions && typeof employeeIdOrOptions === 'object' && !Array.isArray(employeeIdOrOptions)) {
            return {
                employeeId: undefined,
                options: employeeIdOrOptions
            };
        }

        return {
            employeeId: employeeIdOrOptions,
            options: options
        };
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

    function checkIn(clientDate, options) {
        if (clientDate && typeof clientDate === 'object' && !Array.isArray(clientDate)) {
            options = clientDate;
            clientDate = undefined;
        }

        return postJson(FUNCTIONS_BASE + '/kiosk-clock', {
            orgSlug: ORG_SLUG,
            action: 'check-in',
            clientDate: clientDate || Utils.today(),
            clientTimestamp: (options && typeof options.clientTimestamp === 'string' && options.clientTimestamp) ? options.clientTimestamp : new Date().toISOString(),
            clientEventId: (options && typeof options.clientEventId === 'string' && options.clientEventId) ? options.clientEventId : ''
        }, buildAuthOptions(options));
    }

    function checkOut(clientDate, options) {
        if (clientDate && typeof clientDate === 'object' && !Array.isArray(clientDate)) {
            options = clientDate;
            clientDate = undefined;
        }

        return postJson(FUNCTIONS_BASE + '/kiosk-clock', {
            orgSlug: ORG_SLUG,
            action: 'check-out',
            clientDate: clientDate || Utils.today(),
            clientTimestamp: (options && typeof options.clientTimestamp === 'string' && options.clientTimestamp) ? options.clientTimestamp : new Date().toISOString(),
            clientEventId: (options && typeof options.clientEventId === 'string' && options.clientEventId) ? options.clientEventId : ''
        }, buildAuthOptions(options));
    }

    function getClockStatus(clientDate, options) {
        if (clientDate && typeof clientDate === 'object' && !Array.isArray(clientDate)) {
            options = clientDate;
            clientDate = undefined;
        }

        return postJson(FUNCTIONS_BASE + '/kiosk-clock', {
            orgSlug: ORG_SLUG,
            action: 'status',
            clientDate: clientDate || Utils.today()
        }, buildAuthOptions(options));
    }

    function getWeekSlots(year, week) {
        return postJson(FUNCTIONS_BASE + '/kiosk-schedule', {
            action: 'list',
            orgSlug: ORG_SLUG,
            year: year,
            week: week
        });
    }

    function assignSlot(slotId, employeeId, options) {
        var resolved = resolveEmployeeAndOptions(employeeId, options);
        var body = {
            action: 'assign',
            orgSlug: ORG_SLUG,
            slotId: slotId
        };

        if (resolved.employeeId) body.employeeId = resolved.employeeId;

        return postJson(FUNCTIONS_BASE + '/kiosk-schedule', body, buildAuthOptions(resolved.options));
    }

    function createAndAssignSlot(year, week, dayOfWeek, hour, employeeId, options) {
        var resolved = resolveEmployeeAndOptions(employeeId, options);
        var body = {
            action: 'create-and-assign',
            orgSlug: ORG_SLUG,
            year: year,
            week: week,
            dayOfWeek: dayOfWeek,
            hour: hour
        };

        if (resolved.employeeId) body.employeeId = resolved.employeeId;

        return postJson(FUNCTIONS_BASE + '/kiosk-schedule', body, buildAuthOptions(resolved.options));
    }

    function releaseSlot(slotId, options) {
        return postJson(FUNCTIONS_BASE + '/kiosk-schedule', {
            action: 'release',
            orgSlug: ORG_SLUG,
            slotId: slotId
        }, buildAuthOptions(options));
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

    // ── Acuerdos de participacion Punto Inclusivo ─────────────────────────────

    function getContract(contractId) {
        return postJson(FUNCTIONS_BASE + '/kiosk-contract', {
            orgSlug: ORG_SLUG,
            action: 'get',
            contractId: contractId
        }, { requiresAuth: true });
    }

    function getContractsByEmployee(employeeId) {
        return postJson(FUNCTIONS_BASE + '/kiosk-contract', {
            orgSlug: ORG_SLUG,
            action: 'list',
            employeeId: employeeId
        }, { requiresAuth: true });
    }

    function createContract(data) {
        return postJson(FUNCTIONS_BASE + '/kiosk-contract', Object.assign({
            orgSlug: ORG_SLUG,
            action: 'create'
        }, data), { requiresAuth: true });
    }

    function verifyParticipantContractPin(contractId, pin) {
        return postJson(FUNCTIONS_BASE + '/kiosk-contract', Object.assign({
            orgSlug: ORG_SLUG,
            action: 'verify-participant',
            contractId: contractId,
            pin: pin
        }), { requiresAuth: true });
    }

    function participantSignContract(contractId, verificationToken, participantSignImg) {
        return postJson(FUNCTIONS_BASE + '/kiosk-contract', {
            orgSlug: ORG_SLUG,
            action: 'participant-sign',
            contractId: contractId,
            verificationToken: verificationToken,
            participantSignImg: participantSignImg
        }, { requiresAuth: true });
    }

    function adminSignContract(contractId, adminSignImg) {
        return postJson(FUNCTIONS_BASE + '/kiosk-contract', {
            orgSlug: ORG_SLUG,
            action: 'admin-sign',
            contractId: contractId,
            adminSignImg: adminSignImg
        }, { requiresAuth: true });
    }

    function listAllContracts() {
        return postJson(FUNCTIONS_BASE + '/kiosk-contract', {
            orgSlug: ORG_SLUG,
            action: 'list-all'
        }, { requiresAuth: true });
    }

    function getContractPdfData(contractId) {
        return postJson(FUNCTIONS_BASE + '/kiosk-contract', {
            orgSlug: ORG_SLUG,
            action: 'get-pdf-data',
            contractId: contractId
        }, { requiresAuth: true });
    }

    // ── Recibos de pago mensuales ──────────────────────────────────────────

    function generateReceipts(year, month) {
        return postJson(FUNCTIONS_BASE + '/kiosk-payment-receipt', {
            action: 'generate',
            orgSlug: ORG_SLUG,
            year: year,
            month: month
        }, { requiresAuth: true });
    }

    function getMyReceipt(year, month) {
        return postJson(FUNCTIONS_BASE + '/kiosk-payment-receipt', {
            action: 'my-receipt',
            orgSlug: ORG_SLUG,
            year: year,
            month: month
        }, { requiresAuth: true });
    }

    function verifyReceiptPin(receiptId, pin) {
        return postJson(FUNCTIONS_BASE + '/kiosk-payment-receipt', {
            action: 'verify-pin',
            orgSlug: ORG_SLUG,
            receiptId: receiptId,
            pin: pin
        }, { requiresAuth: true });
    }

    function signReceipt(receiptId, verificationToken, signatureImg) {
        return postJson(FUNCTIONS_BASE + '/kiosk-payment-receipt', {
            action: 'sign',
            orgSlug: ORG_SLUG,
            receiptId: receiptId,
            verificationToken: verificationToken,
            signatureImg: signatureImg
        }, { requiresAuth: true });
    }

    function listReceipts(year, month) {
        return postJson(FUNCTIONS_BASE + '/kiosk-payment-receipt', {
            action: 'list',
            orgSlug: ORG_SLUG,
            year: year,
            month: month
        }, { requiresAuth: true });
    }

    function getReceiptPdf(receiptId) {
        return postJson(FUNCTIONS_BASE + '/kiosk-payment-receipt', {
            action: 'pdf',
            orgSlug: ORG_SLUG,
            receiptId: receiptId
        }, { requiresAuth: true });
    }

    function getBulkReceiptPdf(year, month) {
        return postJson(FUNCTIONS_BASE + '/kiosk-payment-receipt', {
            action: 'bulk-pdf',
            orgSlug: ORG_SLUG,
            year: year,
            month: month
        }, { requiresAuth: true });
    }

    function reportClientError(payload) {
        var session = (typeof App !== 'undefined' && App.getSession) ? App.getSession() : null;
        return postJson(FUNCTIONS_BASE + '/kiosk-report', {
            orgSlug: ORG_SLUG,
            route: (window.location && window.location.pathname) || '',
            appVersion: (typeof App !== 'undefined' && App.getVersion) ? App.getVersion() : '',
            deviceLabel: navigator.userAgent.slice(0, 256),
            reportType: payload.reportType || 'client_error',
            payload: {
                message: payload.message || '',
                stack: payload.stack || null,
                source: payload.source || null,
                lineno: payload.lineno || null,
                colno: payload.colno || null,
                employeeId: session ? (session.employeeId || null) : null
            }
        });
    }

    return {
        ORG_SLUG: ORG_SLUG,
        verifyPin: verifyPin,
        verifyAdminPin: verifyAdminPin,
        checkIn: checkIn,
        checkOut: checkOut,
        getClockStatus: getClockStatus,
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
        getPaymentSummary: getPaymentSummary,
        getContract: getContract,
        getContractsByEmployee: getContractsByEmployee,
        createContract: createContract,
        verifyParticipantContractPin: verifyParticipantContractPin,
        participantSignContract: participantSignContract,
        adminSignContract: adminSignContract,
        listAllContracts: listAllContracts,
        getContractPdfData: getContractPdfData,
        generateReceipts: generateReceipts,
        getMyReceipt: getMyReceipt,
        verifyReceiptPin: verifyReceiptPin,
        signReceipt: signReceipt,
        listReceipts: listReceipts,
        getReceiptPdf: getReceiptPdf,
        getBulkReceiptPdf: getBulkReceiptPdf,
        reportClientError: reportClientError
    };
})();
