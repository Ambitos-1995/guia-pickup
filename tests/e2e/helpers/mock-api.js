function buildState(overrides = {}) {
  return {
    employees: [
      {
        id: 'emp-1',
        nombre: 'Ismael',
        apellido: 'Perez',
        attendance_enabled: true,
        role: 'employee',
        created_at: '2026-03-16T10:00:00.000Z'
      },
      {
        id: 'emp-2',
        nombre: 'Marta',
        apellido: 'Admin',
        attendance_enabled: true,
        role: 'admin',
        created_at: '2026-03-16T10:05:00.000Z'
      },
      {
        id: 'emp-4',
        nombre: 'Nora',
        apellido: 'Diaz',
        attendance_enabled: true,
        role: 'employee',
        created_at: '2026-03-16T10:10:00.000Z'
      }
    ],
    paymentSummary: {
      configured: false,
      total_seur_amount: 0,
      calculations: [],
      total_validated_hours: 0,
      rate_per_hour: 0,
      total_paid: 0,
      review_required_count: 0,
      org_keeps: 0
    },
    myPaymentSummary: {
      hours_worked: 24,
      amount_earned: 312.5,
      status: 'calculated',
      notes: ''
    },
    myReceipt: {
      id: 'receipt-1',
      status: 'pending',
      employee_name_snapshot: 'Ismael Perez',
      hours_worked: 24,
      hourly_rate: 13.02,
      amount_earned: 312.5,
      employee_signed_at: null
    },
    scheduleSlots: [
      {
        id: 'slot-1',
        day_of_week: 1,
        start_time: '15:00',
        end_time: '16:00',
        assigned_employee_name: 'Ismael Perez',
        assigned_employee_code: 'emp-1',
        assigned_employee_profile_id: 'emp-1'
      },
      {
        id: 'slot-2',
        day_of_week: 2,
        start_time: '16:00',
        end_time: '17:00',
        assigned_employee_name: '',
        assigned_employee_code: '',
        assigned_employee_profile_id: null
      }
    ],
    receiptList: [
      { id: 'receipt-1', employee_id: 'emp-1', employee_name: 'Ismael Perez', employee_name_snapshot: 'Ismael Perez', hours_worked: 24, amount_earned: 312.5, status: 'pending', employee_signed_at: null },
      { id: 'receipt-2', employee_id: 'emp-2', employee_name: 'Lucia Garcia', employee_name_snapshot: 'Lucia Garcia', hours_worked: 18, amount_earned: 234.36, status: 'signed', employee_signed_at: '2026-03-28T10:00:00.000Z' }
    ],
    createCalls: [],
    receiptSignCalls: [],
    scheduleActionCalls: [],
    clockActionCalls: [],
    clockStatus: 'not_checked_in',
    employeeVerifyFailuresRemaining: 0,
    clockFailuresRemaining: 0,
    clockPermanentFailuresRemaining: 0,
    clockPermanentFailureStatus: 409,
    clockPermanentFailureMessage: 'No se pudo sincronizar el fichaje pendiente.',
    clockOfflineTokenFailuresRemaining: 0,
    clockOfflineTokenFailureStatus: 401,
    clockOfflineTokenFailureError: 'CLOCK_TOKEN_EXPIRED',
    clockOfflineTokenFailureMessage: 'La credencial offline ha caducado. Conectate y vuelve a validar tu PIN.',
    clockCommitThenFailRemaining: 0,
    clockEventsById: {},
    ...overrides
  };
}

async function fulfillJson(route, payload, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(payload)
  });
}

function employeePayload(accessToken, offlineClockToken, employeeId, employeeName, currentStatus) {
  return {
    accessToken,
    expiresAt: '2099-12-31T23:59:59.000Z',
    offlineClockToken,
    offlineClockTokenExpiresAt: '2099-12-31T23:59:59.000Z',
    role: 'respondent',
    employeeId,
    employeeName,
    organizationId: 'org-1',
    currentStatus
  };
}

