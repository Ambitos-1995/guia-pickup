import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const PIN_REGEX = /^[0-9]{4,8}$/;

interface VerifyBody {
  orgSlug?: string;
  organizationId?: string;
  pin?: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(
      { success: false, error: "Method not allowed" },
      405,
    );
  }

  try {
    const body = await req.json() as VerifyBody;
    const pin = String(body.pin || "").trim();
    const orgSlug = String(body.orgSlug || "").trim();
    const organizationId = String(body.organizationId || "").trim();

    if (!PIN_REGEX.test(pin)) {
      return json(
        {
          success: false,
          error: "PIN_INVALID",
          message: "El PIN debe tener entre 4 y 8 digitos numericos",
        },
        400,
      );
    }

    if (!orgSlug && !organizationId) {
      return json(
        {
          success: false,
          error: "ORG_REQUIRED",
          message: "Falta la organizacion",
        },
        400,
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return json(
        {
          success: false,
          error: "CONFIG_ERROR",
          message: "Faltan credenciales de Supabase",
        },
        500,
      );
    }

    let resolvedOrganizationId = organizationId;
    let resolvedOrgSlug = orgSlug;

    if (!resolvedOrganizationId) {
      const orgResponse = await fetch(
        `${supabaseUrl}/rest/v1/organizations?select=id,slug&slug=eq.${encodeURIComponent(resolvedOrgSlug)}&limit=1`,
        {
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            apikey: serviceRoleKey,
          },
        },
      );

      if (!orgResponse.ok) {
        const details = await orgResponse.text();
        console.error("organization lookup failed", details);
        return json(
          {
            success: false,
            error: "ORG_LOOKUP_FAILED",
            message: "No se ha podido validar la organizacion",
            details,
          },
          500,
        );
      }

      const organizations = await orgResponse.json() as Array<{ id: string; slug: string }>;
      const organization = organizations[0];

      if (!organization) {
        return json(
          {
            success: false,
            error: "ORG_NOT_FOUND",
            message: "Organizacion no encontrada",
          },
          404,
        );
      }

      resolvedOrganizationId = organization.id;
      resolvedOrgSlug = organization.slug;
    }

    const verifyResponse = await fetch(
      `${supabaseUrl}/rest/v1/rpc/verify_organization_super_admin_pin`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_organization_id: resolvedOrganizationId,
          p_pin: pin,
        }),
      },
    );

    if (!verifyResponse.ok) {
      const details = await verifyResponse.text();
      console.error("super admin pin verify failed", details);
      return json(
        {
          success: false,
          error: "VERIFY_FAILED",
          message: "No se ha podido validar el PIN",
          details,
        },
        500,
      );
    }

    const isValid = await verifyResponse.json();

    if (!isValid) {
      return json(
        {
          success: false,
          error: "INVALID_PIN",
          message: "PIN incorrecto",
        },
        401,
      );
    }

    return json({
      success: true,
      data: {
        role: "org_admin",
        employeeName: "Ajustes",
        employeeCode: "SUPER_ADMIN",
        employeeProfileId: null,
        userId: null,
        photoUrl: null,
        currentStatus: "unlocked",
        organizationId: resolvedOrganizationId,
        orgSlug: resolvedOrgSlug,
      },
    });
  } catch (error) {
    console.error("kiosk-admin-verify exception", error);
    return json(
      {
        success: false,
        error: "INTERNAL_ERROR",
        message: "Error interno al validar el PIN",
        details: error instanceof Error ? error.message : String(error),
      },
      500,
    );
  }
});

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders,
  });
}
