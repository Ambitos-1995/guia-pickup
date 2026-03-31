import Argon2id from "jsr:@rabbit-company/argon2id";

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, x-kiosk-clock-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

export const APP_TIME_ZONE = "Europe/Madrid";

interface CivilDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

const MADRID_DATE_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export type SessionRole = "org_admin" | "respondent";

export interface SessionRecord {
  id: string;
  organization_id: string;
  employee_id: string | null;
  role: SessionRole;
  idle_timeout_seconds: number;
  absolute_timeout_seconds: number;
  absolute_expires_at: string;
  idle_expires_at: string;
  revoked_at: string | null;
  created_at: string;
}

interface SessionTokenPayload {
  sid: string;
  orgId: string;
  employeeId: string | null;
  role: SessionRole;
  iat: number;
  exp: number;
  ver: 1;
}

interface OfflineClockTokenPayload {
  orgId: string;
  employeeId: string;
  scope: "clock_offline";
  iat: number;
  exp: number;
  ver: 1;
}

interface IssueSessionInput {
  organizationId: string;
  employeeId?: string | null;
  role: SessionRole;
  idleTimeoutSeconds: number;
  absoluteTimeoutSeconds: number;
  ipAddress: string;
  userAgent: string;
}

interface RestResponse<T> {
  ok: boolean;
  data: T;
  raw: Response;
}

export interface EmployeeRow {
  id: string;
  nombre: string;
  apellido: string;
  attendance_enabled: boolean;
  role: string;
  pin_hash: string | null;
  pin_lookup_hash: string | null;
  pin: string | null;
  pin_migrated_at?: string | null;
}

export interface AttendanceSlotRow {
  id: string;
  year: number;
  week: number;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

type AttendanceSlotLifecycle = "none" | "open" | "closed";

interface AttendanceEventRow {
  id: string;
  action: "check_in" | "check_out";
  slot_id: string | null;
  recorded_at: string;
}

export interface AttendanceDayState {
  status: "not_checked_in" | "checked_in" | "checked_out";
  openSlotId: string | null;
  openSlot: AttendanceSlotRow | null;
  todaySlots: AttendanceSlotRow[];
  slotStates: Record<string, AttendanceSlotLifecycle>;
  hasCheckOut: boolean;
}

export function json(payload: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      ...headers,
    },
  });
}

export function authHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
  };
}

export function getSupabaseConfig(): { url: string; serviceRoleKey: string } {
  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase credentials");
  }

  return { url, serviceRoleKey };
}

export function getSessionSecret(): string {
  const secret = Deno.env.get("KIOSK_SESSION_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!secret) throw new Error("Missing session secret");
  return secret;
}

export function getPinLookupSecret(): string {
  const secret = Deno.env.get("KIOSK_PIN_LOOKUP_SECRET") || getSessionSecret();
  if (!secret) throw new Error("Missing pin lookup secret");
  return secret;
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
  return forwarded.split(",")[0].trim() || "unknown";
}

export function getUserAgent(req: Request): string {
  return req.headers.get("user-agent") || "";
}

export async function resolveOrgId(
  supabaseUrl: string,
  key: string,
  slug: string,
): Promise<string | null> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/organizations?select=id&slug=eq.${encodeURIComponent(slug)}&limit=1`,
    { headers: authHeaders(key) },
  );

  if (!res.ok) return null;
  const rows = await res.json() as Array<{ id: string }>;
  return rows[0]?.id ?? null;
}

export async function verifyAdminPin(
  supabaseUrl: string,
  key: string,
  orgId: string,
  pin: string,
): Promise<boolean> {
  if (!pin) return false;

  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/verify_organization_super_admin_pin`, {
    method: "POST",
    headers: {
      ...authHeaders(key),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_organization_id: orgId,
      p_pin: pin,
    }),
  });

  if (!res.ok) return false;
  return (await res.json()) === true;
}

export async function hashPin(pin: string): Promise<string> {
  return await Argon2id.hashEncoded(pin, Argon2id.randomSalt(), 4, 64, 3, 32);
}

export async function verifyPinHash(pin: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return await Argon2id.verify(hash, pin);
}

export async function createPinLookupHash(orgId: string, pin: string): Promise<string> {
  const secret = getPinLookupSecret();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const input = `${orgId}:${pin}`;
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return bytesToHex(new Uint8Array(signature));
}