function resolveClockIdentity(authHeader, offlineClockToken) {
  var effectiveCredential = authHeader || offlineClockToken || '';

  if (effectiveCredential.includes('employee-token-2') || effectiveCredential.includes('offline-clock-token-2')) {
    return { employeeId: 'emp-3', employeeName: 'Lucia Garcia', isOutsideSchedule: false };
  }

  if (effectiveCredential.includes('employee-token-4') || effectiveCredential.includes('offline-clock-token-4')) {
    return { employeeId: 'emp-4', employeeName: 'Nora Diaz', isOutsideSchedule: true };
  }

  return { employeeId: 'emp-1', employeeName: 'Ismael Perez', isOutsideSchedule: false };
}

async function setupMockApi(page, overrides = {}) {
  const state = buildState(overrides);

  await page.route('https://mzuvkinwebqgmnutchsv.supabase.co/functions/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const body = request.postDataJSON ? request.postDataJSON() : JSON.parse(request.postData() || '{}');

    if (url.pathname.endsWith('/kiosk-admin-verify')) {
      if (body.pin === '123456') {
        return fulfillJson(route, {
          success: true,
          data: {
            accessToken: 'admin-token',
            expiresAt: '2099-12-31T23:59:59.000Z',
            role: 'org_admin',
            employeeId: 'emp-2',
            employeeName: 'Marta Admin',
            organizationId: 'org-1'
          }
        });
      }

      return fulfillJson(route, { success: false, message: 'PIN incorrecto' }, 401);
    }

    if (url.pathname.endsWith('/kiosk-employees')) {
      if (body.action === 'verify') {
        if (state.employeeVerifyFailuresRemaining > 0) {
          state.employeeVerifyFailuresRemaining -= 1;
          return fulfillJson(route, { success: false, message: 'Sin conexion' }, 503);
        }

        if (body.pin === '1234') {
          return fulfillJson(route, {
            success: true,
            data: employeePayload('employee-token', 'offline-clock-token-1', 'emp-1', 'Ismael Perez', 'checked_out')
          });
        }

        if (body.pin === '4321') {
          return fulfillJson(route, {
            success: true,
            data: employeePayload('employee-token-2', 'offline-clock-token-2', 'emp-3', 'Lucia Garcia', 'not_checked_in')
          });
        }

        if (body.pin === '5555') {
          return fulfillJson(route, {
            success: true,
            data: employeePayload('employee-token-4', 'offline-clock-token-4', 'emp-4', 'Nora Diaz', 'not_checked_in')
          });
        }

        return fulfillJson(route, { success: false, message: 'PIN incorrecto' }, 401);
      }

      if (body.action === 'logout') {
        return fulfillJson(route, { success: true });
      }

      if (body.action === 'list') {
        return fulfillJson(route, { success: true, data: state.employees });
      }

      if (body.action === 'create') {
        const employee = {
          id: `emp-${state.employees.length + 1}`,
          nombre: body.nombre,
          apellido: body.apellido,
          attendance_enabled: true,
          role: body.role || 'employee',
          created_at: '2026-03-16T11:00:00.000Z'
        };

        state.createCalls.push(body);
        state.employees.push(employee);
        return fulfillJson(route, { success: true, data: employee });
      }

      if (body.action === 'update') {
        const employee = state.employees.find((item) => item.id === body.employeeId);
        if (!employee) {
          return fulfillJson(route, { success: false, message: 'Empleado no encontrado' }, 404);
        }

        if (body.nombre !== undefined) employee.nombre = body.nombre;
        if (body.apellido !== undefined) employee.apellido = body.apellido;
        if (body.role !== undefined) employee.role = body.role;
        if (body.attendance_enabled !== undefined) employee.attendance_enabled = body.attendance_enabled;

        return fulfillJson(route, { success: true, data: employee });
      }
    }

    if (url.pathname.endsWith('/kiosk-payment')) {
      if (body.action === 'my-summary') {
        return fulfillJson(route, { success: true, data: state.myPaymentSummary });
      }

      if (body.action === 'get-summary') {
        return fulfillJson(route, { success: true, data: state.paymentSummary });
      }

      if (body.action === 'set-amount') {
        state.paymentSummary = {
          ...state.paymentSummary,
          configured: true,
          total_seur_amount: Number(body.totalAmount || 0)
        };
        return fulfillJson(route, { success: true, data: state.paymentSummary });
      }

      if (body.action === 'calculate') {
        state.paymentSummary = {
          ...state.paymentSummary,
          configured: true,
          calculations: [
            {
              employee_name: 'Ismael Perez',
              hours_worked: 24,
              status: 'calculated',
              amount_earned: 312.5
            }
          ],
          total_validated_hours: 24,
          rate_per_hour: 13.02,
          total_paid: 312.5,
          review_required_count: 0,
          org_keeps: 0
        };
        return fulfillJson(route, { success: true, data: state.paymentSummary });
      }
    }

    if (url.pathname.endsWith('/kiosk-payment-receipt')) {
      if (body.action === 'my-receipt') {
        return fulfillJson(route, { success: true, data: state.myReceipt });
      }

      if (body.action === 'list') {
        return fulfillJson(route, { success: true, receipts: state.receiptList || [] });
      }

      if (body.action === 'verify-pin') {
        state.receiptVerifyPinCalls = state.receiptVerifyPinCalls || [];
        state.receiptVerifyPinCalls.push(body);
        var pin = String(body.pin || '');
        if (pin === '1234' || pin === '4321' || pin === '5555') {
          return fulfillJson(route, { success: true, verificationToken: 'mock-receipt-token', employeeName: 'Mock', expiresInSeconds: 600 });
        }
        return fulfillJson(route, { success: false, message: 'PIN incorrecto' }, 401);
      }

      if (body.action === 'sign') {
        state.receiptSignCalls.push(body);
        if (!state.myReceipt || state.myReceipt.status !== 'pending') {
          return fulfillJson(route, { success: false, message: 'El recibo ya esta firmado o no esta disponible.' }, 409);
        }

        state.myReceipt = {
          ...state.myReceipt,
          status: 'signed',
          employee_signed_at: '2026-03-31T11:08:00.000Z'
        };

        return fulfillJson(route, { success: true });
      }

      if (body.action === 'generate') {
        return fulfillJson(route, { success: true, generated: 1, skippedSigned: 0 });
      }
    }

    if (url.pathname.endsWith('/kiosk-report')) {
      return fulfillJson(route, { success: true });
    }

    if (url.pathname.endsWith('/kiosk-schedule')) {
      if (body.action === 'list') {
        return fulfillJson(route, { success: true, data: state.scheduleSlots });
      }

      if (body.action === 'assign') {
        state.scheduleActionCalls.push({ action: 'assign', body, auth: request.headers()['authorization'] || '' });
        return fulfillJson(route, { success: true, data: { id: body.slotId, assigned_employee_profile_id: 'emp-1', status: 'occupied' } });
      }

      if (body.action === 'create-and-assign') {
        state.scheduleActionCalls.push({ action: 'create-and-assign', body, auth: request.headers()['authorization'] || '' });
        return fulfillJson(route, { success: true, data: { id: 'slot-new', assigned_employee_profile_id: 'emp-3', status: 'occupied' } });
      }

      if (body.action === 'release') {
        state.scheduleActionCalls.push({ action: 'release', body, auth: request.headers()['authorization'] || '' });
        return fulfillJson(route, { success: true, data: { id: body.slotId, assigned_employee_profile_id: null, status: 'free' } });
      }
    }

    if (url.pathname.endsWith('/kiosk-clock')) {
      const authHeader = request.headers()['authorization'] || '';
      const offlineClockToken = request.headers()['x-kiosk-clock-token'] || '';
      const identity = resolveClockIdentity(authHeader, offlineClockToken);

      state.clockActionCalls.push({
        action: body.action,
        auth: authHeader,
        clockToken: offlineClockToken,
        clientDate: body.clientDate || '',
        clientTimestamp: body.clientTimestamp || '',
        clientEventId: body.clientEventId || ''
      });

      if (body.action !== 'status' && state.clockFailuresRemaining > 0) {
        state.clockFailuresRemaining -= 1;
        return fulfillJson(route, {
          success: false,
          message: 'Sin conexion'
        }, 503);
      }

      if (body.action !== 'status' && state.clockPermanentFailuresRemaining > 0) {
        state.clockPermanentFailuresRemaining -= 1;
        return fulfillJson(route, {
          success: false,
          message: state.clockPermanentFailureMessage
        }, state.clockPermanentFailureStatus);
      }

      if (body.action !== 'status' && state.clockOfflineTokenFailuresRemaining > 0 && offlineClockToken) {
        state.clockOfflineTokenFailuresRemaining -= 1;
        return fulfillJson(route, {
          success: false,
          error: state.clockOfflineTokenFailureError,
          message: state.clockOfflineTokenFailureMessage
        }, state.clockOfflineTokenFailureStatus);
      }

      if (body.action !== 'status' && body.clientEventId && state.clockEventsById[body.clientEventId]) {
        const existing = state.clockEventsById[body.clientEventId];
        return fulfillJson(route, {
          success: true,
          message: existing.action === 'check-in' ? 'Entrada registrada' : 'Salida registrada',
          data: {
            employeeName: existing.employeeName,
            currentStatus: existing.currentStatus
          }
        });
      }

      if (body.action === 'status') {
        return fulfillJson(route, {
          success: true,
          data: {
            employeeName: identity.employeeName,
            currentStatus: state.clockStatus
          }
        });
      }

      if (identity.isOutsideSchedule) {
        return fulfillJson(route, {
          success: false,
          message: 'Ahora no tienes turno. Tu proximo horario es jueves 19 de marzo de 17:00 a 18:00.',
          data: {
            reason: 'outside_schedule',
            nextSlotStart: '17:00',
            nextSlotEnd: '18:00',
            nextSlotDate: '2026-03-19',
            nextSlotLabel: 'jueves 19 de marzo de 17:00 a 18:00'
          }
        }, 403);
      }

      if (body.action !== 'status' && state.clockCommitThenFailRemaining > 0) {
        state.clockCommitThenFailRemaining -= 1;
        if (body.action === 'check-out') {
          state.clockStatus = 'checked_out';
          if (body.clientEventId) {
            state.clockEventsById[body.clientEventId] = {
              action: 'check-out',
              employeeName: identity.employeeName,
              currentStatus: 'checked_out'
            };
          }
          return fulfillJson(route, { success: false, message: 'Sin conexion' }, 503);
        }

        state.clockStatus = 'checked_in';
        if (body.clientEventId) {
          state.clockEventsById[body.clientEventId] = {
            action: 'check-in',
            employeeName: identity.employeeName,
            currentStatus: 'checked_in'
          };
        }
        return fulfillJson(route, { success: false, message: 'Sin conexion' }, 503);
      }

      if (body.action === 'check-out') {
        state.clockStatus = 'checked_out';
        if (body.clientEventId) {
          state.clockEventsById[body.clientEventId] = {
            action: 'check-out',
            employeeName: identity.employeeName,
            currentStatus: 'checked_out'
          };
        }
        return fulfillJson(route, {
          success: true,
          message: 'Salida registrada',
          data: {
            employeeName: identity.employeeName,
            currentStatus: 'checked_out'
          }
        });
      }

      state.clockStatus = 'checked_in';
      if (body.clientEventId) {
        state.clockEventsById[body.clientEventId] = {
          action: 'check-in',
          employeeName: identity.employeeName,
          currentStatus: 'checked_in'
        };
      }
      return fulfillJson(route, {
        success: true,
        message: 'Entrada registrada',
        data: {
          employeeName: identity.employeeName,
          currentStatus: 'checked_in'
        }
      });
    }

    return fulfillJson(route, { success: false, message: `Unhandled mock route: ${url.pathname}` }, 500);
  });

  return state;
}

module.exports = {
  setupMockApi
};
