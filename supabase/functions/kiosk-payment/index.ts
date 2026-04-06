import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  authHeaders,
  computeWorkedMinutes,
  corsHeaders,
  initCors,
  fetchJson,
  getSupabaseConfig,
  isoWeekToDate,
  json,
  logAudit,
  logUnhandledEdgeError,
  requireSession,
  resolveOrgId,
  slotFallsInMonth,
} from "../_shared/kiosk.ts";

interface RequestBody {
  action?: string;
  orgSlug?: string;
  year?: number;
  month?: number;
  totalAmount?: number;
  notes?: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  initCors(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ success: false, message: "Metodo no permitido" }, 405);
  }

  let errUrl = "";
  let errKey = "";
  try {
    const body = await req.json() as RequestBody;
    const action = String(body.action || "").trim();
    const orgSlug = String(body.orgSlug || "").trim();

    if (!orgSlug) {
      return json({ success: false, message: "Falta la organizacion" }, 400);
    }

    const { url, serviceRoleKey } = getSupabaseConfig();
    errUrl = url; errKey = serviceRoleKey;
    const orgId = await resolveOrgId(url, serviceRoleKey, orgSlug);
    if (!orgId) {
      return json({ success: false, message: "Organizacion no encontrada" }, 404);
    }

    if (action === "my-summary") {
      const auth = await requireSession(req, url, serviceRoleKey, ["respondent"]);
      if (auth instanceof Response) return auth;
      if (auth.session.organization_id !== orgId || !auth.session.employee_id) {
        return json({ success: false, message: "Sesion fuera de la organizacion activa" }, 403);
      }
      return await handleMySummary(url, serviceRoleKey, auth.session, body);
    }

    const auth = await requireSession(req, url, serviceRoleKey, ["org_admin"]);
    if (auth instanceof Response) return auth;
    if (auth.session.organization_id !== orgId) {
      return json({ success: false, message: "Sesion fuera de la organizacion activa" }, 403);
    }

    if (action === "set-amount") {
      return await handleSetAmount(url, serviceRoleKey, auth.session.id, auth.session.organization_id, body);
    }

    if (action === "calculate") {
      return await handleCalculate(url, serviceRoleKey, auth.session.id, auth.session.organization_id, body);
    }

    if (action === "list-months") {
      return await handleListMonths(url, serviceRoleKey, auth.session.organization_id);
    }

    if (action === "get-summary") {
      return await handleGetSummary(url, serviceRoleKey, auth.session.organization_id, body);
    }

    return json({ success: false, message: "Accion no valida" }, 400);
  } catch (error) {
    await logUnhandledEdgeError(errUrl, errKey, "kiosk-payment", error, { requestMethod: req.method });
    console.error("kiosk-payment error", error);
    return json({ success: false, message: "Error interno" }, 500);
  }
});

async function handleSetAmount(
  url: string,
  key: string,
  sessionId: string,
  orgId: string,
  body: RequestBody,
): Promise<Response> {
  const year = Number(body.year);
  const month = Number(body.month);
  const totalAmount = Number(body.totalAmount);
  const notes = String(body.notes || "").trim();

  if (!year || !month || month < 1 || month > 12) {
    return json({ success: false, message: "Ano o mes invalido" }, 400);
  }

  if (!isMonthClosed(year, month)) {
    return json({ success: false, message: "Solo se puede configurar meses ya cerrados. Disponible a partir del dia 1 del proximo mes." }, 400);
  }

  if (Number.isNaN(totalAmount) || totalAmount < 0) {
    return json({ success: false, message: "Importe invalido" }, 400);
  }

  const save = await fetchJson<Array<{ id: string; total_amount: string; notes: string }>>(
    `${url}/rest/v1/kiosk_payment_months`,
    {
      method: "POST",
      headers: {
        ...authHeaders(key),
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        organization_id: orgId,
        year,
        month,
        total_amount: totalAmount,
        notes,
      }),
    },
  );

  if (!save.ok || !save.data[0]) {
    return json({ success: false, message: "Error al guardar el importe" }, 500);
  }

  await logAudit(url, key, {
    organizationId: orgId,
    actorSessionId: sessionId,
    actorRole: "org_admin",
    action: "payment_amount_saved",
    metadata: { year, month, totalAmount },
  });

  return json({ success: true, data: save.data[0] });
}

