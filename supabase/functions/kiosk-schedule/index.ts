import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  authHeaders,
  corsHeaders,
  fetchJson,
  json,
  logAudit,
  logScheduleMutationDebug,
  requireSession,
  resolveOrgId,
  getSupabaseConfig,
} from "../_shared/kiosk.ts";

interface RequestBody {
  action?: string;
  orgSlug?: string;
  year?: number;
  week?: number;
  dayOfWeek?: number;
  startTime?: string;
  endTime?: string;
  slotId?: string;
  hour?: number;
  employeeId?: string;
}

type ScheduleSession = {
  id: string;
  organization_id: string;
  role: "respondent" | "org_admin";
  employee_id: string | null;
};

const TIME_REGEX = /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ success: false, message: "Metodo no permitido" }, 405);
  }

  try {
    const body = await req.json() as RequestBody;
    const action = String(body.action || "").trim();
    const orgSlug = String(body.orgSlug || "").trim();

    if (!orgSlug) {
      return json({ success: false, message: "Falta la organizacion" }, 400);
    }

    const { url, serviceRoleKey } = getSupabaseConfig();
    const orgId = await resolveOrgId(url, serviceRoleKey, orgSlug);
    if (!orgId) {
      return json({ success: false, message: "Organizacion no encontrada" }, 404);
    }

    if (action === "list") {
      return await handleList(url, serviceRoleKey, orgId, body);
    }

    if (action === "assign") {
      const auth = await requireSession(req, url, serviceRoleKey, ["respondent", "org_admin"]);
      if (auth instanceof Response) return auth;
      if (auth.session.organization_id !== orgId) {
        return json({ success: false, message: "Sesion fuera de la organizacion activa" }, 403);
      }
      return await handleAssign(url, serviceRoleKey, auth.session, body);
    }

    if (action === "create-and-assign") {
      const auth = await requireSession(req, url, serviceRoleKey, ["respondent", "org_admin"]);
      if (auth instanceof Response) return auth;
      if (auth.session.organization_id !== orgId) {
        return json({ success: false, message: "Sesion fuera de la organizacion activa" }, 403);
      }
      return await handleCreateAndAssign(url, serviceRoleKey, auth.session, body);
    }

    if (action === "release") {
      const auth = await requireSession(req, url, serviceRoleKey, ["respondent", "org_admin"]);
      if (auth instanceof Response) return auth;
      if (auth.session.organization_id !== orgId) {
        return json({ success: false, message: "Sesion fuera de la organizacion activa" }, 403);
      }
      return await handleRelease(url, serviceRoleKey, auth.session, body);
    }

    if (action === "create" || action === "update" || action === "delete") {
      const auth = await requireSession(req, url, serviceRoleKey, ["org_admin"]);
      if (auth instanceof Response) return auth;
      if (auth.session.organization_id !== orgId) {
        return json({ success: false, message: "Sesion fuera de la organizacion activa" }, 403);
      }
      if (action === "create") {
        return await handleCreate(url, serviceRoleKey, auth.session, body);
      }
      if (action === "update") {
        return await handleUpdate(url, serviceRoleKey, auth.session, body);
      }
      return await handleDelete(url, serviceRoleKey, auth.session, body);
    }

    return json({ success: false, message: "Accion no valida" }, 400);
  } catch (error) {
    console.error("kiosk-schedule error", error);
    return json({ success: false, message: "Error interno" }, 500);
  }
});

