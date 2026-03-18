import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  authHeaders,
  autoCloseStaleCheckIns,
  corsHeaders,
  fetchJson,
  getAttendanceDayState,
  isoWeekInfoFromClientDate,
  json,
  logAudit,
  logAttendanceAttemptDebug,
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

    const now = new Date();
    const dayState = await getAttendanceDayState(url, serviceRoleKey, orgId, employee.id, clientDate, now);
    const currentStatus = dayState.status;
    const employeeName = `${employee.nombre} ${employee.apellido}`.trim();

    if (action === "status") {
      await logAttendanceAttemptDebug(url, serviceRoleKey, {
        organizationId: orgId,
        actorSessionId: auth.session.id,
        employeeId: employee.id,
        action: "status",
        outcome: currentStatus,
        clientDate,
        slotId: dayState.openSlotId,
        scheduledStart: dayState.openSlot?.start_time || null,
        scheduledEnd: dayState.openSlot?.end_time || null,
        message: "Estado de fichaje consultado",
      });
      return json({
        success: true,
        data: { employeeName, currentStatus },
      });
    }

    // -- Shared slot lookup for check-in and check-out --
    const { year, week, dayOfWeek } = isoWeekInfoFromClientDate(clientDate);
    const slotRes = await fetchJson<Array<ScheduleSlotRow>>(
      `${url}/rest/v1/kiosk_schedule_slots?select=id,year,week,day_of_week,start_time,end_time&organization_id=eq.${orgId}&employee_id=eq.${employee.id}&order=year.asc,week.asc,day_of_week.asc,start_time.asc&limit=128`,
      { headers: authHeaders(serviceRoleKey) },
    );

    const employeeSlots = slotRes.ok ? slotRes.data : [];
    const todaySlots = dayState.todaySlots.length
      ? dayState.todaySlots
      : employeeSlots.filter((item) =>
        Number(item.year) === year &&
        Number(item.week) === week &&
        Number(item.day_of_week) === dayOfWeek
      );
    const nextScheduledSlot = findNextAssignedSlot(employeeSlots, now);
    const eligibleCheckInSlot = findEligibleCheckInSlot(todaySlots, dayState.slotStates, clientDate, now);
    const nextAvailableTodaySlot = findNextAvailableTodaySlot(todaySlots, dayState.slotStates, clientDate, now);

    // ======================== CHECK-IN ========================
    if (action === "check-in") {
      if (currentStatus === "checked_in") {
        await logAttendanceAttemptDebug(url, serviceRoleKey, {
          organizationId: orgId,
          actorSessionId: auth.session.id,
          employeeId: employee.id,
          action: "check_in",
          outcome: "blocked_checked_in",
          clientDate,
          slotId: dayState.openSlotId,
          scheduledStart: dayState.openSlot?.start_time || null,
          scheduledEnd: dayState.openSlot?.end_time || null,
          message: "Ya tienes entrada registrada hoy",
        });
        return json({ success: false, message: "Ya tienes entrada registrada hoy" }, 409);
      }
      if (currentStatus === "checked_out" && !eligibleCheckInSlot) {
        await logAttendanceAttemptDebug(url, serviceRoleKey, {
          organizationId: orgId,
          actorSessionId: auth.session.id,
          employeeId: employee.id,
          action: "check_in",
          outcome: "blocked_checked_out",
          clientDate,
          message: "Ya has fichado entrada y salida hoy",
        });
        return json({ success: false, message: "Ya has fichado entrada y salida hoy" }, 409);
      }

      if (!todaySlots.length) {
        await logAttendanceAttemptDebug(url, serviceRoleKey, {
          organizationId: orgId,
          actorSessionId: auth.session.id,
          employeeId: employee.id,
          action: "check_in",
          outcome: "blocked_no_schedule",
          clientDate,
          message: buildNoScheduleMessage(nextScheduledSlot),
          metadata: buildNextSlotData(nextScheduledSlot, "no_schedule"),
        });
        return json(
          {
            success: false,
            message: buildNoScheduleMessage(nextScheduledSlot),
            data: buildNextSlotData(nextScheduledSlot, "no_schedule"),
          },
          403,
        );
      }

      if (!eligibleCheckInSlot) {
        const fallbackNextSlot = nextAvailableTodaySlot
          ? toScheduledSlotRef(nextAvailableTodaySlot)
          : nextScheduledSlot;
        const referenceSlot = findReferenceTodaySlot(todaySlots, clientDate, now) || todaySlots[todaySlots.length - 1];
        const isEarly = !!(nextAvailableTodaySlot && isBeforeCheckInWindow(nextAvailableTodaySlot, clientDate, now));
        const blockedMessage = buildOutsideScheduleMessage(fallbackNextSlot, referenceSlot, isEarly);
        const blockedData = buildNextSlotData(fallbackNextSlot, "outside_schedule", referenceSlot);
        await logAttendanceAttemptDebug(url, serviceRoleKey, {
          organizationId: orgId,
          actorSessionId: auth.session.id,
          employeeId: employee.id,
          action: "check_in",
          outcome: isEarly ? "blocked_too_early" : "blocked_outside_schedule",
          clientDate,
          slotId: referenceSlot.id,
          scheduledStart: referenceSlot.start_time,
          scheduledEnd: referenceSlot.end_time,
          message: blockedMessage,
          metadata: blockedData,
        });
        return json({
          success: false,
          message: blockedMessage,
          data: blockedData,
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
            slot_id: eligibleCheckInSlot.id,
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
        slotId: eligibleCheckInSlot.id,
        action: "attendance_check_in",
      });
      await logAttendanceAttemptDebug(url, serviceRoleKey, {
        organizationId: orgId,
        actorSessionId: auth.session.id,
        employeeId: employee.id,
        action: "check_in",
        outcome: "success",
        clientDate,
        slotId: eligibleCheckInSlot.id,
        scheduledStart: eligibleCheckInSlot.start_time,
        scheduledEnd: eligibleCheckInSlot.end_time,
        message: `Entrada registrada. El turno conciliara hasta las ${eligibleCheckInSlot.end_time.slice(0, 5)}.`,
      });

      return json({
        success: true,
        message: `Entrada registrada. El turno conciliara hasta las ${eligibleCheckInSlot.end_time.slice(0, 5)}.`,
        data: {
          employeeName,
          currentStatus: "checked_in",
          shiftEndTime: eligibleCheckInSlot.end_time.slice(0, 5),
        },
      });
    }

    // ======================== CHECK-OUT ========================
    if (action === "check-out") {
      if (currentStatus !== "checked_in" || !dayState.openSlotId) {
        await logAttendanceAttemptDebug(url, serviceRoleKey, {
          organizationId: orgId,
          actorSessionId: auth.session.id,
          employeeId: employee.id,
          action: "check_out",
          outcome: "blocked_not_checked_in",
          clientDate,
          message: "No tienes entrada registrada hoy",
        });
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
            slot_id: dayState.openSlotId,
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
        slotId: dayState.openSlotId,
        action: "attendance_check_out",
      });
      await logAttendanceAttemptDebug(url, serviceRoleKey, {
        organizationId: orgId,
        actorSessionId: auth.session.id,
        employeeId: employee.id,
        action: "check_out",
        outcome: "success",
        clientDate,
        slotId: dayState.openSlotId,
        scheduledStart: dayState.openSlot?.start_time || null,
        scheduledEnd: dayState.openSlot?.end_time || null,
        message: "Salida registrada",
      });

      const updatedState = await getAttendanceDayState(url, serviceRoleKey, orgId, employee.id, clientDate, now);

      return json({
        success: true,
        message: "Salida registrada",
        data: { employeeName, currentStatus: updatedState.status },
      });
    }

    return json({ success: false, message: "Accion no valida" }, 400);
  } catch (error) {
    console.error("kiosk-clock error", error);
    return json({ success: false, message: "Error interno" }, 500);
  }
});

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