async function handleCalculate(
  url: string,
  key: string,
  sessionId: string,
  orgId: string,
  body: RequestBody,
): Promise<Response> {
  const year = Number(body.year);
  const month = Number(body.month);

  if (!year || !month || month < 1 || month > 12) {
    return json({ success: false, message: "Ano o mes invalido" }, 400);
  }

  if (!isMonthClosed(year, month)) {
    return json({ success: false, message: "Solo se puede calcular meses ya cerrados. Disponible a partir del dia 1 del proximo mes." }, 400);
  }

  const amountRes = await fetchJson<Array<{ total_amount: string }>>(
    `${url}/rest/v1/kiosk_payment_months?select=total_amount&organization_id=eq.${orgId}&year=eq.${year}&month=eq.${month}&limit=1`,
    { headers: authHeaders(key) },
  );

  const paymentMonth = amountRes.ok ? amountRes.data[0] : null;
  if (!paymentMonth) {
    return json({ success: false, message: "No hay importe configurado para este mes" }, 404);
  }

  const totalAmount = Number(paymentMonth.total_amount);
  const monthStart = `${year}-${String(month).padStart(2, "0")}-01`;
  const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

  const [slotsRes, attendanceRes] = await Promise.all([
    fetchJson<Array<{
      id: string;
      year: number;
      week: number;
      day_of_week: number;
      start_time: string;
      end_time: string;
      employee_id: string | null;
      kiosk_employees: { id: string; nombre: string; apellido: string } | null;
    }>>(
      `${url}/rest/v1/kiosk_schedule_slots?select=id,year,week,day_of_week,start_time,end_time,employee_id,kiosk_employees(id,nombre,apellido)&organization_id=eq.${orgId}&year=in.(${year - 1},${year},${year + 1})`,
      { headers: authHeaders(key) },
    ),
    fetchJson<Array<{
      employee_id: string;
      slot_id: string | null;
      recorded_at: string;
      client_date: string;
      action: string;
    }>>(
      `${url}/rest/v1/kiosk_attendance?select=employee_id,slot_id,recorded_at,client_date,action&organization_id=eq.${orgId}&client_date=gte.${monthStart}&client_date=lte.${monthEnd}&action=eq.check_in`,
      { headers: authHeaders(key) },
    ),
  ]);

  if (!slotsRes.ok) {
    return json({ success: false, message: "Error al obtener los turnos del mes" }, 500);
  }

  if (!attendanceRes.ok) {
    return json({ success: false, message: "Error al obtener los fichajes del mes" }, 500);
  }

  const monthSlots = slotsRes.data.filter((slot) => slotFallsInMonth(slot.year, slot.week, slot.day_of_week, year, month));

  const slotMap = new Map(monthSlots.map((slot) => [slot.id, slot]));
  const attendanceBySlot = new Map<string, Array<{ employee_id: string; recorded_at: string }>>();
  const anomalies = new Map<string, string[]>();
  const names = new Map<string, string>();

  for (const slot of monthSlots) {
    if (slot.employee_id && slot.kiosk_employees) {
      names.set(slot.employee_id, `${slot.kiosk_employees.nombre} ${slot.kiosk_employees.apellido}`.trim());
    }
  }

  for (const row of attendanceRes.data) {
    if (!row.slot_id) {
      pushAnomaly(anomalies, row.employee_id, "Fichaje sin franja asociada");
      continue;
    }

    const slot = slotMap.get(row.slot_id);
    if (!slot) {
      pushAnomaly(anomalies, row.employee_id, "Fichaje fuera del calendario conciliable");
      continue;
    }

    if (!slot.employee_id || slot.employee_id !== row.employee_id) {
      pushAnomaly(anomalies, row.employee_id, "Fichaje con franja asignada a otra persona");
      continue;
    }

    const list = attendanceBySlot.get(row.slot_id) || [];
    list.push({ employee_id: row.employee_id, recorded_at: row.recorded_at });
    attendanceBySlot.set(row.slot_id, list);
  }

  const perEmployee = new Map<string, { workedMinutes: number; slotCount: number }>();
  for (const slot of monthSlots) {
    if (!slot.employee_id) continue;

    const rows = attendanceBySlot.get(slot.id) || [];
    if (rows.length === 0) continue;
    if (rows.length > 1) {
      pushAnomaly(anomalies, slot.employee_id, "Mas de un fichaje para la misma franja");
      continue;
    }

    const slotDate = isoWeekToDate(slot.year, slot.week, slot.day_of_week);
    const workedMinutes = computeWorkedMinutes(slotDate, slot.start_time, slot.end_time, rows[0].recorded_at);
    if (workedMinutes <= 0) {
      pushAnomaly(anomalies, slot.employee_id, "Fichaje fuera de la ventana valida del turno");
      continue;
    }

    const current = perEmployee.get(slot.employee_id) || { workedMinutes: 0, slotCount: 0 };
    current.workedMinutes += workedMinutes;
    current.slotCount += 1;
    perEmployee.set(slot.employee_id, current);
  }

  const totalPossibleMinutes = monthSlots.reduce((sum, slot) => {
    const [sh, sm] = slot.start_time.split(":").map(Number);
    const [eh, em] = slot.end_time.split(":").map(Number);
    return sum + ((eh * 60 + em) - (sh * 60 + sm));
  }, 0);
  const totalPossibleHours = totalPossibleMinutes / 60;
  const validatedMinutes = Array.from(perEmployee.values()).reduce((sum, item) => sum + item.workedMinutes, 0);
  const validatedHours = validatedMinutes / 60;
  const hourlyRate = totalPossibleHours > 0 ? totalAmount / totalPossibleHours : 0;

  const affectedEmployeeIds = new Set<string>([
    ...Array.from(perEmployee.keys()),
    ...Array.from(anomalies.keys()),
  ]);

  const settlementRows = Array.from(affectedEmployeeIds).map((employeeId) => {
    const entry = perEmployee.get(employeeId) || { workedMinutes: 0, slotCount: 0 };
    const anomalyNotes = anomalies.get(employeeId) || [];
    const hasAnomalies = anomalyNotes.length > 0;
    const hoursWorked = round2(entry.workedMinutes / 60);
    const amountEarned = hoursWorked > 0 ? round2(hoursWorked * hourlyRate) : 0;
    const status = hasAnomalies
      ? "review_required"
      : hoursWorked > 0
      ? "calculated"
      : "pending";

    return {
      organization_id: orgId,
      employee_id: employeeId,
      year,
      month,
      status,
      hours_worked: hoursWorked,
      hourly_rate: hoursWorked > 0 ? round4(hourlyRate) : 0,
      amount_earned: amountEarned,
      worked_minutes: entry.workedMinutes,
      slot_count: entry.slotCount,
      employee_name_snapshot: names.get(employeeId) || "",
      notes: anomalyNotes.join(" | "),
      meta: { anomalies: anomalyNotes },
    };
  });

  if (settlementRows.length > 0) {
    const insert = await fetch(
      `${url}/rest/v1/kiosk_payment_settlements`,
      {
        method: "POST",
        headers: {
          ...authHeaders(key),
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates",
        },
        body: JSON.stringify(settlementRows),
      },
    );

    if (!insert.ok) {
      return json({ success: false, message: "Error al guardar las liquidaciones" }, 500);
    }
    const employeeIds = settlementRows.map((row) => row.employee_id);
    await fetch(
      `${url}/rest/v1/kiosk_payment_settlements?organization_id=eq.${orgId}&year=eq.${year}&month=eq.${month}&employee_id=not.in.(${employeeIds.join(",")})`,
      {
        method: "DELETE",
        headers: authHeaders(key),
      },
    );
  } else {
    await fetch(
      `${url}/rest/v1/kiosk_payment_settlements?organization_id=eq.${orgId}&year=eq.${year}&month=eq.${month}`,
      {
        method: "DELETE",
        headers: authHeaders(key),
      },
    );
  }

  const calculations = settlementRows.map((row) => ({
    employee_id: row.employee_id,
    employee_name: row.employee_name_snapshot || row.employee_id,
    hours_worked: row.hours_worked,
    amount_earned: row.amount_earned,
    status: row.status,
  }));

  const totalPaid = round2(settlementRows.reduce((sum, row) => sum + row.amount_earned, 0));
  const reviewCount = settlementRows.filter((row) => row.status === "review_required").length;

  await logAudit(url, key, {
    organizationId: orgId,
    actorSessionId: sessionId,
    actorRole: "org_admin",
    action: "payments_calculated",
    metadata: { year, month, reviewCount, totalPaid },
  });

  return json({
    success: true,
    data: {
      total_seur_amount: round2(totalAmount),
      total_possible_hours: round2(totalPossibleHours),
      total_validated_hours: round2(validatedHours),
      rate_per_hour: round2(hourlyRate),
      total_paid: totalPaid,
      org_keeps: round2(totalAmount - totalPaid),
      review_required_count: reviewCount,
      calculations,
    },
  });
}