async function handleList(
  url: string,
  key: string,
  orgId: string,
  body: RequestBody,
): Promise<Response> {
  const year = Number(body.year);
  const week = Number(body.week);

  if (!isValidScheduleYear(year) || !isValidScheduleWeek(week)) {
    return json({ success: false, message: "Falta year o week" }, 400);
  }

  const res = await fetchJson<Array<{
    id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    employee_id: string | null;
    kiosk_employees: { id: string; nombre: string; apellido: string } | null;
  }>>(
    `${url}/rest/v1/kiosk_schedule_slots?select=id,day_of_week,start_time,end_time,employee_id,kiosk_employees(id,nombre,apellido)&organization_id=eq.${orgId}&year=eq.${year}&week=eq.${week}&order=day_of_week.asc,start_time.asc`,
    { headers: authHeaders(key) },
  );

  if (!res.ok) {
    return json({ success: false, message: "Error al listar franjas" }, 500);
  }

  return json({
    success: true,
    data: res.data.map((slot) => ({
      id: slot.id,
      day_of_week: slot.day_of_week,
      start_time: slot.start_time,
      end_time: slot.end_time,
      assigned_employee_profile_id: slot.employee_id,
      assigned_employee_name: slot.kiosk_employees
        ? `${slot.kiosk_employees.nombre} ${slot.kiosk_employees.apellido}`.trim()
        : "",
      assigned_employee_code: slot.kiosk_employees?.id || "",
      status: slot.employee_id ? "occupied" : "free",
    })),
  });
}

async function handleAssign(
  url: string,
  key: string,
  session: ScheduleSession,
  body: RequestBody,
): Promise<Response> {
  const slotId = String(body.slotId || "").trim();
  if (!slotId) {
    return json({ success: false, message: "Falta la franja" }, 400);
  }

  const slot = await fetchSlot(url, key, session.organization_id, slotId);
  if (!slot) {
    return json({ success: false, message: "Franja no encontrada" }, 404);
  }

  const target = await resolveAssignmentEmployee(url, key, session, body);
  if (target instanceof Response) {
    return target;
  }

  if (session.role !== "org_admin" && slot.employee_id) {
    return json({ success: false, message: "La franja ya esta ocupada" }, 409);
  }

  if (session.role === "org_admin" && slot.employee_id === target.employeeId) {
    return json({ success: false, message: "La franja ya esta asignada a ese empleado" }, 409);
  }

  const update = await fetchJson<Array<{
    id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    employee_id: string | null;
  }>>(
    `${url}/rest/v1/kiosk_schedule_slots?id=eq.${encodeURIComponent(slotId)}&organization_id=eq.${session.organization_id}&${buildOccupancyFilter(slot.employee_id)}`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders(key),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ employee_id: target.employeeId }),
    },
  );

  if (!update.ok || !update.data[0]) {
    return json({ success: false, message: "No se pudo actualizar la franja. Recarga el horario y prueba otra vez." }, 409);
  }

  await logAudit(url, key, {
    organizationId: session.organization_id,
    actorSessionId: session.id,
    actorRole: session.role,
    employeeId: target.employeeId,
    slotId,
    action: session.role === "org_admin" && slot.employee_id ? "schedule_slot_reassigned" : "schedule_slot_assigned",
    metadata: {
      actorEmployeeId: session.employee_id,
      targetEmployeeId: target.employeeId,
      targetEmployeeName: target.employeeName,
      previousEmployeeId: slot.employee_id,
    },
  });
  await logScheduleMutationDebug(url, key, {
    organizationId: session.organization_id,
    actorSessionId: session.id,
    actorEmployeeId: session.employee_id,
    targetEmployeeId: target.employeeId,
    slotId,
    mutationType: session.role === "org_admin" && slot.employee_id ? "reassign" : "assign",
    year: slot.year,
    week: slot.week,
    dayOfWeek: slot.day_of_week,
    startTime: slot.start_time,
    endTime: slot.end_time,
    metadata: {
      targetEmployeeName: target.employeeName,
      previousEmployeeId: slot.employee_id,
    },
  });

  return json({
    success: true,
    data: {
      id: update.data[0].id,
      day_of_week: update.data[0].day_of_week,
      start_time: update.data[0].start_time,
      end_time: update.data[0].end_time,
      assigned_employee_profile_id: target.employeeId,
      status: "occupied",
    },
  });
}