function findEligibleCheckInSlot(
  slots: ScheduleSlotRow[],
  slotStates: Record<string, string>,
  clientDate: string,
  now: Date,
): ScheduleSlotRow | null {
  for (const slot of slots) {
    if (slotStates[slot.id] === "closed") continue;
    if (isInsideCheckInWindow(slot, clientDate, now)) {
      return slot;
    }
  }

  return null;
}

function findNextAvailableTodaySlot(
  slots: ScheduleSlotRow[],
  slotStates: Record<string, string>,
  clientDate: string,
  now: Date,
): ScheduleSlotRow | null {
  for (const slot of slots) {
    if (slotStates[slot.id] === "closed") continue;
    if (now <= buildClientDateTime(clientDate, slot.end_time)) {
      return slot;
    }
  }

  return null;
}

function findReferenceTodaySlot(
  slots: ScheduleSlotRow[],
  clientDate: string,
  now: Date,
): ScheduleSlotRow | null {
  let reference: ScheduleSlotRow | null = null;

  for (const slot of slots) {
    if (now >= buildClientDateTime(clientDate, slot.end_time)) {
      reference = slot;
      continue;
    }

    if (!reference) {
      reference = slot;
    }
    break;
  }

  return reference;
}

function isInsideCheckInWindow(slot: ScheduleSlotRow, clientDate: string, now: Date): boolean {
  const windowStart = new Date(buildClientDateTime(clientDate, slot.start_time).getTime() - 15 * 60000);
  const slotEnd = buildClientDateTime(clientDate, slot.end_time);
  return now >= windowStart && now <= slotEnd;
}

function isBeforeCheckInWindow(slot: ScheduleSlotRow, clientDate: string, now: Date): boolean {
  const windowStart = new Date(buildClientDateTime(clientDate, slot.start_time).getTime() - 15 * 60000);
  return now < windowStart;
}

function buildClientDateTime(clientDate: string, timeValue: string): Date {
  const [year, month, day] = clientDate.split("-").map(Number);
  const [hours, minutes, seconds] = String(timeValue || "00:00:00").split(":").map(Number);
  return new Date(year, (month || 1) - 1, day || 1, hours || 0, minutes || 0, seconds || 0, 0);
}
