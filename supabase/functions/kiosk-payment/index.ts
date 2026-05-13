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
  hourlyRate?: number;
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
      const employeeId = auth.session.employee_id;
      if (auth.session.organization_id !== orgId || !employeeId) {
        return json({ success: false, message: "Sesion fuera de la organizacion activa" }, 403);
      }
      return await handleMySummary(url, serviceRoleKey, {
        organization_id: auth.session.organization_id,
        employee_id: employeeId,
      }, body);
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

  // hourly_rate es opcional: si no se envía o es 0/invalid → NULL (compat legacy).
  // Si se envía, debe ser número finito > 0.
  const rawHourlyRate = body.hourlyRate;
  let hourlyRate: number | null = null;
  if (rawHourlyRate !== undefined && rawHourlyRate !== null && rawHourlyRate !== "" as unknown as number) {
    const parsed = Number(rawHourlyRate);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return json({ success: false, message: "Tarifa por hora invalida" }, 400);
    }
    hourlyRate = round4(parsed);
  }

  if (!year || !month || month < 1 || month > 12) {
    return json({ success: false, message: "Ano o mes invalido" }, 400);
  }

  if (!isMonthClosed(year, month)) {
    return json({ success: false, message: "Solo se puede configurar meses ya cerrados. Disponible a partir del dia 1 del proximo mes." }, 400);
  }

  if (Number.isNaN(totalAmount) || totalAmount < 0) {
    return json({ success: false, message: "Importe invalido" }, 400);
  }

  const save = await fetchJson<Array<{ id: string; total_amount: string; hourly_rate: string | null; notes: string }>>(
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
        hourly_rate: hourlyRate,
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
    metadata: { year, month, totalAmount, hourlyRate },
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

  const amountRes = await fetchJson<Array<{ total_amount: string; hourly_rate: string | null }>>(
    `${url}/rest/v1/kiosk_payment_months?select=total_amount,hourly_rate&organization_id=eq.${orgId}&year=eq.${year}&month=eq.${month}&limit=1`,
    { headers: authHeaders(key) },
  );

  const paymentMonth = amountRes.ok ? amountRes.data[0] : null;
  if (!paymentMonth) {
    return json({ success: false, message: "No hay importe configurado para este mes" }, 404);
  }

  const totalAmount = Number(paymentMonth.total_amount);
  // Modo "tarifa fija": el admin definió hourly_rate al guardar el mes.
  // - Cada empleado cobra hours_worked * fixedHourlyRate.
  // - Si la suma supera totalAmount, se aplica un cap proporcional.
  // - Si no, el sobrante queda implícitamente para la fundación.
  // Modo legacy: hourly_rate IS NULL → tarifa dinámica (total / horas asignadas).
  const fixedHourlyRate = paymentMonth.hourly_rate !== null && paymentMonth.hourly_rate !== undefined
    ? Number(paymentMonth.hourly_rate)
    : null;
  const isFixedRate = fixedHourlyRate !== null && Number.isFinite(fixedHourlyRate) && fixedHourlyRate > 0;

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
    // Leemos ambas acciones (check_in y check_out) para poder usar el check_out real
    // y, en sesiones que abarcan varios slots consecutivos, distribuir por solape.
    fetchJson<Array<{
      employee_id: string;
      slot_id: string | null;
      recorded_at: string;
      client_date: string;
      action: string;
    }>>(
      `${url}/rest/v1/kiosk_attendance?select=employee_id,slot_id,recorded_at,client_date,action&organization_id=eq.${orgId}&client_date=gte.${monthStart}&client_date=lte.${monthEnd}&action=in.(check_in,check_out)`,
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
  const anomalies = new Map<string, string[]>();
  const names = new Map<string, string>();

  for (const slot of monthSlots) {
    if (slot.employee_id && slot.kiosk_employees) {
      names.set(slot.employee_id, `${slot.kiosk_employees.nombre} ${slot.kiosk_employees.apellido}`.trim());
    }
  }

  // Empareja check_in con su check_out para construir "sesiones reales".
  // Clave: ${employee_id}|${client_date}|${slot_id}. Si un slot recibe más de un
  // check_in, queda como anomalía (igual que antes).
  interface Session {
    employee_id: string;
    slot_id: string | null;
    client_date: string;
    in_at: string | null;
    out_at: string | null;
  }
  const sessionsByKey = new Map<string, Session>();
  const checkInCountBySlot = new Map<string, number>();

  for (const row of attendanceRes.data) {
    const slotKey = row.slot_id || "_no_slot_";
    const key = `${row.employee_id}|${row.client_date}|${slotKey}`;
    const existing = sessionsByKey.get(key) || {
      employee_id: row.employee_id,
      slot_id: row.slot_id,
      client_date: row.client_date,
      in_at: null,
      out_at: null,
    };
    if (row.action === "check_in") {
      // Si ya había un check_in para este slot/día, marca anomalía.
      if (existing.in_at !== null && row.slot_id) {
        const count = (checkInCountBySlot.get(row.slot_id) || 1) + 1;
        checkInCountBySlot.set(row.slot_id, count);
      } else if (row.slot_id) {
        checkInCountBySlot.set(row.slot_id, 1);
      }
      // Mantenemos el primer check_in (más temprano) para el cálculo de solape.
      if (existing.in_at === null || row.recorded_at < existing.in_at) {
        existing.in_at = row.recorded_at;
      }
    } else if (row.action === "check_out") {
      // Nos quedamos con el check_out más tardío (cubre el rango más amplio).
      if (existing.out_at === null || row.recorded_at > existing.out_at) {
        existing.out_at = row.recorded_at;
      }
    }
    sessionsByKey.set(key, existing);
  }

  const sessions: Session[] = Array.from(sessionsByKey.values());

  // Validación inicial de sesiones: anomalías por slot inválido / persona equivocada.
  const validSessions: Session[] = [];
  for (const session of sessions) {
    if (session.in_at === null) continue; // ignora check_out huérfano
    if (!session.slot_id) {
      pushAnomaly(anomalies, session.employee_id, "Fichaje sin franja asociada");
      continue;
    }
    const slot = slotMap.get(session.slot_id);
    if (!slot) {
      pushAnomaly(anomalies, session.employee_id, "Fichaje fuera del calendario conciliable");
      continue;
    }
    if (!slot.employee_id || slot.employee_id !== session.employee_id) {
      pushAnomaly(anomalies, session.employee_id, "Fichaje con franja asignada a otra persona");
      continue;
    }
    if ((checkInCountBySlot.get(session.slot_id) || 0) > 1) {
      pushAnomaly(anomalies, session.employee_id, "Mas de un fichaje para la misma franja");
      continue;
    }
    validSessions.push(session);
  }

  // Para cada slot del mes, calcular minutos trabajados sumando el solape con
  // todas las sesiones del mismo empleado en el mismo día. Esto distribuye una
  // sesión multi-slot (ej. check_in 16:58 + check_out 18:12 cubriendo slots
  // 17-18 y 18-19) entre los slots correspondientes.
  const slotMinutes = new Map<string, number>();
  for (const slot of monthSlots) {
    if (!slot.employee_id) continue;
    const slotDate = isoWeekToDate(slot.year, slot.week, slot.day_of_week);
    let total = 0;
    for (const session of validSessions) {
      if (session.employee_id !== slot.employee_id) continue;
      if (session.client_date !== formatSlotClientDate(slotDate)) continue;
      const minutes = computeWorkedMinutes(
        slotDate,
        slot.start_time,
        slot.end_time,
        session.in_at!,
        session.out_at,
      );
      if (minutes > 0) total += minutes;
    }
    if (total > 0) slotMinutes.set(slot.id, total);
  }

  // Detectar sesiones que NO solapan con ningún slot del empleado en ese día
  // (ej. fichaje fuera de ventana). Marca anomalía.
  for (const session of validSessions) {
    if (!session.slot_id) continue;
    const slot = slotMap.get(session.slot_id);
    if (!slot || !slot.employee_id) continue;
    const slotDate = isoWeekToDate(slot.year, slot.week, slot.day_of_week);
    const minutes = computeWorkedMinutes(
      slotDate,
      slot.start_time,
      slot.end_time,
      session.in_at!,
      session.out_at,
    );
    if (minutes <= 0) {
      pushAnomaly(anomalies, session.employee_id, "Fichaje fuera de la ventana valida del turno");
    }
  }

  // Agregado por empleado.
  const perEmployee = new Map<string, { workedMinutes: number; slotCount: number }>();
  for (const slot of monthSlots) {
    if (!slot.employee_id) continue;
    const minutes = slotMinutes.get(slot.id) || 0;
    if (minutes <= 0) continue;
    const current = perEmployee.get(slot.employee_id) || { workedMinutes: 0, slotCount: 0 };
    current.workedMinutes += minutes;
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

  // Cálculo de la tarifa y el cap.
  // - Modo legacy: tarifa = total / horas_posibles. Sin cap (siempre cabe).
  // - Modo tarifa fija: tarifa = fixedHourlyRate. Si suma_cobros > totalAmount,
  //   se aplica adjustmentFactor proporcional sobre cada amount.
  const legacyRate = totalPossibleHours > 0 ? totalAmount / totalPossibleHours : 0;
  const baseHourlyRate = isFixedRate ? fixedHourlyRate! : legacyRate;
  const rawTotalOwed = Array.from(perEmployee.values()).reduce(
    (sum, item) => sum + (item.workedMinutes / 60) * baseHourlyRate,
    0,
  );
  const adjustmentFactor = isFixedRate && rawTotalOwed > totalAmount && rawTotalOwed > 0
    ? totalAmount / rawTotalOwed
    : 1;
  const effectiveHourlyRate = baseHourlyRate * adjustmentFactor;
  const capApplied = isFixedRate && adjustmentFactor < 1;

  const affectedEmployeeIds = new Set<string>([
    ...Array.from(perEmployee.keys()),
    ...Array.from(anomalies.keys()),
  ]);

  const settlementRows = Array.from(affectedEmployeeIds).map((employeeId) => {
    const entry = perEmployee.get(employeeId) || { workedMinutes: 0, slotCount: 0 };
    const anomalyNotes = anomalies.get(employeeId) || [];
    const hasAnomalies = anomalyNotes.length > 0;
    const hoursWorked = round2(entry.workedMinutes / 60);
    const rawAmount = hoursWorked > 0 ? hoursWorked * baseHourlyRate : 0;
    const amountEarned = hoursWorked > 0 ? round2(rawAmount * adjustmentFactor) : 0;

    // El status pasa a "review_required" si hay anomalías o si se aplicó cap.
    const status = hasAnomalies || capApplied
      ? "review_required"
      : hoursWorked > 0
      ? "calculated"
      : "pending";

    const notesArr = [...anomalyNotes];
    if (capApplied && hoursWorked > 0) {
      notesArr.push(
        `Ajuste proporcional aplicado (presupuesto excedido). Tarifa efectiva: ${
          round4(effectiveHourlyRate).toFixed(4)
        } EUR/h`,
      );
    }

    return {
      organization_id: orgId,
      employee_id: employeeId,
      year,
      month,
      status,
      hours_worked: hoursWorked,
      // Guardamos la tarifa BASE (la decidida por el admin o la legacy), no la
      // efectiva post-cap. El cap se refleja en amount_earned y en las notas.
      hourly_rate: hoursWorked > 0 ? round4(baseHourlyRate) : 0,
      amount_earned: amountEarned,
      worked_minutes: entry.workedMinutes,
      slot_count: entry.slotCount,
      employee_name_snapshot: names.get(employeeId) || "",
      notes: notesArr.join(" | "),
      meta: {
        anomalies: anomalyNotes,
        cap_applied: capApplied,
        effective_hourly_rate: capApplied ? round4(effectiveHourlyRate) : null,
        fixed_rate_mode: isFixedRate,
      },
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
    metadata: {
      year,
      month,
      reviewCount,
      totalPaid,
      fixedRateMode: isFixedRate,
      capApplied,
    },
  });

  return json({
    success: true,
    data: {
      total_seur_amount: round2(totalAmount),
      total_possible_hours: round2(totalPossibleHours),
      total_validated_hours: round2(validatedHours),
      fixed_rate_mode: isFixedRate,
      hourly_rate: round4(baseHourlyRate),
      rate_per_hour: round2(baseHourlyRate),
      effective_hourly_rate: capApplied ? round4(effectiveHourlyRate) : round4(baseHourlyRate),
      cap_applied: capApplied,
      total_paid: totalPaid,
      org_keeps: round2(Math.max(0, totalAmount - totalPaid)),
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
    hourly_rate: string | null;
    notes: string;
  }>>(
    `${url}/rest/v1/kiosk_payment_months?select=year,month,total_amount,hourly_rate,notes&organization_id=eq.${orgId}&order=year.desc,month.desc`,
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
    fetchJson<Array<{ total_amount: string; hourly_rate: string | null; notes: string }>>(
      `${url}/rest/v1/kiosk_payment_months?select=total_amount,hourly_rate,notes&organization_id=eq.${orgId}&year=eq.${year}&month=eq.${month}&limit=1`,
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
      meta: Record<string, unknown> | null;
    }>>(
      `${url}/rest/v1/kiosk_payment_settlements?select=employee_id,employee_name_snapshot,hours_worked,hourly_rate,amount_earned,status,notes,meta&organization_id=eq.${orgId}&year=eq.${year}&month=eq.${month}`,
      { headers: authHeaders(key) },
    ),
  ]);

  const paymentMonth = amountRes.ok ? amountRes.data[0] : null;
  const settlements = settlementsRes.ok ? settlementsRes.data : [];

  if (!paymentMonth) {
    return json({
      success: true,
      data: {
        configured: false,
        total_seur_amount: 0,
        configured_hourly_rate: null,
        calculations: [],
      },
    });
  }

  const totalAmount = Number(paymentMonth.total_amount);
  const configuredHourlyRate = paymentMonth.hourly_rate !== null && paymentMonth.hourly_rate !== undefined
    ? Number(paymentMonth.hourly_rate)
    : null;
  const totalPaid = settlements.reduce((sum, s) => sum + Number(s.amount_earned || 0), 0);
  const totalHours = settlements.reduce((sum, s) => sum + Number(s.hours_worked || 0), 0);
  const reviewCount = settlements.filter((s) => s.status === "review_required").length;
  // ratePerHour: tarifa base guardada en los settlements (BASE, no la efectiva).
  const storedRate = settlements.find((s) => Number(s.hourly_rate || 0) > 0);
  const ratePerHour = storedRate ? Number(storedRate.hourly_rate) : (configuredHourlyRate ?? 0);
  // effectiveHourlyRate: si algún settlement tiene cap_applied=true en meta, usa esa.
  const capSettlement = settlements.find((s) => {
    const meta = s.meta as { cap_applied?: boolean; effective_hourly_rate?: number } | null;
    return meta && meta.cap_applied === true && typeof meta.effective_hourly_rate === "number";
  });
  const effectiveHourlyRate = capSettlement
    ? Number(((capSettlement.meta as { effective_hourly_rate: number }).effective_hourly_rate))
    : ratePerHour;
  const capApplied = capSettlement !== undefined;

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
      configured_hourly_rate: configuredHourlyRate !== null ? round4(configuredHourlyRate) : null,
      total_validated_hours: round2(totalHours),
      rate_per_hour: round2(ratePerHour),
      effective_hourly_rate: round4(effectiveHourlyRate),
      cap_applied: capApplied,
      total_paid: round2(totalPaid),
      org_keeps: round2(Math.max(0, totalAmount - totalPaid)),
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

/**
 * Convierte un Date construido por isoWeekToDate (UTC components = fecha civil
 * Madrid, hora 00:00 UTC) al formato YYYY-MM-DD que usa client_date de
 * kiosk_attendance.
 */
function formatSlotClientDate(slotDate: Date): string {
  const y = slotDate.getUTCFullYear();
  const m = String(slotDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(slotDate.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