async function handleRelease(
  url: string,
  key: string,
  session: ScheduleSession,
  body: RequestBody,
): Promise<Response> {
  const slotId = String(body.slotId || "").trim();
  if (!slotId) {
    return json({ success: false, message: "Falta la franja" }, 400);
  }

  const slot = await fetchSlot(url, key, session.organization_id, slotId);
  if (!slot) {
    return json({ success: false, message: "Franja no encontrada" }, 404);
  }

  if (!slot.employee_id) {
    return json({ success: false, message: "La franja ya esta libre" }, 409);
  }

  if (session.role !== "org_admin" && slot.employee_id !== session.employee_id) {
    return json({ success: false, message: "No puedes liberar esta franja" }, 403);
  }

  const update = await fetchJson<Array<{ id: string; day_of_week: number; start_time: string; end_time: string }>>(
    `${url}/rest/v1/kiosk_schedule_slots?id=eq.${encodeURIComponent(slotId)}&organization_id=eq.${session.organization_id}&${buildOccupancyFilter(slot.employee_id)}`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders(key),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ employee_id: null }),
    },
  );

  if (!update.ok || !update.data[0]) {
    return json({ success: false, message: "No se pudo liberar la franja. Recarga el horario y prueba otra vez." }, 409);
  }

  await logAudit(url, key, {
    organizationId: session.organization_id,
    actorSessionId: session.id,
    actorRole: session.role,
    employeeId: slot.employee_id,
    slotId,
    action: "schedule_slot_released",
    metadata: {
      actorEmployeeId: session.employee_id,
      releasedEmployeeId: slot.employee_id,
      releasedByRole: session.role,
      year: slot.year,
      week: slot.week,
      dayOfWeek: slot.day_of_week,
      startTime: slot.start_time,
      endTime: slot.end_time,
    },
  });
  await logScheduleMutationDebug(url, key, {
    organizationId: session.organization_id,
    actorSessionId: session.id,
    actorEmployeeId: session.employee_id,
    targetEmployeeId: slot.employee_id,
    slotId,
    mutationType: "release",
    year: slot.year,
    week: slot.week,
    dayOfWeek: slot.day_of_week,
    startTime: slot.start_time,
    endTime: slot.end_time,
  });

  return json({
    success: true,
    data: {
      id: update.data[0].id,
      day_of_week: update.data[0].day_of_week,
      start_time: update.data[0].start_time,
      end_time: update.data[0].end_time,
      assigned_employee_profile_id: null,
      status: "free",
    },
  });
}

async function handleCreate(
  url: string,
  key: string,
  session: { id: string; organization_id: string; role: string },
  body: RequestBody,
): Promise<Response> {
  const year = Number(body.year);
  const week = Number(body.week);
  const dayOfWeek = Number(body.dayOfWeek);
  const startTime = normalizeTimeValue(String(body.startTime || "").trim());
  const endTime = normalizeTimeValue(String(body.endTime || "").trim());

  if (!isValidScheduleYear(year) || !isValidScheduleWeek(week) || !isValidScheduleDay(dayOfWeek) || !startTime || !endTime) {
    return json({ success: false, message: "Faltan datos de la franja" }, 400);
  }

  if (!isValidSlotTimeRange(startTime, endTime)) {
    return json({ success: false, message: "La franja debe tener horas validas y una hora de fin posterior al inicio" }, 400);
  }

  if (await slotExists(url, key, session.organization_id, year, week, dayOfWeek, startTime)) {
    return json({ success: false, message: "Ya existe una franja en ese dia y hora" }, 409);
  }

  const insert = await fetchJson<Array<{
    id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    employee_id: string | null;
  }>>(
    `${url}/rest/v1/kiosk_schedule_slots`,
    {
      method: "POST",
      headers: {
        ...authHeaders(key),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        organization_id: session.organization_id,
        year,
        week,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
        employee_id: null,
      }),
    },
  );

  if (!insert.ok || !insert.data[0]) {
    return json({ success: false, message: getRestErrorMessage(insert, "Error al crear la franja") }, getFailureStatus(insert.raw.status));
  }

  await logAudit(url, key, {
    organizationId: session.organization_id,
    actorSessionId: session.id,
    actorRole: session.role,
    slotId: insert.data[0].id,
    action: "schedule_slot_created",
    metadata: { year, week, dayOfWeek, startTime, endTime },
  });
  await logScheduleMutationDebug(url, key, {
    organizationId: session.organization_id,
    actorSessionId: session.id,
    mutationType: "create",
    slotId: insert.data[0].id,
    year,
    week,
    dayOfWeek,
    startTime,
    endTime,
  });

  return json({
    success: true,
    data: {
      id: insert.data[0].id,
      slot_id: insert.data[0].id,
      day_of_week: insert.data[0].day_of_week,
      start_time: insert.data[0].start_time,
      end_time: insert.data[0].end_time,
      status: "free",
    },
  });
}

