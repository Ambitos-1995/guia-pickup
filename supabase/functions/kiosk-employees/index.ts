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
  issueSession,
  json,
  logAudit,
  recordAuthAttempt,
  requireSession,
  resolveEmployeeByPin,
  resolveOrgId,
} from "../_shared/kiosk.ts";

const EMPLOYEE_PIN_REGEX = /^[0-9]{4}$/;
const EMPLOYEE_IDLE_TIMEOUT_SECONDS = 10 * 60;
const EMPLOYEE_ABSOLUTE_TIMEOUT_SECONDS = 30 * 60;
const EMPLOYEE_FAILURE_LIMIT = 8;
const EMPLOYEE_BLOCK_MINUTES = 10;

interface RequestBody {
  action?: string;
  orgSlug?: string;
  pin?: string;
  nombre?: string;
  apellido?: string;
  employeeId?: string;
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
    return json({ success: false, message: "El PIN debe ser exactamente 4 cifras" }, 400);
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

    await recordAuthAttempt(supabaseUrl, key, orgId, "employee", ipAddress, false, nextFailureCount, blockedUntil);
    await logAudit(supabaseUrl, key, {
      organizationId: orgId,
      actorRole: "system",
      action: "employee_login_failed",
      metadata: { ipAddress, blockedUntil },
    });

    return json({ success: false, message: "PIN incorrecto" }, 401);
  }

  if (!employee.attendance_enabled) {
    return json({ success: false, message: "Empleado desactivado" }, 403);
  }

  const userAgent = getUserAgent(req);
  const today = new Date().toISOString().slice(0, 10);
  const currentStatus = await currentAttendanceStatus(supabaseUrl, key, employee.id, today);
  const issued = await issueSession(supabaseUrl, key, {
    organizationId: orgId,
    employeeId: employee.id,
    role: "respondent",
    idleTimeoutSeconds: EMPLOYEE_IDLE_TIMEOUT_SECONDS,
    absoluteTimeoutSeconds: EMPLOYEE_ABSOLUTE_TIMEOUT_SECONDS,
    ipAddress,
    userAgent,
  });

  await recordAuthAttempt(supabaseUrl, key, orgId, "employee", ipAddress, true, 0, null);
  await logAudit(supabaseUrl, key, {
    organizationId: orgId,
    actorSessionId: issued.session.id,
    actorRole: "respondent",
    employeeId: employee.id,
    action: "employee_login_success",
    metadata: { ipAddress },
  });

  return json({
    success: true,
    data: {
      accessToken: issued.accessToken,
      expiresAt: issued.expiresAt,
      employeeId: employee.id,
      employeeName: `${employee.nombre} ${employee.apellido}`.trim(),
      currentStatus,
      role: "respondent",
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
    created_at: string;
  }>>(
    `${supabaseUrl}/rest/v1/kiosk_employees?select=id,nombre,apellido,attendance_enabled,created_at&organization_id=eq.${orgId}&order=nombre.asc,apellido.asc`,
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

  if (!nombre || !apellido) {
    return json({ success: false, message: "Nombre y apellido son obligatorios" }, 400);
  }

  if (!EMPLOYEE_PIN_REGEX.test(pin)) {
    return json({ success: false, message: "El PIN debe ser exactamente 4 cifras" }, 400);
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
  const insert = await fetchJson<Array<{ id: string; nombre: string; apellido: string; attendance_enabled: boolean }>>(
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
        pin: null,
        pin_hash: pinHash,
        pin_lookup_hash: pinLookupHash,
        pin_algorithm: "argon2id",
        pin_migrated_at: new Date().toISOString(),
      }),
    },
  );

  if (!insert.ok || !insert.data[0]) {
    return json({ success: false, message: "Error al crear empleado" }, 500);
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

  if (!employeeId) {
    return json({ success: false, message: "Falta el empleado" }, 400);
  }

  if (nombre !== undefined && !nombre) {
    return json({ success: false, message: "El nombre no puede estar vacio" }, 400);
  }

  if (apellido !== undefined && !apellido) {
    return json({ success: false, message: "El apellido no puede estar vacio" }, 400);
  }

  if (pin !== undefined && pin !== "" && !EMPLOYEE_PIN_REGEX.test(pin)) {
    return json({ success: false, message: "El PIN debe ser exactamente 4 cifras" }, 400);
  }

  const updates: Record<string, unknown> = {};
  if (nombre) updates.nombre = nombre;
  if (apellido) updates.apellido = apellido;

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

  const update = await fetchJson<Array<{ id: string; nombre: string; apellido: string; attendance_enabled: boolean }>>(
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
    return json({ success: false, message: "Error al actualizar empleado" }, 500);
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
