import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

interface ClockBody {
  orgSlug?: string;
  pin?: string;
  action?: string;   // "check-in" | "status"
  clientDate?: string;
  tzOffset?: number; // minutes east of UTC (e.g. 60 for CET, 120 for CEST)
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ success: false, message: "Method not allowed" }, 405);
  }

  try {
    const body = (await req.json()) as ClockBody;
    const orgSlug = String(body.orgSlug || "").trim();
    const pin = String(body.pin || "").trim();
    const action = String(body.action || "").trim();
    const clientDate = String(body.clientDate || new Date().toISOString().slice(0, 10));
    const tzOffset = Number(body.tzOffset || 0); // minutes east of UTC

    if (!orgSlug) {
      return json({ success: false, message: "Falta la organizacion" }, 400);
    }
    if (!/^[0-9]{4}$/.test(pin)) {
      return json({ success: false, message: "PIN debe ser 4 cifras" }, 400);
    }
    if (!["check-in", "status"].includes(action)) {
      return json({ success: false, message: "Accion no valida" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ success: false, message: "Config error" }, 500);
    }

    // Resolve org
    const orgRes = await fetch(
      `${supabaseUrl}/rest/v1/organizations?select=id&slug=eq.${encodeURIComponent(orgSlug)}&limit=1`,
      { headers: authHeaders(serviceRoleKey) },
    );
    if (!orgRes.ok) return json({ success: false, message: "Error de organizacion" }, 500);
    const orgs = (await orgRes.json()) as Array<{ id: string }>;
    if (orgs.length === 0) return json({ success: false, message: "Organizacion no encontrada" }, 404);
    const orgId = orgs[0].id;

    // Verify employee
    const empRes = await fetch(
      `${supabaseUrl}/rest/v1/kiosk_employees?select=id,nombre,apellido,attendance_enabled&organization_id=eq.${orgId}&pin=eq.${encodeURIComponent(pin)}&limit=1`,
      { headers: authHeaders(serviceRoleKey) },
    );
    if (!empRes.ok) return json({ success: false, message: "Error al verificar empleado" }, 500);
    const emps = (await empRes.json()) as Array<{
      id: string;
      nombre: string;
      apellido: string;
      attendance_enabled: boolean;
    }>;
    if (emps.length === 0) return json({ success: false, message: "PIN incorrecto" }, 401);
    const emp = emps[0];
    if (!emp.attendance_enabled) return json({ success: false, message: "Empleado desactivado" }, 403);

    // Get current status for today (only past/present records)
    const nowIso = new Date().toISOString();
    const lastRes = await fetch(
      `${supabaseUrl}/rest/v1/kiosk_attendance?select=action,recorded_at&employee_id=eq.${emp.id}&client_date=eq.${clientDate}&recorded_at=lte.${encodeURIComponent(nowIso)}&order=recorded_at.desc&limit=1`,
      { headers: authHeaders(serviceRoleKey) },
    );

    let currentStatus = "not_checked_in";
    if (lastRes.ok) {
      const lastRows = (await lastRes.json()) as Array<{ action: string }>;
      if (lastRows.length > 0) {
        currentStatus = lastRows[0].action === "check_in" ? "checked_in" : "checked_out";
      }
    }

    // Status only
    if (action === "status") {
      return json({
        success: true,
        data: {
          employeeName: emp.nombre + " " + emp.apellido,
          currentStatus,
        },
      });
    }

    // Check-in only from here
    if (currentStatus === "checked_in") {
      return json({ success: false, message: "Ya tienes entrada registrada hoy" }, 409);
    }

    // Validate assigned shift and get end_time
    const { year, week, dayOfWeek } = isoWeekInfo(new Date(clientDate + "T00:00:00"));
    const shiftRes = await fetch(
      `${supabaseUrl}/rest/v1/kiosk_schedule_slots?select=id,end_time&organization_id=eq.${orgId}&employee_id=eq.${emp.id}&year=eq.${year}&week=eq.${week}&day_of_week=eq.${dayOfWeek}&limit=1`,
      { headers: authHeaders(serviceRoleKey) },
    );
    if (!shiftRes.ok) {
      return json({ success: false, message: "No tienes turno asignado hoy" }, 403);
    }
    const shifts = (await shiftRes.json()) as Array<{ id: string; end_time: string }>;
    if (shifts.length === 0) {
      return json({ success: false, message: "No tienes turno asignado hoy" }, 403);
    }

    const shiftEndTime = shifts[0].end_time; // e.g. "16:00:00"

    // Record check-in
    const insertRes = await fetch(
      `${supabaseUrl}/rest/v1/kiosk_attendance`,
      {
        method: "POST",
        headers: {
          ...authHeaders(serviceRoleKey),
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          organization_id: orgId,
          employee_id: emp.id,
          action: "check_in",
          client_date: clientDate,
        }),
      },
    );

    if (!insertRes.ok) {
      const details = await insertRes.text();
      console.error("clock insert failed", details);
      return json({ success: false, message: "Error al registrar fichaje" }, 500);
    }

    // Auto-record check-out at shift end time (adjusted for client timezone)
    // clientDate + end_time is parsed as UTC in Deno; subtract tzOffset to convert to real UTC
    const checkoutDate = new Date(clientDate + "T" + shiftEndTime);
    checkoutDate.setMinutes(checkoutDate.getMinutes() - tzOffset);
    await fetch(`${supabaseUrl}/rest/v1/kiosk_attendance`, {
      method: "POST",
      headers: { ...authHeaders(serviceRoleKey), "Content-Type": "application/json" },
      body: JSON.stringify({
        organization_id: orgId,
        employee_id: emp.id,
        action: "check_out",
        client_date: clientDate,
        recorded_at: checkoutDate.toISOString(),
      }),
    });

    const displayEnd = shiftEndTime.slice(0, 5);
    const message = "Entrada registrada a las " +
      new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

    return json({
      success: true,
      message,
      data: {
        employeeName: emp.nombre + " " + emp.apellido,
        currentStatus: "checked_in",
        shiftEndTime: displayEnd,
      },
    });
  } catch (error) {
    console.error("kiosk-clock error", error);
    return json({ success: false, message: "Error interno" }, 500);
  }
});

function isoWeekInfo(date: Date): { year: number; week: number; dayOfWeek: number } {
  const day = date.getDay(); // 0=Sun
  const dayOfWeek = day === 0 ? 7 : day; // 1=Mon … 7=Sun
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7); // nearest Thursday
  const yearStart = new Date(d.getFullYear(), 0, 4);
  const week = 1 + Math.round(
    ((d.getTime() - yearStart.getTime()) / 86400000 - 3 + (yearStart.getDay() + 6) % 7) / 7,
  );
  return { year: d.getFullYear(), week, dayOfWeek };
}

function authHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
  };
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders,
  });
}