async function handleUpdate(
  url: string,
  key: string,
  session: { id: string; organization_id: string; role: string },
  body: RequestBody,
): Promise<Response> {
  const slotId = String(body.slotId || "").trim();
  const startTime = normalizeTimeValue(String(body.startTime || "").trim());
  const endTime = normalizeTimeValue(String(body.endTime || "").trim());

  if (!slotId || !startTime || !endTime) {
    return json({ success: false, message: "Faltan datos para actualizar la franja" }, 400);
  }

  if (!isValidSlotTimeRange(startTime, endTime)) {
    return json({ success: false, message: "La franja debe tener horas validas y una hora de fin posterior al inicio" }, 400);
  }

  const existingSlot = await fetchSlot(url, key, session.organization_id, slotId);
  if (!existingSlot) {
    return json({ success: false, message: "Franja no encontrada" }, 404);
  }

  if (
    startTime !== existingSlot.start_time &&
    await slotExists(url, key, session.organization_id, existingSlot.year, existingSlot.week, existingSlot.day_of_week, startTime, slotId)
  ) {
    return json({ success: false, message: "Ya existe una franja en ese dia y hora" }, 409);
  }

  const update = await fetchJson<Array<{ id: string; day_of_week: number; start_time: string; end_time: string }>>(
    `${url}/rest/v1/kiosk_schedule_slots?id=eq.${encodeURIComponent(slotId)}&organization_id=eq.${session.organization_id}`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders(key),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        start_time: startTime,
        end_time: endTime,
      }),
    },
  );

  if (!update.ok || !update.data[0]) {
    return json({ success: false, message: getRestErrorMessage(update, "Error al actualizar la franja") }, getFailureStatus(update.raw.status));
  }

  await logAudit(url, key, {
    organizationId: session.organization_id,
    actorSessionId: session.id,
    actorRole: session.role,
    slotId,
    action: "schedule_slot_updated",
    metadata: { startTime, endTime },
  });
  await logScheduleMutationDebug(url, key, {
    organizationId: session.organization_id,
    actorSessionId: session.id,
    mutationType: "update",
    slotId,
    year: existingSlot.year,
    week: existingSlot.week,
    dayOfWeek: existingSlot.day_of_week,
    startTime,
    endTime,
  });

  return json({ success: true, data: update.data[0] });
}

async function handleDelete(
  url: string,
  key: string,
  session: { id: string; organization_id: string; role: string },
  body: RequestBody,
): Promise<Response> {
  const slotId = String(body.slotId || "").trim();
  if (!slotId) {
    return json({ success: false, message: "Falta la franja" }, 400);
  }

  const slot = await fetchSlot(url, key, session.organization_id, slotId);
  if (!slot) {
    return json({ success: false, message: "Franja no encontrada" }, 404);
  }

  if (slot.employee_id) {
    return json({ success: false, message: "Libera primero la franja antes de borrarla" }, 409);
  }

  const remove = await fetch(
    `${url}/rest/v1/kiosk_schedule_slots?id=eq.${encodeURIComponent(slotId)}&organization_id=eq.${session.organization_id}`,
    {
      method: "DELETE",
      headers: authHeaders(key),
    },
  );

  if (!remove.ok) {
    return json({ success: false, message: "Error al borrar la franja" }, 500);
  }

  await logAudit(url, key, {
    organizationId: session.organization_id,
    actorSessionId: session.id,
    actorRole: session.role,
    slotId,
    action: "schedule_slot_deleted",
  });
  await logScheduleMutationDebug(url, key, {
    organizationId: session.organization_id,
    actorSessionId: session.id,
    mutationType: "delete",
    slotId,
    year: slot.year,
    week: slot.week,
    dayOfWeek: slot.day_of_week,
    startTime: slot.start_time,
    endTime: slot.end_time,
  });

  return json({ success: true });
}

