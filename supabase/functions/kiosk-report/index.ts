import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  authHeaders,
  corsHeaders,
  getSupabaseConfig,
  json,
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

// Cache org slug → id so repeated reports don't each make a DB roundtrip
const orgIdCache: Record<string, string> = {};

async function resolveOrgIdCached(url: string, key: string, orgSlug: string): Promise<string | null> {
  if (orgIdCache[orgSlug]) return orgIdCache[orgSlug];
  const id = await resolveOrgId(url, key, orgSlug);
  if (id) orgIdCache[orgSlug] = id;
  return id;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ success: false, message: "Metodo no permitido" }, 405);
  }

  try {
    const body = await req.json() as ReportBody;
    const orgSlug = String(body.orgSlug || "").trim();
    const route = String(body.route || "").trim().slice(0, 512);
    const appVersion = String(body.appVersion || "").trim().slice(0, 64);
    const deviceLabel = String(body.deviceLabel || "").trim().slice(0, 256);
    const reportType = String(body.reportType || "client_report").trim().slice(0, 64);
    const payload = body.payload && typeof body.payload === "object" ? body.payload : {};

    const { url, serviceRoleKey } = getSupabaseConfig();

    const organizationId = orgSlug ? await resolveOrgIdCached(url, serviceRoleKey, orgSlug) : null;

    await fetch(`${url}/rest/v1/kiosk_debug_client_reports`, {
      method: "POST",
      headers: {
        ...authHeaders(serviceRoleKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        organization_id: organizationId,
        route,
        app_version: appVersion,
        device_label: deviceLabel,
        report_type: reportType,
        payload,
      }),
    });

    return json({ success: true });
  } catch (error) {
    console.error("[kiosk-report] error:", error);
    return json({ success: false }, 500);
  }
});