export async function resolveEmployeeByPin(
  supabaseUrl: string,
  key: string,
  orgId: string,
  pin: string,
): Promise<EmployeeRow | null> {
  const lookupHash = await createPinLookupHash(orgId, pin);
  const hashedQuery =
    `${supabaseUrl}/rest/v1/kiosk_employees?select=id,nombre,apellido,attendance_enabled,role,pin_hash,pin_lookup_hash,pin,pin_migrated_at` +
    `&organization_id=eq.${orgId}&pin_lookup_hash=eq.${lookupHash}&limit=1`;

  const hashedMatch = await fetch(hashedQuery, { headers: authHeaders(key) });
  if (hashedMatch.ok) {
    const hashedRows = await hashedMatch.json() as EmployeeRow[];
    if (hashedRows[0] && hashedRows[0].pin_hash) {
      const isValid = await verifyPinHash(pin, hashedRows[0].pin_hash);
      if (isValid) return hashedRows[0];
    }
  }

  const legacyQuery =
    `${supabaseUrl}/rest/v1/kiosk_employees?select=id,nombre,apellido,attendance_enabled,role,pin_hash,pin_lookup_hash,pin,pin_migrated_at` +
    `&organization_id=eq.${orgId}&pin=eq.${encodeURIComponent(pin)}&limit=1`;

  const legacyMatch = await fetch(legacyQuery, { headers: authHeaders(key) });
  if (!legacyMatch.ok) return null;

  const legacyRows = await legacyMatch.json() as EmployeeRow[];
  const legacyEmployee = legacyRows[0];
  if (!legacyEmployee) return null;

  const pinHash = await hashPin(pin);
  await fetch(
    `${supabaseUrl}/rest/v1/kiosk_employees?id=eq.${encodeURIComponent(legacyEmployee.id)}&organization_id=eq.${orgId}`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders(key),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        pin_hash: pinHash,
        pin_lookup_hash: lookupHash,
        pin_algorithm: "argon2id",
        pin_migrated_at: new Date().toISOString(),
        pin: null,
      }),
    },
  );

  return {
    ...legacyEmployee,
    pin_hash: pinHash,
    pin_lookup_hash: lookupHash,
    pin: null,
    pin_migrated_at: new Date().toISOString(),
  };
}

export async function issueSession(
  supabaseUrl: string,
  key: string,
  input: IssueSessionInput,
): Promise<{ accessToken: string; expiresAt: string; session: SessionRecord }> {
  const now = new Date();
  const absoluteExpiresAt = new Date(now.getTime() + input.absoluteTimeoutSeconds * 1000);
  const idleExpiresAt = new Date(now.getTime() + input.idleTimeoutSeconds * 1000);

  const inserted = await fetchJson<SessionRecord[]>(
    `${supabaseUrl}/rest/v1/kiosk_sessions`,
    {
      method: "POST",
      headers: {
        ...authHeaders(key),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        organization_id: input.organizationId,
        employee_id: input.employeeId || null,
        role: input.role,
        idle_timeout_seconds: input.idleTimeoutSeconds,
        absolute_timeout_seconds: input.absoluteTimeoutSeconds,
        absolute_expires_at: absoluteExpiresAt.toISOString(),
        idle_expires_at: idleExpiresAt.toISOString(),
        last_seen_at: now.toISOString(),
        ip_address: input.ipAddress,
        user_agent: input.userAgent,
      }),
    },
  );

  if (!inserted.ok || !inserted.data[0]) {
    throw new Error("Could not create session");
  }

  const session = inserted.data[0];
  const token = await signSessionToken({
    sid: session.id,
    orgId: input.organizationId,
    employeeId: input.employeeId || null,
    role: input.role,
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(absoluteExpiresAt.getTime() / 1000),
    ver: 1,
  });

  return {
    accessToken: token,
    expiresAt: absoluteExpiresAt.toISOString(),
    session,
  };
}