async function handleCreateAndAssign(
  url: string,
  key: string,
  session: ScheduleSession,
  body: RequestBody,
): Promise<Response> {
  const year = Number(body.year);
  const week = Number(body.week);
  const dayOfWeek = Number(body.dayOfWeek);
  const hour = Number(body.hour);

  if (!isValidScheduleYear(year) || !isValidScheduleWeek(week) || !isValidScheduleDay(dayOfWeek) || !Number.isInteger(hour) || hour < 0 || hour > 22) {
    return json({ success: false, message: "Faltan datos de la franja" }, 400);
  }

  const startTime = String(hour).padStart(2, "0") + ":00:00";
  const endTime = String(hour + 1).padStart(2, "0") + ":00:00";

  if (await slotExists(url, key, session.organization_id, year, week, dayOfWeek, startTime)) {
    return json({ success: false, message: "Ya existe una franja en ese dia y hora" }, 409);
  }

  const target = await resolveAssignmentEmployee(url, key, session, body);
  if (target instanceof Response) {
    return target;
  }

  const insert = await fetchJson<Array<{
    id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    employee_id: string | null;
  }>>(
    `${url}/rest/v1/kiosk_schedule_slots`,
    {
      method: "POST",
      headers: {
        ...authHeaders(key),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        organization_id: session.organization_id,
        year,
        week,
        day_of_week: dayOfWeek,
        start_time: startTime,
        end_time: endTime,
        employee_id: target.employeeId,
      }),
    },
  );

  if (!insert.ok || !insert.data[0]) {
    return json({ success: false, message: getRestErrorMessage(insert, "Error al crear y asignar la franja") }, getFailureStatus(insert.raw.status));
  }

  await logAudit(url, key, {
    organizationId: session.organization_id,
    actorSessionId: session.id,
    actorRole: session.role,
    employeeId: target.employeeId,
    slotId: insert.data[0].id,
    action: "schedule_slot_created_and_assigned",
    metadata: {
      actorEmployeeId: session.employee_id,
      year,
      week,
      dayOfWeek,
      startTime,
      endTime,
      targetEmployeeId: target.employeeId,
      targetEmployeeName: target.employeeName,
    },
  });
  await logScheduleMutationDebug(url, key, {
    organizationId: session.organization_id,
    actorSessionId: session.id,
    actorEmployeeId: session.employee_id,
    targetEmployeeId: target.employeeId,
    slotId: insert.data[0].id,
    mutationType: "create_and_assign",
    year,
    week,
    dayOfWeek,
    startTime,
    endTime,
    metadata: {
      targetEmployeeName: target.employeeName,
    },
  });

  return json({
    success: true,
    data: {
      id: insert.data[0].id,
      day_of_week: insert.data[0].day_of_week,
      start_time: insert.data[0].start_time,
      end_time: insert.data[0].end_time,
      assigned_employee_profile_id: target.employeeId,
      status: "occupied",
    },
  });
}

async function resolveAssignmentEmployee(
  url: string,
  key: string,
  session: ScheduleSession,
  body: RequestBody,
): Promise<{ employeeId: string; employeeName: string } | Response> {
  if (session.role !== "org_admin") {
    if (!session.employee_id) {
      return json({ success: false, message: "Sesion de empleado requerida" }, 403);
    }

    const employee = await fetchEmployee(url, key, session.organization_id, session.employee_id);
    if (!employee) {
      return json({ success: false, message: "Empleado no encontrado" }, 404);
    }

    if (!employee.attendance_enabled) {
      return json({ success: false, message: "Empleado desactivado" }, 403);
    }

    return {
      employeeId: session.employee_id,
      employeeName: `${employee.nombre} ${employee.apellido}`.trim(),
    };
  }

  const employeeId = String(body.employeeId || "").trim();
  if (!employeeId) {
    return json({ success: false, message: "Selecciona un empleado para esta accion" }, 400);
  }

  const employee = await fetchEmployee(url, key, session.organization_id, employeeId);
  if (!employee) {
    return json({ success: false, message: "Empleado invalido o fuera de la organizacion" }, 404);
  }

  if (!employee.attendance_enabled) {
    return json({ success: false, message: "No puedes asignar franjas a un empleado desactivado" }, 409);
  }

  return {
    employeeId: employee.id,
    employeeName: `${employee.nombre} ${employee.apellido}`.trim(),
  };
}