async function handleMySummary(
  url: string,
  key: string,
  session: { organization_id: string; employee_id: string },
  body: RequestBody,
): Promise<Response> {
  const year = Number(body.year);
  const month = Number(body.month);

  if (!year || !month || month < 1 || month > 12) {
    return json({ success: false, message: "Falta ano o mes" }, 400);
  }

  const employeeRes = await fetchJson<Array<{ id: string; nombre: string; apellido: string }>>(
    `${url}/rest/v1/kiosk_employees?select=id,nombre,apellido&id=eq.${session.employee_id}&organization_id=eq.${session.organization_id}&limit=1`,
    { headers: authHeaders(key) },
  );

  const employee = employeeRes.ok ? employeeRes.data[0] : null;
  if (!employee) {
    return json({ success: false, message: "Empleado no encontrado" }, 404);
  }

  const settlementRes = await fetchJson<Array<{
    hours_worked: number;
    hourly_rate: number;
    amount_earned: number;
    status: "pending" | "calculated" | "review_required" | "confirmed";
    notes: string;
  }>>(
    `${url}/rest/v1/kiosk_payment_settlements?select=hours_worked,hourly_rate,amount_earned,status,notes&organization_id=eq.${session.organization_id}&employee_id=eq.${session.employee_id}&year=eq.${year}&month=eq.${month}&limit=1`,
    { headers: authHeaders(key) },
  );

  const settlement = settlementRes.ok ? settlementRes.data[0] : null;
  if (!settlement) {
    return json({
      success: true,
      data: {
        employee_name: `${employee.nombre} ${employee.apellido}`.trim(),
        hours_worked: 0,
        hourly_rate: 0,
        amount_earned: 0,
        status: "pending",
        notes: "",
      },
    });
  }

  return json({
    success: true,
    data: {
      employee_name: `${employee.nombre} ${employee.apellido}`.trim(),
      hours_worked: Number(settlement.hours_worked || 0),
      hourly_rate: Number(settlement.hourly_rate || 0),
      amount_earned: Number(settlement.amount_earned || 0),
      status: settlement.status,
      notes: settlement.notes || "",
    },
  });
}