export async function issueOfflineClockToken(input: {
  organizationId: string;
  employeeId: string;
  ttlSeconds: number;
}): Promise<{ offlineClockToken: string; offlineClockTokenExpiresAt: string }> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + input.ttlSeconds * 1000);
  const token = await signOfflineClockToken({
    orgId: input.organizationId,
    employeeId: input.employeeId,
    scope: "clock_offline",
    iat: Math.floor(now.getTime() / 1000),
    exp: Math.floor(expiresAt.getTime() / 1000),
    ver: 1,
  });

  return {
    offlineClockToken: token,
    offlineClockTokenExpiresAt: expiresAt.toISOString(),
  };
}

export async function requireSession(
  req: Request,
  supabaseUrl: string,
  key: string,
  allowedRoles?: SessionRole[],
): Promise<{ session: SessionRecord; token: SessionTokenPayload } | Response> {
  const authHeader = req.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return json({ success: false, error: "AUTH_REQUIRED", message: "Sesion requerida" }, 401);
  }

  const token = await verifySessionToken(authHeader.slice(7).trim());
  if (!token) {
    return json({ success: false, error: "TOKEN_INVALID", message: "Sesion invalida" }, 401);
  }

  if (allowedRoles && !allowedRoles.includes(token.role)) {
    return json({ success: false, error: "ROLE_FORBIDDEN", message: "Sesion sin permisos" }, 403);
  }

  const lookup = await fetchJson<SessionRecord[]>(
    `${supabaseUrl}/rest/v1/kiosk_sessions?select=id,organization_id,employee_id,role,idle_timeout_seconds,absolute_timeout_seconds,absolute_expires_at,idle_expires_at,revoked_at,created_at&id=eq.${encodeURIComponent(token.sid)}&limit=1`,
    {
      headers: authHeaders(key),
    },
  );

  const session = lookup.ok ? lookup.data[0] : null;
  if (!session) {
    return json({ success: false, error: "SESSION_NOT_FOUND", message: "Sesion no encontrada" }, 401);
  }

  const now = new Date();
  const absoluteExpiry = new Date(session.absolute_expires_at);
  const idleExpiry = new Date(session.idle_expires_at);

  if (session.revoked_at || now > absoluteExpiry || now > idleExpiry) {
    await revokeSession(supabaseUrl, key, session.id);
    return json({ success: false, error: "SESSION_EXPIRED", message: "Sesion caducada" }, 401);
  }

  const nextIdleExpiry = new Date(Math.min(
    absoluteExpiry.getTime(),
    now.getTime() + session.idle_timeout_seconds * 1000,
  ));

  await fetch(
    `${supabaseUrl}/rest/v1/kiosk_sessions?id=eq.${encodeURIComponent(session.id)}`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders(key),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        last_seen_at: now.toISOString(),
        idle_expires_at: nextIdleExpiry.toISOString(),
      }),
    },
  );

  return {
    session: {
      ...session,
      idle_expires_at: nextIdleExpiry.toISOString(),
    },
    token,
  };
}

export async function revokeSession(supabaseUrl: string, key: string, sessionId: string): Promise<void> {
  await fetch(
    `${supabaseUrl}/rest/v1/kiosk_sessions?id=eq.${encodeURIComponent(sessionId)}`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders(key),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        revoked_at: new Date().toISOString(),
      }),
    },
  );
}

export async function requireOfflineClockToken(req: Request, orgId: string): Promise<OfflineClockTokenPayload | Response> {
  const rawToken = String(req.headers.get("x-kiosk-clock-token") || "").trim();
  if (!rawToken) {
    return json({ success: false, error: "CLOCK_TOKEN_REQUIRED", message: "Credencial offline requerida" }, 401);
  }

  const payload = await verifyOfflineClockToken(rawToken);
  if (!payload) {
    return json({ success: false, error: "CLOCK_TOKEN_INVALID", message: "Credencial offline invalida" }, 401);
  }

  if (payload.scope !== "clock_offline") {
    return json({ success: false, error: "CLOCK_TOKEN_INVALID", message: "Credencial offline invalida" }, 401);
  }

  if (payload.orgId !== orgId) {
    return json({ success: false, error: "CLOCK_TOKEN_FORBIDDEN", message: "Credencial offline fuera de la organizacion activa" }, 403);
  }

  return payload;
}

