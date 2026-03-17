function buildState(overrides = {}) {
  return {
    employees: [
      {
        id: 'emp-1',
        nombre: 'Ismael',
        apellido: 'Pérez',
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
    scheduleSlots: [
      {
        id: 'slot-1',
        day_of_week: 1,
        start_time: '15:00',
        end_time: '16:00',
        assigned_employee_name: 'Ismael Pérez',
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
    createCalls: [],
    scheduleActionCalls: [],
    clockActionCalls: [],
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
        if (body.pin === '1234') {
          return fulfillJson(route, {
            success: true,
            data: {
              accessToken: 'employee-token',
              expiresAt: '2099-12-31T23:59:59.000Z',
              role: 'respondent',
              employeeId: 'emp-1',
              employeeName: 'Ismael Pérez',
              organizationId: 'org-1',
              currentStatus: 'checked_out'
            }
          });
        }

        if (body.pin === '4321') {
          return fulfillJson(route, {
            success: true,
            data: {
              accessToken: 'employee-token-2',
              expiresAt: '2099-12-31T23:59:59.000Z',
              role: 'respondent',
              employeeId: 'emp-3',
              employeeName: 'Lucia Garcia',
              organizationId: 'org-1',
              currentStatus: 'not_checked_in'
            }
          });
        }

        if (body.pin === '5555') {
          return fulfillJson(route, {
            success: true,
            data: {
              accessToken: 'employee-token-4',
              expiresAt: '2099-12-31T23:59:59.000Z',
              role: 'respondent',
              employeeId: 'emp-4',
              employeeName: 'Nora Diaz',
              organizationId: 'org-1',
              currentStatus: 'not_checked_in'
            }
          });
        }

        return fulfillJson(route, { success: false, message: 'PIN incorrecto' }, 401);
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
              employee_name: 'Ismael Pérez',
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
      state.clockActionCalls.push({ action: body.action, auth: request.headers()['authorization'] || '' });
      if ((request.headers()['authorization'] || '').includes('employee-token-4')) {
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

      if (body.action === 'check-out') {
        return fulfillJson(route, {
          success: true,
          message: 'Salida registrada',
          data: {
            employeeName: 'Ismael Pérez',
            currentStatus: 'checked_out'
          }
        });
      }

      return fulfillJson(route, {
        success: true,
        message: 'Entrada registrada',
        data: {
          employeeName: 'Lucia Garcia',
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
