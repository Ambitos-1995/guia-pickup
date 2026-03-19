import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createPinLookupHash,
  currentAttendanceStatus,
  fetchJson,
  getClientIp,
  getSessionSecret,
  getSupabaseConfig,
  getUserAgent,
  getRateLimitStatus,
  hashPin,
  issueOfflineClockToken,
  issueSession,
  json,
  logAudit,
  madridDateIso,
  recordAuthAttempt,
  requireSession,
  resolveEmployeeByPin,
  resolveOrgId,
} from "../_shared/kiosk.ts";

const EMPLOYEE_PIN_REGEX = /^[0-9]{4,6}$/;
const EMPLOYEE_IDLE_TIMEOUT_SECONDS = 10 * 60;
const EMPLOYEE_ABSOLUTE_TIMEOUT_SECONDS = 30 * 60;
const OFFLINE_CLOCK_TOKEN_TIMEOUT_SECONDS = 30 * 60;
const EMPLOYEE_FAILURE_LIMIT = 8;
const EMPLOYEE_BLOCK_MINUTES = 10;

interface RequestBody {
  action?: string;
  orgSlug?: string;
  pin?: string;
  nombre?: string;
  apellido?: string;
  employeeId?: string;
  attendance_enabled?: boolean;
  role?: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ success: false, message: "Metodo no permitido" }, 405);
  }

  try {
    getSessionSecret();
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

    if (action === "verify") {
      return await handleVerify(req, url, serviceRoleKey, orgId, body);
    }

    const auth = await requireSession(req, url, serviceRoleKey, ["org_admin"]);
    if (auth instanceof Response) {
      return auth;
    }

    if (auth.session.organization_id !== orgId) {
      return json({ success: false, message: "Sesion fuera de la organizacion activa" }, 403);
    }

    if (action === "list") {
      return await handleList(url, serviceRoleKey, auth.session.organization_id);
    }

    if (action === "create") {
      return await handleCreate(url, serviceRoleKey, auth.session.organization_id, auth.session.id, body);
    }

    if (action === "update") {
      return await handleUpdate(url, serviceRoleKey, auth.session.organization_id, auth.session.id, body);
    }

    return json({ success: false, message: "Accion no valida" }, 400);
  } catch (error) {
    console.error("kiosk-employees error", error);
    return json({ success: false, message: "Error interno" }, 500);
  }
});

async function handleVerify(
  req: Request,
  supabaseUrl: string,
  key: string,
  orgId: string,
  body: RequestBody,
): Promise<Response> {
  const pin = String(body.pin || "").trim();
  if (!EMPLOYEE_PIN_REGEX.test(pin)) {
    return json({ success: false, message: "El PIN debe ser entre 4 y 6 cifras" }, 400);
  }

  const ipAddress = getClientIp(req);
  const limiter = await getRateLimitStatus(supabaseUrl, key, orgId, "employee", ipAddress);
  if (limiter.blockedUntil) {
    return json({
      success: false,
      error: "TOO_MANY_ATTEMPTS",
      message: "Demasiados intentos. Espera unos minutos antes de volver a probar.",
      retryAt: limiter.blockedUntil,
    }, 429);
  }

  const employee = await resolveEmployeeByPin(supabaseUrl, key, orgId, pin);
  if (!employee) {
    const nextFailureCount = limiter.failureCount + 1;
    const blockedUntil = nextFailureCount >= EMPLOYEE_FAILURE_LIMIT
      ? new Date(Date.now() + EMPLOYEE_BLOCK_MINUTES * 60 * 1000).toISOString()
      : null;

    await Promise.all([
      recordAuthAttempt(supabaseUrl, key, orgId, "employee", ipAddress, false, nextFailureCount, blockedUntil),
      logAudit(supabaseUrl, key, {
        organizationId: orgId,
        actorRole: "system",
        action: "employee_login_failed",
        metadata: { ipAddress, blockedUntil },
      }),
    ]);

    return json({ success: false, message: "PIN incorrecto" }, 401);
  }

  if (employee.role === "admin") {
    return json({ success: false, message: "Los administradores deben usar el engranaje de ajustes" }, 403);
  }

  if (!employee.attendance_enabled) {
    return json({ success: false, message: "Empleado desactivado" }, 403);
  }

  const userAgent = getUserAgent(req);
  const today = madridDateIso();
  const currentStatus = await currentAttendanceStatus(supabaseUrl, key, orgId, employee.id, today);

  const sessionRole = "respondent";
  const idleTimeout = EMPLOYEE_IDLE_TIMEOUT_SECONDS;
  const absoluteTimeout = EMPLOYEE_ABSOLUTE_TIMEOUT_SECONDS;

  const issued = await issueSession(supabaseUrl, key, {
    organizationId: orgId,
    employeeId: employee.id,
    role: sessionRole,
    idleTimeoutSeconds: idleTimeout,
    absoluteTimeoutSeconds: absoluteTimeout,
    ipAddress,
    userAgent,
  });
  const offlineClock = await issueOfflineClockToken({
    organizationId: orgId,
    employeeId: employee.id,
    ttlSeconds: OFFLINE_CLOCK_TOKEN_TIMEOUT_SECONDS,
  });

  await Promise.all([
    recordAuthAttempt(supabaseUrl, key, orgId, "employee", ipAddress, true, 0, null),
    logAudit(supabaseUrl, key, {
      organizationId: orgId,
      actorSessionId: issued.session.id,
      actorRole: sessionRole,
      employeeId: employee.id,
      action: "employee_login_success",
      metadata: { ipAddress, employeeRole: employee.role },
    }),
  ]);

  return json({
    success: true,
    data: {
      accessToken: issued.accessToken,
      expiresAt: issued.expiresAt,
      offlineClockToken: offlineClock.offlineClockToken,
      offlineClockTokenExpiresAt: offlineClock.offlineClockTokenExpiresAt,
      employeeId: employee.id,
      employeeName: `${employee.nombre} ${employee.apellido}`.trim(),
      currentStatus,
      role: sessionRole,
      organizationId: orgId,
    },
  });
}