export async function getRateLimitStatus(
  supabaseUrl: string,
  key: string,
  orgId: string,
  loginType: "admin" | "employee",
  ipAddress: string,
): Promise<{ blockedUntil: string | null; failureCount: number }> {
  const latestBlocked = await fetchJson<Array<{ blocked_until: string | null }>>(
    `${supabaseUrl}/rest/v1/kiosk_auth_attempts?select=blocked_until&organization_id=eq.${orgId}&login_type=eq.${loginType}&ip_address=eq.${encodeURIComponent(ipAddress)}&blocked_until=gte.${encodeURIComponent(new Date().toISOString())}&order=attempted_at.desc&limit=1`,
    { headers: authHeaders(key) },
  );

  const blockedUntil = latestBlocked.ok ? latestBlocked.data[0]?.blocked_until ?? null : null;

  const windowStart = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const failures = await fetchJson<Array<{ id: string }>>(
    `${supabaseUrl}/rest/v1/kiosk_auth_attempts?select=id&organization_id=eq.${orgId}&login_type=eq.${loginType}&ip_address=eq.${encodeURIComponent(ipAddress)}&successful=is.false&attempted_at=gte.${encodeURIComponent(windowStart)}`,
    { headers: authHeaders(key) },
  );

  return {
    blockedUntil,
    failureCount: failures.ok ? failures.data.length : 0,
  };
}

export async function recordAuthAttempt(
  supabaseUrl: string,
  key: string,
  orgId: string,
  loginType: "admin" | "employee",
  ipAddress: string,
  successful: boolean,
  failureCount: number,
  blockedUntil: string | null,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await fetch(`${supabaseUrl}/rest/v1/kiosk_auth_attempts`, {
    method: "POST",
    headers: {
      ...authHeaders(key),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      organization_id: orgId,
      login_type: loginType,
      ip_address: ipAddress,
      successful,
      failure_count: failureCount,
      blocked_until: blockedUntil,
      metadata,
    }),
  });
}

export async function logAudit(
  supabaseUrl: string,
  key: string,
  payload: {
    organizationId: string;
    action: string;
    actorSessionId?: string | null;
    actorRole?: string;
    employeeId?: string | null;
    slotId?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await fetch(`${supabaseUrl}/rest/v1/kiosk_audit_log`, {
    method: "POST",
    headers: {
      ...authHeaders(key),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      organization_id: payload.organizationId,
      actor_session_id: payload.actorSessionId || null,
      actor_role: payload.actorRole || "system",
      employee_id: payload.employeeId || null,
      slot_id: payload.slotId || null,
      action: payload.action,
      metadata: payload.metadata || {},
    }),
  });
}

