import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  authHeaders,
  corsHeaders,
  createPinLookupHash,
  getSessionSecret,
  getSupabaseConfig,
  hashPin,
  initCors,
  json,
  logAudit,
  logUnhandledEdgeError,
  requireSession,
} from "../_shared/kiosk.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  initCors(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ success: false, error: "METHOD_NOT_ALLOWED" }, 405);
  }

  let errUrl = "";
  let errKey = "";

  try {
    getSessionSecret();

    const { url, serviceRoleKey } = getSupabaseConfig();
    errUrl = url;
    errKey = serviceRoleKey;

    const auth = await requireSession(req, url, serviceRoleKey, ["org_admin"]);
    if (auth instanceof Response) return auth;

    const orgId = auth.session.organization_id;

    const query =
      `${url}/rest/v1/kiosk_employees?select=id,pin,organization_id` +
      `&organization_id=eq.${orgId}&pin=not.is.null&pin_hash=is.null&limit=500`;

    const res = await fetch(query, { headers: authHeaders(serviceRoleKey) });
    if (!res.ok) {
      return json({ success: false, error: "QUERY_FAILED", message: "No se pudo consultar empleados" }, 500);
    }

    const rows = (await res.json()) as Array<{
      id: string;
      pin: string;
      organization_id: string;
    }>;

    let migrated = 0;
    let failed = 0;

    for (const row of rows) {
      try {
        const pinHash = await hashPin(row.pin);
        const pinLookupHash = await createPinLookupHash(row.organization_id, row.pin);

        const patchUrl =
          `${url}/rest/v1/kiosk_employees?id=eq.${encodeURIComponent(row.id)}&organization_id=eq.${orgId}`;

        const patchRes = await fetch(patchUrl, {
          method: "PATCH",
          headers: {
            ...authHeaders(serviceRoleKey),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            pin_hash: pinHash,
            pin_lookup_hash: pinLookupHash,
            pin_algorithm: "argon2id",
            pin_migrated_at: new Date().toISOString(),
            pin: null,
          }),
        });

        if (patchRes.ok) {
          migrated++;
        } else {
          failed++;
        }
      } catch {
        failed++;
      }
    }

    await logAudit(url, serviceRoleKey, {
      organizationId: orgId,
      actorSessionId: auth.session.id,
      actorRole: auth.token.role,
      action: "batch_pin_migration",
      metadata: { total: rows.length, migrated, failed },
    });

    return json({ success: true, total: rows.length, migrated, failed });
  } catch (error) {
    if (errUrl && errKey) {
      await logUnhandledEdgeError(errUrl, errKey, "kiosk-pin-migrate", error, {
        requestMethod: req.method,
        requestUrl: req.url,
      });
    }
    return json({ success: false, error: "INTERNAL_ERROR", message: "Error interno" }, 500);
  }
});