async function handleList(
  supabaseUrl: string,
  key: string,
  orgId: string,
): Promise<Response> {
  const res = await fetchJson<Array<{
    id: string;
    nombre: string;
    apellido: string;
    attendance_enabled: boolean;
    role: string;
    created_at: string;
  }>>(
    `${supabaseUrl}/rest/v1/kiosk_employees?select=id,nombre,apellido,attendance_enabled,role,created_at&organization_id=eq.${orgId}&order=nombre.asc,apellido.asc`,
    { headers: { ...getHeaders(key) } },
  );

  if (!res.ok) {
    return json({ success: false, message: "Error al listar empleados" }, 500);
  }

  return json({ success: true, data: res.data });
}

async function handleCreate(
  supabaseUrl: string,
  key: string,
  orgId: string,
  sessionId: string,
  body: RequestBody,
): Promise<Response> {
  const nombre = String(body.nombre || "").trim();
  const apellido = String(body.apellido || "").trim();
  const pin = String(body.pin || "").trim();
  const role = String(body.role || "employee").trim();

  if (!nombre || !apellido) {
    return json({ success: false, message: "Nombre y apellido son obligatorios" }, 400);
  }

  if (role !== "employee" && role !== "admin") {
    return json({ success: false, message: "Rol invalido" }, 400);
  }

  if (!EMPLOYEE_PIN_REGEX.test(pin)) {
    return json({ success: false, message: "El PIN debe ser entre 4 y 6 cifras" }, 400);
  }

  if (role === "admin" && pin.length < 6) {
    return json({ success: false, message: "Los administradores deben tener un PIN de 6 cifras" }, 400);
  }

  if (role === "employee" && pin.length !== 4) {
    return json({ success: false, message: "Los empleados deben tener un PIN de 4 cifras" }, 400);
  }

  const pinLookupHash = await createPinLookupHash(orgId, pin);
  const existing = await fetchJson<Array<{ id: string }>>(
    `${supabaseUrl}/rest/v1/kiosk_employees?select=id&organization_id=eq.${orgId}&pin_lookup_hash=eq.${pinLookupHash}&limit=1`,
    { headers: getHeaders(key) },
  );

  if (existing.ok && existing.data[0]) {
    return json({ success: false, message: "Ya existe un empleado con ese PIN" }, 409);
  }

  const pinHash = await hashPin(pin);
  const insert = await fetchJson<Array<{ id: string; nombre: string; apellido: string; attendance_enabled: boolean; role: string }>>(
    `${supabaseUrl}/rest/v1/kiosk_employees`,
    {
      method: "POST",
      headers: {
        ...getHeaders(key),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        organization_id: orgId,
        nombre,
        apellido,
        attendance_enabled: true,
        role,
        pin: null,
        pin_hash: pinHash,
        pin_lookup_hash: pinLookupHash,
        pin_algorithm: "argon2id",
        pin_migrated_at: new Date().toISOString(),
      }),
    },
  );

  if (!insert.ok || !insert.data[0]) {
    return json({ success: false, message: getRestErrorMessage(insert, "Error al crear empleado") }, 500);
  }

  await logAudit(supabaseUrl, key, {
    organizationId: orgId,
    actorSessionId: sessionId,
    actorRole: "org_admin",
    employeeId: insert.data[0].id,
    action: "employee_created",
    metadata: { nombre, apellido },
  });

  return json({ success: true, data: insert.data[0] });
}

