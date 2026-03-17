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

interface ScheduleSlotRow {
  id: string;
  year: number;
  week: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
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
    const slotRes = await fetchJson<Array<ScheduleSlotRow>>(
      `${url}/rest/v1/kiosk_schedule_slots?select=id,year,week,day_of_week,start_time,end_time&organization_id=eq.${orgId}&employee_id=eq.${employee.id}&order=year.asc,week.asc,day_of_week.asc,start_time.asc&limit=128`,
      { headers: authHeaders(serviceRoleKey) },
    );

    const employeeSlots = slotRes.ok ? slotRes.data : [];
    const todaySlots = employeeSlots.filter((item) =>
      Number(item.year) === year &&
      Number(item.week) === week &&
      Number(item.day_of_week) === dayOfWeek
    );
    const now = new Date();
    const nextScheduledSlot = findNextAssignedSlot(employeeSlots, now);
    const slot = findActiveCheckInSlot(todaySlots, clientDate, now) || todaySlots[0] || null;

    // ======================== CHECK-IN ========================
    if (action === "check-in") {
      if (currentStatus === "checked_in") {
        return json({ success: false, message: "Ya tienes entrada registrada hoy" }, 409);
      }
      if (currentStatus === "checked_out") {
        return json({ success: false, message: "Ya has fichado entrada y salida hoy" }, 409);
      }

      if (!slot) {
        return json(
          {
            success: false,
            message: buildNoScheduleMessage(nextScheduledSlot),
            data: buildNextSlotData(nextScheduledSlot, "no_schedule"),
          },
          403,
        );
      }

      // Time-window validation (server time, not client)
      const EARLY_TOLERANCE_MIN = 15;
      const [sh, sm] = slot.start_time.split(":").map(Number);
      const [eh, em] = slot.end_time.split(":").map(Number);
      const slotStart = new Date(`${clientDate}T${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}:00`);
      const slotEnd = new Date(`${clientDate}T${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}:00`);
      const windowStart = new Date(slotStart.getTime() - EARLY_TOLERANCE_MIN * 60000);

      if (now < windowStart || now > slotEnd) {
        const fallbackNextSlot = now < windowStart
          ? toScheduledSlotRef(slot)
          : findNextAssignedSlot(employeeSlots, now);
        return json({
          success: false,
          message: buildOutsideScheduleMessage(fallbackNextSlot, slot, now < windowStart),
          data: buildNextSlotData(fallbackNextSlot, "outside_schedule", slot),
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

function findActiveCheckInSlot(slots: ScheduleSlotRow[], clientDate: string, now: Date): ScheduleSlotRow | null {
  const EARLY_TOLERANCE_MIN = 15;

  for (const slot of slots) {
    const [sh, sm] = slot.start_time.split(":").map(Number);
    const [eh, em] = slot.end_time.split(":").map(Number);
    const slotStart = new Date(`${clientDate}T${String(sh).padStart(2, "0")}:${String(sm).padStart(2, "0")}:00`);
    const slotEnd = new Date(`${clientDate}T${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}:00`);
    const windowStart = new Date(slotStart.getTime() - EARLY_TOLERANCE_MIN * 60000);

    if (now >= windowStart && now <= slotEnd) {
      return slot;
    }
  }

  return null;
}

function findNextAssignedSlot(
  slots: ScheduleSlotRow[],
  reference: Date,
): { slot: ScheduleSlotRow; date: Date } | null {
  for (const slot of slots) {
    const slotDate = isoWeekDate(Number(slot.year), Number(slot.week), Number(slot.day_of_week));
    const [sh, sm] = slot.start_time.split(":").map(Number);
    const slotStart = new Date(slotDate);
    slotStart.setHours(sh, sm, 0, 0);

    if (slotStart.getTime() >= reference.getTime()) {
      return { slot, date: slotDate };
    }
  }

  return null;
}

function toScheduledSlotRef(slot: ScheduleSlotRow): { slot: ScheduleSlotRow; date: Date } {
  return {
    slot,
    date: isoWeekDate(Number(slot.year), Number(slot.week), Number(slot.day_of_week)),
  };
}

function buildNoScheduleMessage(nextSlot: { slot: ScheduleSlotRow; date: Date } | null): string {
  if (!nextSlot) {
    return "No tienes turnos asignados proximamente.";
  }

  return `Ahora no tienes turno. Tu proximo horario es ${formatSlotLabel(nextSlot)}.`;
}

function buildOutsideScheduleMessage(
  nextSlot: { slot: ScheduleSlotRow; date: Date } | null,
  currentSlot: ScheduleSlotRow,
  isEarly: boolean,
): string {
  if (nextSlot) {
    return isEarly
      ? `Aun no es tu hora. Tu proximo horario es ${formatSlotLabel(nextSlot)}.`
      : `Ahora no tienes turno. Tu proximo horario es ${formatSlotLabel(nextSlot)}.`;
  }

  return `No es tu hora. Tu turno asignado era de ${currentSlot.start_time.slice(0, 5)} a ${currentSlot.end_time.slice(0, 5)}.`;
}

function buildNextSlotData(
  nextSlot: { slot: ScheduleSlotRow; date: Date } | null,
  reason: string,
  currentSlot?: ScheduleSlotRow | null,
): Record<string, string> {
  const data: Record<string, string> = { reason };

  if (currentSlot) {
    data.slotStart = currentSlot.start_time.slice(0, 5);
    data.slotEnd = currentSlot.end_time.slice(0, 5);
  }

  if (nextSlot) {
    data.nextSlotStart = nextSlot.slot.start_time.slice(0, 5);
    data.nextSlotEnd = nextSlot.slot.end_time.slice(0, 5);
    data.nextSlotDate = toDateIso(nextSlot.date);
    data.nextSlotLabel = formatSlotLabel(nextSlot);
  }

  return data;
}

function formatSlotLabel(nextSlot: { slot: ScheduleSlotRow; date: Date }): string {
  const dayLabel = new Intl.DateTimeFormat("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(nextSlot.date);

  return `${dayLabel} de ${nextSlot.slot.start_time.slice(0, 5)} a ${nextSlot.slot.end_time.slice(0, 5)}`;
}

function isoWeekDate(year: number, week: number, dayOfWeek: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + ((week - 1) * 7) + (dayOfWeek - 1));

  return new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate());
}

function toDateIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