async function handleListMonths(
  url: string,
  key: string,
  orgId: string,
): Promise<Response> {
  const res = await fetchJson<Array<{
    year: number;
    month: number;
    total_amount: string;
    notes: string;
  }>>(
    `${url}/rest/v1/kiosk_payment_months?select=year,month,total_amount,notes&organization_id=eq.${orgId}&order=year.desc,month.desc`,
    { headers: authHeaders(key) },
  );

  if (!res.ok) {
    return json({ success: false, message: "Error al listar meses" }, 500);
  }

  return json({ success: true, data: res.data });
}

async function handleGetSummary(
  url: string,
  key: string,
  orgId: string,
  body: RequestBody,
): Promise<Response> {
  const year = Number(body.year);
  const month = Number(body.month);

  if (!year || !month || month < 1 || month > 12) {
    return json({ success: false, message: "Ano o mes invalido" }, 400);
  }

  const [amountRes, settlementsRes] = await Promise.all([
    fetchJson<Array<{ total_amount: string; notes: string }>>(
      `${url}/rest/v1/kiosk_payment_months?select=total_amount,notes&organization_id=eq.${orgId}&year=eq.${year}&month=eq.${month}&limit=1`,
      { headers: authHeaders(key) },
    ),
    fetchJson<Array<{
      employee_id: string;
      employee_name_snapshot: string;
      hours_worked: number;
      hourly_rate: number;
      amount_earned: number;
      status: string;
      notes: string;
    }>>(
      `${url}/rest/v1/kiosk_payment_settlements?select=employee_id,employee_name_snapshot,hours_worked,hourly_rate,amount_earned,status,notes&organization_id=eq.${orgId}&year=eq.${year}&month=eq.${month}`,
      { headers: authHeaders(key) },
    ),
  ]);

  const paymentMonth = amountRes.ok ? amountRes.data[0] : null;
  const settlements = settlementsRes.ok ? settlementsRes.data : [];

  if (!paymentMonth) {
    return json({ success: true, data: { configured: false, total_seur_amount: 0, calculations: [] } });
  }

  const totalAmount = Number(paymentMonth.total_amount);
  const totalPaid = settlements.reduce((sum, s) => sum + Number(s.amount_earned || 0), 0);
  const totalHours = settlements.reduce((sum, s) => sum + Number(s.hours_worked || 0), 0);
  const reviewCount = settlements.filter((s) => s.status === "review_required").length;
  const storedRate = settlements.find((s) => Number(s.hourly_rate || 0) > 0);
  const ratePerHour = storedRate ? Number(storedRate.hourly_rate) : 0;

  const calculations = settlements.map((s) => ({
    employee_id: s.employee_id,
    employee_name: s.employee_name_snapshot || s.employee_id,
    hours_worked: Number(s.hours_worked || 0),
    amount_earned: Number(s.amount_earned || 0),
    status: s.status,
  }));

  return json({
    success: true,
    data: {
      configured: true,
      total_seur_amount: round2(totalAmount),
      total_validated_hours: round2(totalHours),
      rate_per_hour: round2(ratePerHour),
      total_paid: round2(totalPaid),
      org_keeps: round2(totalAmount - totalPaid),
      review_required_count: reviewCount,
      calculations,
    },
  });
}

function pushAnomaly(map: Map<string, string[]>, employeeId: string, message: string): void {
  const list = map.get(employeeId) || [];
  if (!list.includes(message)) {
    list.push(message);
  }
  map.set(employeeId, list);
}

function isMonthClosed(year: number, month: number): boolean {
  const now = new Date();
  const madridParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const nowYear = Number(madridParts.find((p) => p.type === "year")!.value);
  const nowMonth = Number(madridParts.find((p) => p.type === "month")!.value);
  return year < nowYear || (year === nowYear && month < nowMonth);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}