async function handleUpdate(
  supabaseUrl: string,
  key: string,
  orgId: string,
  sessionId: string,
  body: RequestBody,
): Promise<Response> {
  const employeeId = String(body.employeeId || "").trim();
  const nombre = body.nombre !== undefined ? String(body.nombre).trim() : undefined;
  const apellido = body.apellido !== undefined ? String(body.apellido).trim() : undefined;
  const pin = body.pin !== undefined ? String(body.pin).trim() : undefined;
  const attendanceEnabled = body.attendance_enabled;
  const role = body.role !== undefined ? String(body.role).trim() : undefined;

  if (!employeeId) {
    return json({ success: false, message: "Falta el empleado" }, 400);
  }

  if (nombre !== undefined && !nombre) {
    return json({ success: false, message: "El nombre no puede estar vacio" }, 400);
  }

  if (apellido !== undefined && !apellido) {
    return json({ success: false, message: "El apellido no puede estar vacio" }, 400);
  }

  if (role !== undefined && role !== "employee" && role !== "admin") {
    return json({ success: false, message: "Rol invalido" }, 400);
  }

  if (pin !== undefined && pin !== "" && !EMPLOYEE_PIN_REGEX.test(pin)) {
    return json({ success: false, message: "El PIN debe ser entre 4 y 6 cifras" }, 400);
  }

  const existingEmployee = await fetchJson<Array<{
    id: string;
    role: string;
  }>>(
    `${supabaseUrl}/rest/v1/kiosk_employees?select=id,role&id=eq.${encodeURIComponent(employeeId)}&organization_id=eq.${orgId}&limit=1`,
    { headers: getHeaders(key) },
  );

  const currentEmployee = existingEmployee.ok ? existingEmployee.data[0] : null;
  if (!currentEmployee) {
    return json({ success: false, message: "Empleado no encontrado" }, 404);
  }

  const effectiveRole = role || currentEmployee.role;
  const roleChanged = effectiveRole !== currentEmployee.role;

  if (effectiveRole !== "employee" && effectiveRole !== "admin") {
    return json({ success: false, message: "Rol invalido" }, 400);
  }

  if (roleChanged && !pin) {
    return json({ success: false, message: "Al cambiar el rol debes definir un PIN nuevo compatible" }, 400);
  }

  if (pin && effectiveRole === "admin" && pin.length < 6) {
    return json({ success: false, message: "Los administradores deben tener un PIN de 6 cifras" }, 400);
  }

  if (pin && effectiveRole === "employee" && pin.length !== 4) {
    return json({ success: false, message: "Los empleados deben tener un PIN de 4 cifras" }, 400);
  }

  const updates: Record<string, unknown> = {};
  if (nombre !== undefined) updates.nombre = nombre;
  if (apellido !== undefined) updates.apellido = apellido;
  if (typeof attendanceEnabled === "boolean") updates.attendance_enabled = attendanceEnabled;
  if (role === "employee" || role === "admin") updates.role = role;

  if (pin) {
    const pinLookupHash = await createPinLookupHash(orgId, pin);
    const existing = await fetchJson<Array<{ id: string }>>(
      `${supabaseUrl}/rest/v1/kiosk_employees?select=id&organization_id=eq.${orgId}&pin_lookup_hash=eq.${pinLookupHash}&id=neq.${encodeURIComponent(employeeId)}&limit=1`,
      { headers: getHeaders(key) },
    );

    if (existing.ok && existing.data[0]) {
      return json({ success: false, message: "Ya existe un empleado con ese PIN" }, 409);
    }

    updates.pin_hash = await hashPin(pin);
    updates.pin_lookup_hash = pinLookupHash;
    updates.pin_algorithm = "argon2id";
    updates.pin_migrated_at = new Date().toISOString();
    updates.pin = null;
  }

  if (Object.keys(updates).length === 0) {
    return json({ success: false, message: "No hay cambios para guardar" }, 400);
  }

  const update = await fetchJson<Array<{ id: string; nombre: string; apellido: string; attendance_enabled: boolean; role: string }>>(
    `${supabaseUrl}/rest/v1/kiosk_employees?id=eq.${encodeURIComponent(employeeId)}&organization_id=eq.${orgId}`,
    {
      method: "PATCH",
      headers: {
        ...getHeaders(key),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(updates),
    },
  );

  if (!update.ok || !update.data[0]) {
    return json({ success: false, message: getRestErrorMessage(update, "Error al actualizar empleado") }, 500);
  }

  await logAudit(supabaseUrl, key, {
    organizationId: orgId,
    actorSessionId: sessionId,
    actorRole: "org_admin",
    employeeId,
    action: "employee_updated",
    metadata: {
      fields: Object.keys(updates),
    },
  });

  return json({ success: true, data: update.data[0] });
}

function getHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
  };
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