function buildOccupancyFilter(employeeId: string | null): string {
  if (!employeeId) {
    return "employee_id=is.null";
  }
  return `employee_id=eq.${encodeURIComponent(employeeId)}`;
}

async function fetchEmployee(
  url: string,
  key: string,
  orgId: string,
  employeeId: string,
): Promise<{ id: string; nombre: string; apellido: string; attendance_enabled: boolean } | null> {
  const employee = await fetchJson<Array<{
    id: string;
    nombre: string;
    apellido: string;
    attendance_enabled: boolean;
  }>>(
    `${url}/rest/v1/kiosk_employees?select=id,nombre,apellido,attendance_enabled&id=eq.${encodeURIComponent(employeeId)}&organization_id=eq.${orgId}&limit=1`,
    { headers: authHeaders(key) },
  );

  return employee.ok ? employee.data[0] || null : null;
}

async function fetchSlot(
  url: string,
  key: string,
  orgId: string,
  slotId: string,
): Promise<{
  id: string;
  year: number;
  week: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
  employee_id: string | null;
} | null> {
  const slot = await fetchJson<Array<{
    id: string;
    year: number;
    week: number;
    day_of_week: number;
    start_time: string;
    end_time: string;
    employee_id: string | null;
  }>>(
    `${url}/rest/v1/kiosk_schedule_slots?select=id,year,week,day_of_week,start_time,end_time,employee_id&id=eq.${encodeURIComponent(slotId)}&organization_id=eq.${orgId}&limit=1`,
    { headers: authHeaders(key) },
  );

  return slot.ok ? slot.data[0] || null : null;
}

async function slotExists(
  url: string,
  key: string,
  orgId: string,
  year: number,
  week: number,
  dayOfWeek: number,
  startTime: string,
  excludeSlotId?: string,
): Promise<boolean> {
  const exclusion = excludeSlotId ? `&id=neq.${encodeURIComponent(excludeSlotId)}` : "";
  const existing = await fetchJson<Array<{ id: string }>>(
    `${url}/rest/v1/kiosk_schedule_slots?select=id&organization_id=eq.${orgId}&year=eq.${year}&week=eq.${week}&day_of_week=eq.${dayOfWeek}&start_time=eq.${encodeURIComponent(startTime)}${exclusion}&limit=1`,
    { headers: authHeaders(key) },
  );

  return !!(existing.ok && existing.data[0]);
}

function normalizeTimeValue(value: string): string {
  if (!value || !TIME_REGEX.test(value)) return "";
  return value.length === 5 ? `${value}:00` : value;
}

function isValidSlotTimeRange(startTime: string, endTime: string): boolean {
  if (!startTime || !endTime || !TIME_REGEX.test(startTime) || !TIME_REGEX.test(endTime)) {
    return false;
  }
  return startTime < endTime;
}

function isValidScheduleYear(year: number): boolean {
  return Number.isInteger(year) && year >= 2000 && year <= 2100;
}

function isValidScheduleWeek(week: number): boolean {
  return Number.isInteger(week) && week >= 1 && week <= 53;
}

function isValidScheduleDay(dayOfWeek: number): boolean {
  return Number.isInteger(dayOfWeek) && dayOfWeek >= 1 && dayOfWeek <= 5;
}

function getFailureStatus(status: number): number {
  return status >= 400 && status < 500 ? status : 500;
}

function getRestErrorMessage(
  result: { data: unknown },
  fallback: string,
): string {
  if (!result || !result.data || typeof result.data !== "object") {
    return fallback;
  }

  const payload = result.data as Record<string, unknown>;
  const message = typeof payload.message === "string" ? payload.message.trim() : "";
  const details = typeof payload.details === "string" ? payload.details.trim() : "";

  if (message && details) {
    return `${message}: ${details}`;
  }

  return message || details || fallback;
}
