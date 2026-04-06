import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  initCors,
  createPinLookupHash,
  currentAttendanceStatus,
  fetchJson,
  getClientIp,
  logDebugEvent,
  getSessionSecret,
  getSupabaseConfig,
  getUserAgent,
  getRateLimitStatus,
  hashPin,
  issueOfflineClockToken,
  issueSession,
  json,
  logAudit,
  logUnhandledEdgeError,
  madridDateIso,
  recordAuthAttempt,
  revokeSession,
  requireSession,
  resolveEmployeeByPin,
  resolveOrgId,
} from "../_shared/kiosk.ts";

const EMPLOYEE_PIN_REGEX = /^[0-9]{4,6}$/;
const EMPLOYEE_IDLE_TIMEOUT_SECONDS = 10 * 60;
const EMPLOYEE_ABSOLUTE_TIMEOUT_SECONDS = 30 * 60;
const ADMIN_IDLE_TIMEOUT_SECONDS = 5 * 60;
const ADMIN_ABSOLUTE_TIMEOUT_SECONDS = 15 * 60;
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
  settings?: Record<string, unknown>;
}

const ALLOWED_SETTINGS_KEYS = ["legal_representative_name"] as const;
const MAX_SETTING_VALUE_LENGTH = 200;

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
    getSessionSecret();
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

    if (action === "verify") {
      return await handleVerify(req, url, serviceRoleKey, orgId, body);
    }

    if (action === "logout") {
      const auth = await requireSession(req, url, serviceRoleKey, ["respondent", "org_admin"]);
      if (auth instanceof Response) {
        return auth;
      }

      if (auth.session.organization_id !== orgId) {
        return json({ success: false, message: "Sesion fuera de la organizacion activa" }, 403);
      }

      return await handleLogout(url, serviceRoleKey, auth.session);
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

    if (action === "get-org-settings") {
      return await handleGetOrgSettings(url, serviceRoleKey, auth.session.organization_id);
    }

    if (action === "update-org-settings") {
      return await handleUpdateOrgSettings(url, serviceRoleKey, auth.session.organization_id, auth.session.id, body);
    }

    return json({ success: false, message: "Accion no valida" }, 400);
  } catch (error) {
    await logUnhandledEdgeError(errUrl, errKey, "kiosk-employees", error, { requestMethod: req.method });
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
    await logDebugEvent(supabaseUrl, key, {
      organizationId: orgId,
      source: "edge",
      scope: "auth",
      action: "employee_verify",
      outcome: "invalid_pin_format",
      message: "PIN con formato invalido",
      metadata: buildEmployeeAuthMetadata(req, pin, {
        reason: "invalid_pin_format",
      }),
    });
    return json({ success: false, message: "El PIN debe ser entre 4 y 6 cifras" }, 400);
  }

  const ipAddress = getClientIp(req);
  const userAgent = getUserAgent(req);
  const limiter = await getRateLimitStatus(supabaseUrl, key, orgId, "employee", ipAddress);
  if (limiter.blockedUntil) {
    await logDebugEvent(supabaseUrl, key, {
      organizationId: orgId,
      source: "edge",
      scope: "auth",
      action: "employee_verify",
      outcome: "blocked_rate_limit",
      message: "Demasiados intentos de PIN",
      metadata: buildEmployeeAuthMetadata(req, pin, {
        reason: "rate_limit",
        failureCount: limiter.failureCount,
        blockedUntil: limiter.blockedUntil,
      }),
    });
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
      recordAuthAttempt(
        supabaseUrl,
        key,
        orgId,
        "employee",
        ipAddress,
        false,
        nextFailureCount,
        blockedUntil,
        buildEmployeeAuthMetadata(req, pin, {
          reason: "pin_not_matched",
          failureCount: nextFailureCount,
          blockedUntil,
        }),
      ),
      logAudit(supabaseUrl, key, {
        organizationId: orgId,
        actorRole: "system",
        action: "employee_login_failed",
        metadata: buildEmployeeAuthMetadata(req, pin, {
          reason: "pin_not_matched",
          failureCount: nextFailureCount,
          blockedUntil,
        }),
      }),
      logDebugEvent(supabaseUrl, key, {
        organizationId: orgId,
        source: "edge",
        scope: "auth",
        action: "employee_verify",
        outcome: "failure",
        message: "PIN incorrecto",
        metadata: buildEmployeeAuthMetadata(req, pin, {
          reason: "pin_not_matched",
          failureCount: nextFailureCount,
          blockedUntil,
        }),
      }),
    ]);

    return json({ success: false, message: "PIN incorrecto" }, 401);
  }

  const isAdmin = employee.role === "admin";

  if (!isAdmin && !employee.attendance_enabled) {
    await logDebugEvent(supabaseUrl, key, {
      organizationId: orgId,
      employeeId: employee.id,
      source: "edge",
      scope: "auth",
      action: "employee_verify",
      outcome: "blocked_employee_disabled",
      message: "Empleado desactivado",
      metadata: buildEmployeeAuthMetadata(req, pin, {
        reason: "employee_disabled",
        employeeRole: employee.role,
      }),
    });
    return json({ success: false, message: "Empleado desactivado" }, 403);
  }

  const today = madridDateIso();
  const currentStatus = isAdmin ? "not_checked_in" : await currentAttendanceStatus(supabaseUrl, key, orgId, employee.id, today);

  const sessionRole = isAdmin ? "org_admin" : "respondent";
  const idleTimeout = isAdmin ? ADMIN_IDLE_TIMEOUT_SECONDS : EMPLOYEE_IDLE_TIMEOUT_SECONDS;
  const absoluteTimeout = isAdmin ? ADMIN_ABSOLUTE_TIMEOUT_SECONDS : EMPLOYEE_ABSOLUTE_TIMEOUT_SECONDS;

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
    recordAuthAttempt(
      supabaseUrl,
      key,
      orgId,
      "employee",
      ipAddress,
      true,
      0,
      null,
      buildEmployeeAuthMetadata(req, pin, {
        reason: "login_success",
        employeeId: employee.id,
        employeeRole: employee.role,
        currentStatus,
      }),
    ),
    logAudit(supabaseUrl, key, {
      organizationId: orgId,
      actorSessionId: issued.session.id,
      actorRole: sessionRole,
      employeeId: employee.id,
      action: "employee_login_success",
      metadata: buildEmployeeAuthMetadata(req, pin, {
        reason: "login_success",
        employeeId: employee.id,
        employeeRole: employee.role,
        currentStatus,
      }),
    }),
    logDebugEvent(supabaseUrl, key, {
      organizationId: orgId,
      actorSessionId: issued.session.id,
      employeeId: employee.id,
      source: "edge",
      scope: "auth",
      action: "employee_verify",
      outcome: "success",
      message: "Login de empleado correcto",
      metadata: buildEmployeeAuthMetadata(req, pin, {
        reason: "login_success",
        employeeId: employee.id,
        employeeRole: employee.role,
        currentStatus,
      }),
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

async function handleLogout(
  supabaseUrl: string,
  key: string,
  session: {
    id: string;
    organization_id: string;
    role: "respondent" | "org_admin";
    employee_id: string | null;
  },
): Promise<Response> {
  await Promise.all([
    revokeSession(supabaseUrl, key, session.id),
    logAudit(supabaseUrl, key, {
      organizationId: session.organization_id,
      actorSessionId: session.id,
      actorRole: session.role,
      employeeId: session.employee_id,
      action: "session_logout",
    }),
  ]);

  return json({ success: true });
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

function buildEmployeeAuthMetadata(
  req: Request,
  pin: string,
  extras: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    route: "kiosk-employees.verify",
    pinLength: pin.length,
    ipAddress: getClientIp(req),
    userAgent: getUserAgent(req),
    ...extras,
  };
}

// ─── Org settings ─────────────────────────────────────────────────────────────

async function handleGetOrgSettings(
  url: string,
  key: string,
  orgId: string,
): Promise<Response> {
  const res = await fetchJson<Array<{ settings: Record<string, unknown> }>>(
    `${url}/rest/v1/organizations?select=settings&id=eq.${orgId}&limit=1`,
    { headers: getHeaders(key) },
  );

  if (!res.ok || !res.data?.[0]) {
    return json({ success: false, message: "Error al obtener ajustes" }, 500);
  }

  return json({ success: true, data: { settings: res.data[0].settings || {} } });
}

async function handleUpdateOrgSettings(
  url: string,
  key: string,
  orgId: string,
  sessionId: string,
  body: RequestBody,
): Promise<Response> {
  const incoming = body.settings;
  if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
    return json({ success: false, message: "Datos de ajustes invalidos" }, 400);
  }

  const currentRes = await fetchJson<Array<{ settings: Record<string, unknown> }>>(
    `${url}/rest/v1/organizations?select=settings&id=eq.${orgId}&limit=1`,
    { headers: getHeaders(key) },
  );
  const currentSettings: Record<string, unknown> = (currentRes.ok && currentRes.data?.[0]?.settings) || {};
  const merged = { ...currentSettings };
  const changes: Record<string, { old: unknown; new: unknown }> = {};

  for (const allowedKey of ALLOWED_SETTINGS_KEYS) {
    if (!(allowedKey in incoming)) continue;
    const raw = incoming[allowedKey];
    if (typeof raw !== "string") {
      return json({ success: false, message: `El campo "${allowedKey}" debe ser texto` }, 400);
    }
    const trimmed = raw.trim();
    if (trimmed.length > MAX_SETTING_VALUE_LENGTH) {
      return json({ success: false, message: `El campo "${allowedKey}" excede ${MAX_SETTING_VALUE_LENGTH} caracteres` }, 400);
    }
    if (merged[allowedKey] !== trimmed) {
      changes[allowedKey] = { old: merged[allowedKey] ?? null, new: trimmed };
      merged[allowedKey] = trimmed;
    }
  }

  if (Object.keys(changes).length === 0) {
    return json({ success: true, data: { settings: merged }, message: "Sin cambios" });
  }

  const updateRes = await fetchJson(
    `${url}/rest/v1/organizations?id=eq.${orgId}`,
    {
      method: "PATCH",
      headers: { ...getHeaders(key), "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ settings: merged, updated_at: new Date().toISOString() }),
    },
  );

  if (!updateRes.ok) {
    return json({ success: false, message: "Error al guardar ajustes" }, 500);
  }

  await logAudit(url, key, {
    organizationId: orgId,
    actorSessionId: sessionId,
    actorRole: "org_admin",
    action: "org_settings_updated",
    metadata: { changes },
  });

  return json({ success: true, data: { settings: merged } });
}