export async function logDebugEvent(
  supabaseUrl: string,
  key: string,
  payload: {
    organizationId: string;
    actorSessionId?: string | null;
    employeeId?: string | null;
    source: "frontend" | "edge" | "system";
    scope: string;
    action: string;
    outcome?: string;
    message?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await insertDebugRow(supabaseUrl, key, "kiosk_debug_events", {
    organization_id: payload.organizationId,
    actor_session_id: payload.actorSessionId || null,
    employee_id: payload.employeeId || null,
    source: payload.source,
    scope: payload.scope,
    action: payload.action,
    outcome: payload.outcome || "info",
    message: payload.message || "",
    metadata: payload.metadata || {},
  });
}

export async function logScheduleMutationDebug(
  supabaseUrl: string,
  key: string,
  payload: {
    organizationId: string;
    actorSessionId?: string | null;
    actorEmployeeId?: string | null;
    targetEmployeeId?: string | null;
    slotId?: string | null;
    mutationType: "assign" | "reassign" | "release" | "create" | "create_and_assign" | "update" | "delete";
    outcome?: string;
    year?: number | null;
    week?: number | null;
    dayOfWeek?: number | null;
    startTime?: string | null;
    endTime?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await insertDebugRow(supabaseUrl, key, "kiosk_debug_schedule_mutations", {
    organization_id: payload.organizationId,
    actor_session_id: payload.actorSessionId || null,
    actor_employee_id: payload.actorEmployeeId || null,
    target_employee_id: payload.targetEmployeeId || null,
    slot_id: payload.slotId || null,
    mutation_type: payload.mutationType,
    outcome: payload.outcome || "success",
    year: payload.year ?? null,
    week: payload.week ?? null,
    day_of_week: payload.dayOfWeek ?? null,
    start_time: payload.startTime || null,
    end_time: payload.endTime || null,
    metadata: payload.metadata || {},
  });
}

export async function logAttendanceAttemptDebug(
  supabaseUrl: string,
  key: string,
  payload: {
    organizationId: string;
    actorSessionId?: string | null;
    employeeId?: string | null;
    slotId?: string | null;
    action: "status" | "check_in" | "check_out";
    outcome: string;
    clientDate?: string | null;
    scheduledStart?: string | null;
    scheduledEnd?: string | null;
    message?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await insertDebugRow(supabaseUrl, key, "kiosk_debug_attendance_attempts", {
    organization_id: payload.organizationId,
    actor_session_id: payload.actorSessionId || null,
    employee_id: payload.employeeId || null,
    slot_id: payload.slotId || null,
    action: payload.action,
    outcome: payload.outcome,
    client_date: payload.clientDate || null,
    scheduled_start: payload.scheduledStart || null,
    scheduled_end: payload.scheduledEnd || null,
    message: payload.message || "",
    metadata: payload.metadata || {},
  });
}

export async function getAttendanceDayState(
  supabaseUrl: string,
  key: string,
  orgId: string,
  employeeId: string,
  clientDate: string,
  referenceNow = new Date(),
): Promise<AttendanceDayState> {
  const { year, week, dayOfWeek } = isoWeekInfoFromClientDate(clientDate);
  const [attendanceRes, slotsRes] = await Promise.all([
    fetchJson<AttendanceEventRow[]>(
      `${supabaseUrl}/rest/v1/kiosk_attendance?select=id,action,slot_id,recorded_at&employee_id=eq.${employeeId}&client_date=eq.${clientDate}&order=recorded_at.asc,id.asc`,
      { headers: authHeaders(key) },
    ),
    fetchJson<AttendanceSlotRow[]>(
      `${supabaseUrl}/rest/v1/kiosk_schedule_slots?select=id,year,week,day_of_week,start_time,end_time&organization_id=eq.${orgId}&employee_id=eq.${employeeId}&year=eq.${year}&week=eq.${week}&day_of_week=eq.${dayOfWeek}&order=start_time.asc`,
      { headers: authHeaders(key) },
    ),
  ]);

  const todaySlots = slotsRes.ok ? slotsRes.data : [];
  const slotStates: Record<string, AttendanceSlotLifecycle> = {};
  const openSlotOrder: string[] = [];
  let hasCheckOut = false;

  for (const slot of todaySlots) {
    slotStates[slot.id] = "none";
  }

  if (attendanceRes.ok) {
    for (const record of attendanceRes.data) {
      if (record.action === "check_in") {
        if (!record.slot_id) continue;
        slotStates[record.slot_id] = "open";
        pushUnique(openSlotOrder, record.slot_id);
        continue;
      }

      hasCheckOut = true;

      if (!record.slot_id) {
        const lastOpenSlotId = openSlotOrder.pop();
        if (lastOpenSlotId) {
          slotStates[lastOpenSlotId] = "closed";
        }
        continue;
      }

      slotStates[record.slot_id] = "closed";
      removeFromArray(openSlotOrder, record.slot_id);
    }
  }

  const openSlotId = openSlotOrder.length ? openSlotOrder[openSlotOrder.length - 1] : null;
  const status = openSlotId
    ? "checked_in"
    : hasCheckOut && !hasRemainingTodaySlot(todaySlots, slotStates, clientDate, referenceNow)
    ? "checked_out"
    : "not_checked_in";

  return {
    status,
    openSlotId,
    openSlot: openSlotId ? todaySlots.find((slot) => slot.id === openSlotId) ?? null : null,
    todaySlots,
    slotStates,
    hasCheckOut,
  };
}

export async function currentAttendanceStatus(
  supabaseUrl: string,
  key: string,
  orgId: string,
  employeeId: string,
  clientDate: string,
  referenceNow = new Date(),
): Promise<"not_checked_in" | "checked_in" | "checked_out"> {
  const state = await getAttendanceDayState(
    supabaseUrl,
    key,
    orgId,
    employeeId,
    clientDate,
    referenceNow,
  );
  return state.status;
}

const AUTO_CLOSE_DELAY_MIN = 20;

export async function autoCloseStaleCheckIns(
  supabaseUrl: string,
  key: string,
  orgId: string,
  clientDate: string,
): Promise<void> {
  const [checkInsRes, checkOutsRes] = await Promise.all([
    fetchJson<Array<{ id: string; employee_id: string; slot_id: string | null; recorded_at: string; client_date: string }>>(
      `${supabaseUrl}/rest/v1/kiosk_attendance?select=id,employee_id,slot_id,recorded_at,client_date&organization_id=eq.${orgId}&client_date=lte.${clientDate}&action=eq.check_in`,
      { headers: authHeaders(key) },
    ),
    fetchJson<Array<{ employee_id: string; slot_id: string | null; client_date: string }>>(
      `${supabaseUrl}/rest/v1/kiosk_attendance?select=employee_id,slot_id,client_date&organization_id=eq.${orgId}&client_date=lte.${clientDate}&action=eq.check_out`,
      { headers: authHeaders(key) },
    ),
  ]);

  if (!checkInsRes.ok || checkInsRes.data.length === 0) return;

  const checkedOutSet = new Set(
    checkOutsRes.ok
      ? checkOutsRes.data
        .filter((record) => !!record.slot_id)
        .map((record) => `${record.client_date}:${record.employee_id}:${record.slot_id}`)
      : [],
  );

  const now = new Date();

  for (const record of checkInsRes.data) {
    if (!record.slot_id) continue;
    if (checkedOutSet.has(`${record.client_date}:${record.employee_id}:${record.slot_id}`)) continue;

    const slotRes = await fetchJson<Array<{ end_time: string }>>(
      `${supabaseUrl}/rest/v1/kiosk_schedule_slots?select=end_time&id=eq.${record.slot_id}&limit=1`,
      { headers: authHeaders(key) },
    );

    const slot = slotRes.ok ? slotRes.data[0] : null;
    if (!slot) continue;

    const slotEnd = buildMadridDateTime(record.client_date, slot.end_time);
    const autoCloseThreshold = new Date(slotEnd.getTime() + AUTO_CLOSE_DELAY_MIN * 60000);

    if (now >= autoCloseThreshold) {
      await fetchJson<Array<{ id: string }>>(
        `${supabaseUrl}/rest/v1/kiosk_attendance`,
        {
          method: "POST",
          headers: {
            ...authHeaders(key),
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify({
            organization_id: orgId,
            employee_id: record.employee_id,
            slot_id: record.slot_id,
            action: "check_out",
            client_date: record.client_date,
            recorded_at: slotEnd.toISOString(),
          }),
        },
      );

      await logAudit(supabaseUrl, key, {
        organizationId: orgId,
        actorRole: "system",
        employeeId: record.employee_id,
        slotId: record.slot_id,
        action: "attendance_auto_close",
        metadata: { slotEndTime: slot.end_time, autoCloseDelayMin: AUTO_CLOSE_DELAY_MIN },
      });
    }
  }
}

export async function fetchJson<T>(url: string, init: RequestInit): Promise<RestResponse<T>> {
  const raw = await fetch(url, init);
  let data = null as T;

  try {
    data = await raw.json() as T;
  } catch {
    data = null as T;
  }

  return {
    ok: raw.ok,
    data,
    raw,
  };
}

async function insertDebugRow(
  supabaseUrl: string,
  key: string,
  table: string,
  row: Record<string, unknown>,
): Promise<void> {
  try {
    await fetch(`${supabaseUrl}/rest/v1/${table}`, {
      method: "POST",
      headers: {
        ...authHeaders(key),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(row),
    });
  } catch (error) {
    console.warn(`debug insert failed for ${table}:`, error);
  }
}

export async function logUnhandledEdgeError(
  supabaseUrl: string,
  key: string,
  functionName: string,
  error: unknown,
  extra?: { organizationId?: string | null; requestMethod?: string; requestUrl?: string; metadata?: Record<string, unknown> },
): Promise<void> {
  if (!supabaseUrl || !key) return;
  const err = error instanceof Error ? error : new Error(String(error));
  await insertDebugRow(supabaseUrl, key, "kiosk_edge_errors", {
    function_name: functionName,
    organization_id: extra?.organizationId ?? null,
    error_message: err.message,
    error_stack: err.stack ?? null,
    request_method: extra?.requestMethod ?? null,
    request_url: extra?.requestUrl ?? null,
    metadata: extra?.metadata ?? {},
  });
}

export function isoWeekToDate(year: number, week: number, dayOfWeek: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Dow = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Dow - 1));
  const result = new Date(week1Monday);
  result.setUTCDate(week1Monday.getUTCDate() + ((week - 1) * 7) + (dayOfWeek - 1));
  return result;
}

export function slotFallsInMonth(
  slotYear: number,
  week: number,
  dayOfWeek: number,
  targetYear: number,
  targetMonth: number,
): boolean {
  const date = isoWeekToDate(slotYear, week, dayOfWeek);
  return date.getUTCFullYear() === targetYear && (date.getUTCMonth() + 1) === targetMonth;
}

export function slotHours(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  return ((eh * 60 + em) - (sh * 60 + sm)) / 60;
}

export function computeWorkedMinutes(slotDate: Date, startTime: string, endTime: string, checkInIso: string): number {
  const slotDateIso = toUtcDateIso(slotDate);
  const slotStart = buildMadridDateTime(slotDateIso, startTime);
  const slotEnd = buildMadridDateTime(slotDateIso, endTime);

  const checkIn = new Date(checkInIso);
  const effectiveStart = new Date(Math.max(slotStart.getTime(), checkIn.getTime()));
  const effectiveEnd = slotEnd;

  if (effectiveStart >= effectiveEnd) return 0;
  return Math.round((effectiveEnd.getTime() - effectiveStart.getTime()) / 60000);
}

export function isoWeekInfoFromClientDate(clientDate: string): { year: number; week: number; dayOfWeek: number; date: Date } {
  const [year, month, day] = clientDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, (month || 1) - 1, day || 1));
  const dayValue = date.getUTCDay();
  const dayOfWeek = dayValue === 0 ? 7 : dayValue;
  const anchor = new Date(date);
  anchor.setUTCHours(0, 0, 0, 0);
  anchor.setUTCDate(anchor.getUTCDate() + 3 - (anchor.getUTCDay() + 6) % 7);
  const yearStart = new Date(Date.UTC(anchor.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(
    ((anchor.getTime() - yearStart.getTime()) / 86400000 - 3 + (yearStart.getUTCDay() + 6) % 7) / 7,
  );

  return {
    year: anchor.getUTCFullYear(),
    week,
    dayOfWeek,
    date,
  };
}

function hasRemainingTodaySlot(
  slots: AttendanceSlotRow[],
  slotStates: Record<string, AttendanceSlotLifecycle>,
  clientDate: string,
  referenceNow: Date,
): boolean {
  for (const slot of slots) {
    if (slotStates[slot.id] === "closed") continue;
    if (referenceNow <= buildMadridDateTime(clientDate, slot.end_time)) {
      return true;
    }
  }

  return false;
}

export function madridDateIso(reference = new Date()): string {
  const parts = getMadridDateTimeParts(reference);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function buildMadridDateTime(clientDate: string, timeValue: string): Date {
  const target = parseCivilDateTime(clientDate, timeValue);
  let candidate = new Date(Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
    target.second,
    0,
  ));

  for (let i = 0; i < 4; i++) {
    const resolved = getMadridDateTimeParts(candidate);
    const diffMs = civilPartsToEpochMs(target) - civilPartsToEpochMs(resolved);
    if (diffMs === 0) {
      break;
    }
    candidate = new Date(candidate.getTime() + diffMs);
  }

  return candidate;
}

function parseCivilDateTime(clientDate: string, timeValue: string): CivilDateTimeParts {
  const [year, month, day] = clientDate.split("-").map(Number);
  const [hours, minutes, seconds] = String(timeValue || "00:00:00").split(":").map(Number);

  return {
    year,
    month: month || 1,
    day: day || 1,
    hour: hours || 0,
    minute: minutes || 0,
    second: seconds || 0,
  };
}

function getMadridDateTimeParts(reference: Date): CivilDateTimeParts {
  const parts = MADRID_DATE_TIME_FORMATTER.formatToParts(reference);
  const values: Partial<CivilDateTimeParts> = {};

  for (const part of parts) {
    if (part.type === "year") values.year = Number(part.value);
    if (part.type === "month") values.month = Number(part.value);
    if (part.type === "day") values.day = Number(part.value);
    if (part.type === "hour") values.hour = Number(part.value);
    if (part.type === "minute") values.minute = Number(part.value);
    if (part.type === "second") values.second = Number(part.value);
  }

  return {
    year: values.year || 0,
    month: values.month || 1,
    day: values.day || 1,
    hour: values.hour || 0,
    minute: values.minute || 0,
    second: values.second || 0,
  };
}

function civilPartsToEpochMs(value: CivilDateTimeParts): number {
  return Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute, value.second, 0);
}

function toUtcDateIso(date: Date): string {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function pushUnique(collection: string[], value: string): void {
  if (!collection.includes(value)) {
    collection.push(value);
  }
}

function removeFromArray(collection: string[], value: string): void {
  const index = collection.indexOf(value);
  if (index >= 0) {
    collection.splice(index, 1);
  }
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function signSessionToken(payload: SessionTokenPayload): Promise<string> {
  return await signStructuredToken("kst1", payload);
}

async function verifySessionToken(token: string): Promise<SessionTokenPayload | null> {
  const payload = await verifyStructuredToken(token, "kst1");
  if (!payload) return null;

  return payload as SessionTokenPayload;
}

async function signOfflineClockToken(payload: OfflineClockTokenPayload): Promise<string> {
  return await signStructuredToken("kct1", payload);
}

async function verifyOfflineClockToken(token: string): Promise<OfflineClockTokenPayload | null> {
  const payload = await verifyStructuredToken(token, "kct1");
  if (!payload) return null;

  return payload as OfflineClockTokenPayload;
}

async function signStructuredToken(prefix: string, payload: { ver: 1 }): Promise<string> {
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const secret = await importHmacKey(getSessionSecret());
  const signature = await crypto.subtle.sign("HMAC", secret, new TextEncoder().encode(payloadB64));
  return `${prefix}.${payloadB64}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
}

async function verifyStructuredToken(token: string, prefix: string): Promise<{ ver: 1; exp: number } | null> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== prefix) return null;

  const payloadB64 = parts[1];
  const signatureB64 = parts[2];
  const secret = await importHmacKey(getSessionSecret());
  const expected = new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    secret,
    new TextEncoder().encode(payloadB64),
  ));
  const received = base64UrlDecodeBytes(signatureB64);
  if (!timingSafeEqual(expected, received)) return null;

  const payload = JSON.parse(base64UrlDecode(payloadB64)) as { ver: 1; exp: number };
  if (payload.ver !== 1) return null;
  if (payload.exp * 1000 < Date.now()) return null;
  return payload;
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  return await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export function base64UrlEncode(value: string): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

export function base64UrlEncodeBytes(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

export function base64UrlDecode(value: string): string {
  return new TextDecoder().decode(base64UrlDecodeBytes(value));
}

function base64UrlDecodeBytes(value: string): Uint8Array {
  const normalized = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index++) {
    diff |= a[index] ^ b[index];
  }
  return diff === 0;
}

// ─── Shared crypto / JWT utilities ──────────────────────────────────────────

export async function computeSha256(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function signHmac(input: string): Promise<string> {
  const secret = getSessionSecret();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(input));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

// ─── Generic verification tokens (JWT-like, scope-gated) ───────────────────

export interface VerificationTokenPayload {
  scope: string;
  orgId: string;
  employeeId: string;
  iat: number;
  exp: number;
  ver: 1;
  [key: string]: unknown;
}

export async function signVerificationToken(
  payload: VerificationTokenPayload,
): Promise<string> {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = await signHmac(`${encodedHeader}.${encodedPayload}`);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export async function verifyVerificationToken(
  token: string,
  expectedScope: string,
): Promise<VerificationTokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = await signHmac(`${encodedHeader}.${encodedPayload}`);
  if (signature !== expectedSignature) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as VerificationTokenPayload;
    const now = Math.floor(Date.now() / 1000);

    if (payload.scope !== expectedScope) return null;
    if (payload.ver !== 1) return null;
    if (typeof payload.exp !== "number" || payload.exp <= now) return null;
    if (typeof payload.iat !== "number" || payload.iat > now + 30) return null;
    return payload;
  } catch (_error) {
    return null;
  }
}
