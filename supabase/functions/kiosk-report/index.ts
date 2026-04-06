import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  authHeaders,
  corsHeaders,
  initCors,
  getSupabaseConfig,
  json,
  logUnhandledEdgeError,
  requireSession,
  resolveOrgId,
} from "../_shared/kiosk.ts";

interface ReportBody {
  orgSlug?: string;
  route?: string;
  appVersion?: string;
  deviceLabel?: string;
  reportType?: string;
  payload?: Record<string, unknown>;
}

const MAX_PAYLOAD_BYTES = 4096;
const MAX_STRING_LENGTH = 1024;
const MAX_OBJECT_KEYS = 20;

// Cache org slug → id so repeated reports don't each make a DB roundtrip
const orgIdCache: Record<string, string> = {};

async function resolveOrgIdCached(url: string, key: string, orgSlug: string): Promise<string | null> {
  if (orgIdCache[orgSlug]) return orgIdCache[orgSlug];
  const id = await resolveOrgId(url, key, orgSlug);
  if (id) orgIdCache[orgSlug] = id;
  return id;
}

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
    const body = await req.json() as ReportBody;
    const orgSlug = String(body.orgSlug || "").trim();
    const route = String(body.route || "").trim().slice(0, 512);
    const appVersion = String(body.appVersion || "").trim().slice(0, 64);
    const deviceLabel = String(body.deviceLabel || "").trim().slice(0, 256);
    const reportType = String(body.reportType || "client_report").trim().slice(0, 64);
    const payload = normalizePayload(body.payload);

    const { url, serviceRoleKey } = getSupabaseConfig();
    errUrl = url;
    errKey = serviceRoleKey;
    const auth = await requireSession(req, url, serviceRoleKey, ["respondent", "org_admin"]);
    if (auth instanceof Response) {
      return auth;
    }

    const organizationId = orgSlug ? await resolveOrgIdCached(url, serviceRoleKey, orgSlug) : null;
    if (!organizationId || auth.session.organization_id !== organizationId) {
      return json({ success: false, message: "Sesion fuera de la organizacion activa" }, 403);
    }

    await fetch(`${url}/rest/v1/kiosk_debug_client_reports`, {
      method: "POST",
      headers: {
        ...authHeaders(serviceRoleKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organization_id: organizationId,
        actor_session_id: auth.session.id,
        employee_id: auth.session.employee_id,
        route,
        app_version: appVersion,
        device_label: deviceLabel,
        report_type: reportType,
        payload,
      }),
    });

    return json({ success: true });
  } catch (error) {
    await logUnhandledEdgeError(errUrl, errKey, "kiosk-report", error, { requestMethod: req.method });
    console.error("[kiosk-report] error:", error);
    return json({ success: false, message: "Error interno" }, 500);
  }
});

function normalizePayload(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const entries = Object.entries(value as Record<string, unknown>).slice(0, MAX_OBJECT_KEYS);
  const normalized: Record<string, unknown> = {};

  for (const [key, entry] of entries) {
    normalized[key] = normalizeEntry(entry);
  }

  const serialized = JSON.stringify(normalized);
  if (serialized.length <= MAX_PAYLOAD_BYTES) {
    return normalized;
  }

  return {
    message: typeof normalized.message === "string"
      ? normalized.message.slice(0, MAX_STRING_LENGTH)
      : "Payload truncado",
    source: typeof normalized.source === "string" ? normalized.source.slice(0, 256) : null,
    payload_truncated: true,
    original_size: serialized.length,
  };
}

function normalizeEntry(value: unknown): unknown {
  if (typeof value === "string") return value.slice(0, MAX_STRING_LENGTH);
  if (typeof value === "number" || typeof value === "boolean" || value === null) return value;
  if (Array.isArray(value)) {
    return value.slice(0, 10).map((entry) => normalizeEntry(entry));
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>).slice(0, 10)) {
      result[key] = normalizeEntry(entry);
    }
    return result;
  }

  return String(value);
}
