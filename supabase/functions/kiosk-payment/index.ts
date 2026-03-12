import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

interface RequestBody {
  action?: string;
  orgSlug?: string;
  adminPin?: string;
  pin?: string;
  year?: number;
  month?: number;
  totalAmount?: number;
  notes?: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ success: false, message: "Method not allowed" }, 405);

  try {
    const body = (await req.json()) as RequestBody;
    const action = String(body.action || "").trim();
    const orgSlug = String(body.orgSlug || "").trim();

    if (!orgSlug) return json({ success: false, message: "Falta la organizacion" }, 400);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!supabaseUrl || !serviceRoleKey) return json({ success: false, message: "Config error" }, 500);

    const orgId = await resolveOrgId(supabaseUrl, serviceRoleKey, orgSlug);
    if (!orgId) return json({ success: false, message: "Organizacion no encontrada" }, 404);

    // Employee action — no admin required
    if (action === "my-summary") {
      return handleMySummary(supabaseUrl, serviceRoleKey, orgId, body);
    }

    // Admin actions
    const adminPin = String(body.adminPin || "").trim();
    const isAdmin = await verifyAdminPin(supabaseUrl, serviceRoleKey, orgId, adminPin);
    if (!isAdmin) return json({ success: false, message: "PIN admin invalido" }, 401);

    if (action === "set-amount") return handleSetAmount(supabaseUrl, serviceRoleKey, orgId, body);
    if (action === "calculate") return handleCalculate(supabaseUrl, serviceRoleKey, orgId, body);

    return json({ success: false, message: "Accion no valida" }, 400);
  } catch (error) {
    console.error("kiosk-payment error", error);
    return json({ success: false, message: "Error interno", details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// ---- SET AMOUNT (admin) ----

async function handleSetAmount(
  url: string,
  key: string,
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
  if (isNaN(totalAmount) || totalAmount < 0) {
    return json({ success: false, message: "Importe invalido" }, 400);
  }

  // UPSERT via POST with on-conflict
  const res = await fetch(`${url}/rest/v1/kiosk_payment_months`, {
    method: "POST",
    headers: {
      ...authHeaders(key),
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=representation",
    },
    body: JSON.stringify({ organization_id: orgId, year, month, total_amount: totalAmount, notes }),
  });

  if (!res.ok) {
    const details = await res.text();
    console.error("set-amount failed", details);
    return json({ success: false, message: "Error al guardar el importe" }, 500);
  }

  const rows = await res.json();
  return json({ success: true, data: Array.isArray(rows) ? rows[0] : rows });
}

// ---- CALCULATE (admin) ----

async function handleCalculate(
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

  // Get saved amount for this month
  const pmRes = await fetch(
    `${url}/rest/v1/kiosk_payment_months?organization_id=eq.${orgId}&year=eq.${year}&month=eq.${month}&limit=1`,
    { headers: authHeaders(key) },
  );
  if (!pmRes.ok) return json({ success: false, message: "Error al obtener el importe" }, 500);
  const pms = (await pmRes.json()) as Array<{ total_amount: string }>;
  if (pms.length === 0) return json({ success: false, message: "No hay importe configurado para este mes" }, 404);
  const totalAmount = Number(pms[0].total_amount);

  // Get all slots for surrounding years (to handle week/month boundary)
  const slotsRes = await fetch(
    `${url}/rest/v1/kiosk_schedule_slots?select=year,week,day_of_week,start_time,end_time,employee_id,kiosk_employees(id,nombre,apellido)&organization_id=eq.${orgId}&year=in.(${year - 1},${year},${year + 1})`,
    { headers: authHeaders(key) },
  );
  if (!slotsRes.ok) return json({ success: false, message: "Error al obtener turnos" }, 500);

  const allSlots = (await slotsRes.json()) as Array<{
    year: number;
    week: number;
    day_of_week: number;
    start_time: string;
    end_time: string;
    employee_id: string | null;
    kiosk_employees: { id: string; nombre: string; apellido: string } | null;
  }>;

  // Filter slots to those falling in the target month
  const monthSlots = allSlots.filter((s) =>
    slotFallsInMonth(s.year, s.week, s.day_of_week, year, month)
  );

  // Total hours across ALL slots (assigned + free)
  let totalHours = 0;
  for (const s of monthSlots) {
    totalHours += slotHours(s.start_time, s.end_time);
  }

  const ratePerHour = totalHours > 0 ? totalAmount / totalHours : 0;

  // Group assigned slots by employee
  const byEmployee = new Map<string, { name: string; hours: number }>();
  for (const s of monthSlots) {
    if (!s.employee_id) continue;
    const emp = s.kiosk_employees;
    const name = emp ? `${emp.nombre} ${emp.apellido}` : s.employee_id;
    const hours = slotHours(s.start_time, s.end_time);
    const existing = byEmployee.get(s.employee_id);
    if (existing) {
      existing.hours += hours;
    } else {
      byEmployee.set(s.employee_id, { name, hours });
    }
  }

  const calculations = Array.from(byEmployee.entries()).map(([id, e]) => ({
    employee_id: id,
    employee_name: e.name,
    hours_worked: round2(e.hours),
    amount_earned: round2(e.hours * ratePerHour),
  }));

  const assignedHours = calculations.reduce((s, c) => s + c.hours_worked, 0);
  const totalPaid = calculations.reduce((s, c) => s + c.amount_earned, 0);
  const freeHours = round2(totalHours - assignedHours);

  return json({
    success: true,
    data: {
      total_seur_amount: totalAmount,
      total_slot_hours: round2(totalHours),
      assigned_hours: round2(assignedHours),
      free_hours: freeHours,
      rate_per_hour: round2(ratePerHour),
      total_paid: round2(totalPaid),
      org_keeps: round2(totalAmount - totalPaid),
      calculations,
    },
  });
}

// ---- MY SUMMARY (employee) ----

async function handleMySummary(
  url: string,
  key: string,
  orgId: string,
  body: RequestBody,
): Promise<Response> {
  const pin = String(body.pin || "").trim();
  const year = Number(body.year);
  const month = Number(body.month);

  if (!/^[0-9]{4}$/.test(pin)) return json({ success: false, message: "PIN invalido" }, 400);
  if (!year || !month) return json({ success: false, message: "Falta ano o mes" }, 400);

  // Verify employee
  const empRes = await fetch(
    `${url}/rest/v1/kiosk_employees?select=id,nombre,apellido&organization_id=eq.${orgId}&pin=eq.${encodeURIComponent(pin)}&attendance_enabled=eq.true&limit=1`,
    { headers: authHeaders(key) },
  );
  if (!empRes.ok) return json({ success: false, message: "Error al verificar" }, 500);
  const emps = (await empRes.json()) as Array<{ id: string; nombre: string; apellido: string }>;
  if (emps.length === 0) return json({ success: false, message: "PIN incorrecto" }, 401);
  const emp = emps[0];

  // Get payment amount
  const pmRes = await fetch(
    `${url}/rest/v1/kiosk_payment_months?organization_id=eq.${orgId}&year=eq.${year}&month=eq.${month}&limit=1`,
    { headers: authHeaders(key) },
  );
  const pms = pmRes.ok ? (await pmRes.json()) as Array<{ total_amount: string }> : [];
  const totalAmount = pms.length > 0 ? Number(pms[0].total_amount) : 0;

  // Get all slots for the month
  const slotsRes = await fetch(
    `${url}/rest/v1/kiosk_schedule_slots?select=year,week,day_of_week,start_time,end_time,employee_id&organization_id=eq.${orgId}&year=in.(${year - 1},${year},${year + 1})`,
    { headers: authHeaders(key) },
  );
  const allSlots = slotsRes.ok
    ? (await slotsRes.json()) as Array<{ year: number; week: number; day_of_week: number; start_time: string; end_time: string; employee_id: string | null }>
    : [];

  const monthSlots = allSlots.filter((s) => slotFallsInMonth(s.year, s.week, s.day_of_week, year, month));

  const totalHours = monthSlots.reduce((s, slot) => s + slotHours(slot.start_time, slot.end_time), 0);
  const myHours = monthSlots
    .filter((s) => s.employee_id === emp.id)
    .reduce((s, slot) => s + slotHours(slot.start_time, slot.end_time), 0);

  const ratePerHour = totalHours > 0 ? totalAmount / totalHours : 0;
  const amountEarned = round2(myHours * ratePerHour);

  return json({
    success: true,
    data: {
      employee_name: emp.nombre + " " + emp.apellido,
      hours_worked: round2(myHours),
      hourly_rate: round2(ratePerHour),
      amount_earned: amountEarned,
      status: totalAmount > 0 ? "calculated" : "pending",
    },
  });
}

// ---- Helpers ----

async function resolveOrgId(url: string, key: string, slug: string): Promise<string | null> {
  const res = await fetch(
    `${url}/rest/v1/organizations?select=id&slug=eq.${encodeURIComponent(slug)}&limit=1`,
    { headers: authHeaders(key) },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ id: string }>;
  return rows.length > 0 ? rows[0].id : null;
}

async function verifyAdminPin(url: string, key: string, orgId: string, pin: string): Promise<boolean> {
  if (!pin) return false;
  const res = await fetch(`${url}/rest/v1/rpc/verify_organization_super_admin_pin`, {
    method: "POST",
    headers: { ...authHeaders(key), "Content-Type": "application/json" },
    body: JSON.stringify({ p_organization_id: orgId, p_pin: pin }),
  });
  if (!res.ok) return false;
  return (await res.json()) === true;
}

/** Returns duration in hours between two TIME strings like "15:00:00" and "16:00:00" */
function slotHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  return ((eh * 60 + em) - (sh * 60 + sm)) / 60;
}

/** Returns true if the slot (defined by ISO year/week/dayOfWeek) falls in the given calendar month */
function slotFallsInMonth(slotYear: number, week: number, dayOfWeek: number, targetYear: number, targetMonth: number): boolean {
  const date = isoWeekToDate(slotYear, week, dayOfWeek);
  return date.getUTCFullYear() === targetYear && (date.getUTCMonth() + 1) === targetMonth;
}

/** Converts ISO year+week+dayOfWeek (1=Mon,7=Sun) to a UTC Date */
function isoWeekToDate(year: number, week: number, dayOfWeek: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Dow - 1));
  const result = new Date(week1Monday);
  result.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7 + (dayOfWeek - 1));
  return result;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function authHeaders(key: string): Record<string, string> {
  return { Authorization: `Bearer ${key}`, apikey: key };
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: corsHeaders });
}
