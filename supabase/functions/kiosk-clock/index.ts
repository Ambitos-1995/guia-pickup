import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  authHeaders,
  autoCloseStaleCheckIns,
  corsHeaders,
  currentAttendanceStatus,
  fetchJson,
  json,
  logAudit,
  requireSession,
  resolveOrgId,
  getSupabaseConfig,
} from "../_shared/kiosk.ts";

interface ClockBody {
  orgSlug?: string;
  action?: string;
  clientDate?: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ success: false, message: "Metodo no permitido" }, 405);
  }

  try {
    const body = await req.json() as ClockBody;
    const orgSlug = String(body.orgSlug || "").trim();
    const action = String(body.action || "").trim();
    const clientDate = String(body.clientDate || new Date().toISOString().slice(0, 10));

    if (!orgSlug) {
      return json({ success: false, message: "Falta la organizacion" }, 400);
    }

    if (!["check-in", "check-out", "status"].includes(action)) {
      return json({ success: false, message: "Accion no valida" }, 400);
    }

    const { url, serviceRoleKey } = getSupabaseConfig();
    const orgId = await resolveOrgId(url, serviceRoleKey, orgSlug);
    if (!orgId) {
      return json({ success: false, message: "Organizacion no encontrada" }, 404);
    }

    const auth = await requireSession(req, url, serviceRoleKey, ["respondent"]);
    if (auth instanceof Response) {
      return auth;
    }

    if (auth.session.organization_id !== orgId || !auth.session.employee_id) {
      return json({ success: false, message: "Sesion fuera de la organizacion activa" }, 403);
    }

    const employeeRes = await fetchJson<Array<{
      id: string;
      nombre: string;
      apellido: string;
      attendance_enabled: boolean;
    }>>(
      `${url}/rest/v1/kiosk_employees?select=id,nombre,apellido,attendance_enabled&id=eq.${auth.session.employee_id}&organization_id=eq.${orgId}&limit=1`,
      { headers: authHeaders(serviceRoleKey) },
    );

    const employee = employeeRes.ok ? employeeRes.data[0] : null;
    if (!employee) {
      return json({ success: false, message: "Empleado no encontrado" }, 404);
    }

    if (!employee.attendance_enabled) {
      return json({ success: false, message: "Empleado desactivado" }, 403);
    }

    // Auto-close stale check-ins (non-fatal)
    try {
      await autoCloseStaleCheckIns(url, serviceRoleKey, orgId, clientDate);
    } catch (e) {
      console.warn("Auto-close error (non-fatal):", e);
    }

    const currentStatus = await currentAttendanceStatus(url, serviceRoleKey, employee.id, clientDate);
    const employeeName = `${employee.nombre} ${employee.apellido}`.trim();

    if (action === "status") {
      return json({
        success: true,
        data: { employeeName, currentStatus },
      });
    }

    // -- Shared slot lookup for check-in and check-out --
    const { year, week, dayOfWeek } = isoWeekInfo(new Date(`${clientDate}T00:00:00`));
    const slotRes = await fetchJson<Array<{
      id: string;
      start_time: string;
      end_time: string;
    }>>(
      `${url}/rest/v1/kiosk_schedule_slots?select=id,start_time,end_time&organization_id=eq.${orgId}&employee_id=eq.${employee.id}&year=eq.${year}&week=eq.${week}&day_of_week=eq.${dayOfWeek}&limit=1`,
      { headers: authHeaders(serviceRoleKey) },
    );

    const slot = slotRes.ok ? slotRes.data[0] : null;

    // ======================== CHECK-IN ========================
    if (action === "check-in") {
      if (currentStatus === "checked_in") {
        return json({ success: false, message: "Ya tienes entrada registrada hoy" }, 409);
      }
      if (currentStatus === "checked_out") {
        return json({ success: false, message: "Ya has fichado entrada y salida hoy" }, 409);
      }

      if (!slot) {
        return json({ success: false, message: "No tienes turno asignado hoy" }, 403);
      }

      // Time-window validation (server time, not client)
      const EARLY_TOLERANCE_MIN = 15;
      const now = new Date();
      const [sh, sm] = slot.start_time.split(":").map(Number);
      const [eh, em] = slot.end_time.split(":").map(Number);
      const slotStart = new Date(`${clientDate}T${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}:00`);
      const slotEnd = new Date(`${clientDate}T${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}:00`);
      const windowStart = new Date(slotStart.getTime() - EARLY_TOLERANCE_MIN * 60000);

      if (now < windowStart || now > slotEnd) {
        return json({
          success: false,
          message: "Fuera de tu horario",
          data: {
            reason: "outside_schedule",
            slotStart: slot.start_time.slice(0, 5),
            slotEnd: slot.end_time.slice(0, 5),
          },
        }, 403);
      }

      const insert = await fetchJson<Array<{ id: string; recorded_at: string }>>(
        `${url}/rest/v1/kiosk_attendance`,
        {
          method: "POST",
          headers: {
            ...authHeaders(serviceRoleKey),
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            organization_id: orgId,
            employee_id: employee.id,
            slot_id: slot.id,
            action: "check_in",
            client_date: clientDate,
          }),
        },
      );

      if (!insert.ok || !insert.data[0]) {
        return json({ success: false, message: "Error al registrar fichaje" }, 500);
      }

      await logAudit(url, serviceRoleKey, {
        organizationId: orgId,
        actorSessionId: auth.session.id,
        actorRole: "respondent",
        employeeId: employee.id,
        slotId: slot.id,
        action: "attendance_check_in",
      });

      return json({
        success: true,
        message: `Entrada registrada. El turno conciliara hasta las ${slot.end_time.slice(0, 5)}.`,
        data: {
          employeeName,
          currentStatus: "checked_in",
          shiftEndTime: slot.end_time.slice(0, 5),
        },
      });
    }

    // ======================== CHECK-OUT ========================
    if (action === "check-out") {
      if (currentStatus !== "checked_in") {
        return json({ success: false, message: "No tienes entrada registrada hoy" }, 409);
      }

      const insertOut = await fetchJson<Array<{ id: string; recorded_at: string }>>(
        `${url}/rest/v1/kiosk_attendance`,
        {
          method: "POST",
          headers: {
            ...authHeaders(serviceRoleKey),
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            organization_id: orgId,
            employee_id: employee.id,
            slot_id: slot ? slot.id : null,
            action: "check_out",
            client_date: clientDate,
          }),
        },
      );

      if (!insertOut.ok || !insertOut.data[0]) {
        return json({ success: false, message: "Error al registrar salida" }, 500);
      }

      await logAudit(url, serviceRoleKey, {
        organizationId: orgId,
        actorSessionId: auth.session.id,
        actorRole: "respondent",
        employeeId: employee.id,
        slotId: slot ? slot.id : null,
        action: "attendance_check_out",
      });

      return json({
        success: true,
        message: "Salida registrada",
        data: { employeeName, currentStatus: "checked_out" },
      });
    }

    return json({ success: false, message: "Accion no valida" }, 400);
  } catch (error) {
    console.error("kiosk-clock error", error);
    return json({ success: false, message: "Error interno" }, 500);
  }
});

function isoWeekInfo(date: Date): { year: number; week: number; dayOfWeek: number } {
  const day = date.getDay();
  const dayOfWeek = day === 0 ? 7 : day;
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
  const yearStart = new Date(d.getFullYear(), 0, 4);
  const week = 1 + Math.round(
    ((d.getTime() - yearStart.getTime()) / 86400000 - 3 + (yearStart.getDay() + 6) % 7) / 7,
  );
  return { year: d.getFullYear(), week, dayOfWeek };
}
