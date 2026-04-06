import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  initCors,
  getClientIp,
  getSessionSecret,
  getSupabaseConfig,
  getUserAgent,
  getRateLimitStatus,
  issueSession,
  json,
  logAudit,
  logUnhandledEdgeError,
  recordAuthAttempt,
  resolveEmployeeByPin,
  resolveOrgId,
  verifyAdminPin,
} from "../_shared/kiosk.ts";

const PIN_REGEX = /^[0-9]{4,8}$/;
const ADMIN_IDLE_TIMEOUT_SECONDS = 5 * 60;
const ADMIN_ABSOLUTE_TIMEOUT_SECONDS = 15 * 60;
const ADMIN_FAILURE_LIMIT = 5;
const ADMIN_BLOCK_MINUTES = 15;

interface VerifyBody {
  orgSlug?: string;
  organizationId?: string;
  pin?: string;
}

Deno.serve(async (req: Request): Promise<Response> => {
  initCors(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ success: false, error: "METHOD_NOT_ALLOWED", message: "Metodo no permitido" }, 405);
  }

  let errUrl = "";
  let errKey = "";
  try {
    getSessionSecret();
    const body = await req.json() as VerifyBody;
    const pin = String(body.pin || "").trim();
    const orgSlug = String(body.orgSlug || "").trim();
    const organizationId = String(body.organizationId || "").trim();

    if (!PIN_REGEX.test(pin)) {
      return json({
        success: false,
        error: "PIN_INVALID",
        message: "El PIN debe tener entre 4 y 8 digitos numericos",
      }, 400);
    }

    if (!orgSlug && !organizationId) {
      return json({
        success: false,
        error: "ORG_REQUIRED",
        message: "Falta la organizacion",
      }, 400);
    }

    const { url, serviceRoleKey } = getSupabaseConfig();
    errUrl = url; errKey = serviceRoleKey;
    const resolvedOrganizationId = organizationId || await resolveOrgId(url, serviceRoleKey, orgSlug);
    if (!resolvedOrganizationId) {
      return json({
        success: false,
        error: "ORG_NOT_FOUND",
        message: "Organizacion no encontrada",
      }, 404);
    }

    const ipAddress = getClientIp(req);
    const userAgent = getUserAgent(req);
    const limiter = await getRateLimitStatus(url, serviceRoleKey, resolvedOrganizationId, "admin", ipAddress);

    if (limiter.blockedUntil) {
      return json({
        success: false,
        error: "TOO_MANY_ATTEMPTS",
        message: "Demasiados intentos. Espera unos minutos antes de volver a probar.",
        retryAt: limiter.blockedUntil,
      }, 429);
    }

    const isValid = await verifyAdminPin(url, serviceRoleKey, resolvedOrganizationId, pin);

    // Fallback: check employee admins if org PIN did not match
    if (!isValid) {
      const adminEmployee = await resolveEmployeeByPin(url, serviceRoleKey, resolvedOrganizationId, pin);

      if (adminEmployee && adminEmployee.role === "admin") {
        const issued = await issueSession(url, serviceRoleKey, {
          organizationId: resolvedOrganizationId,
          role: "org_admin",
          employeeId: adminEmployee.id,
          idleTimeoutSeconds: ADMIN_IDLE_TIMEOUT_SECONDS,
          absoluteTimeoutSeconds: ADMIN_ABSOLUTE_TIMEOUT_SECONDS,
          ipAddress,
          userAgent,
        });

        await recordAuthAttempt(url, serviceRoleKey, resolvedOrganizationId, "admin", ipAddress, true, 0, null);
        await logAudit(url, serviceRoleKey, {
          organizationId: resolvedOrganizationId,
          actorSessionId: issued.session.id,
          actorRole: "org_admin",
          action: "admin_login_success",
          metadata: { ipAddress, employeeId: adminEmployee.id },
        });

        return json({
          success: true,
          data: {
            accessToken: issued.accessToken,
            expiresAt: issued.expiresAt,
            role: "org_admin",
            employeeId: adminEmployee.id,
            employeeName: `${adminEmployee.nombre} ${adminEmployee.apellido}`.trim(),
            currentStatus: "unlocked",
            organizationId: resolvedOrganizationId,
          },
        });
      }

      const nextFailureCount = limiter.failureCount + 1;
      const blockedUntil = nextFailureCount >= ADMIN_FAILURE_LIMIT
        ? new Date(Date.now() + ADMIN_BLOCK_MINUTES * 60 * 1000).toISOString()
        : null;

      await recordAuthAttempt(
        url,
        serviceRoleKey,
        resolvedOrganizationId,
        "admin",
        ipAddress,
        false,
        nextFailureCount,
        blockedUntil,
      );

      await logAudit(url, serviceRoleKey, {
        organizationId: resolvedOrganizationId,
        action: "admin_login_failed",
        actorRole: "system",
        metadata: { ipAddress, blockedUntil },
      });

      return json({
        success: false,
        error: "INVALID_PIN",
        message: "PIN incorrecto",
      }, 401);
    }

    const issued = await issueSession(url, serviceRoleKey, {
      organizationId: resolvedOrganizationId,
      role: "org_admin",
      employeeId: null,
      idleTimeoutSeconds: ADMIN_IDLE_TIMEOUT_SECONDS,
      absoluteTimeoutSeconds: ADMIN_ABSOLUTE_TIMEOUT_SECONDS,
      ipAddress,
      userAgent,
    });

    await recordAuthAttempt(url, serviceRoleKey, resolvedOrganizationId, "admin", ipAddress, true, 0, null);
    await logAudit(url, serviceRoleKey, {
      organizationId: resolvedOrganizationId,
      actorSessionId: issued.session.id,
      actorRole: "org_admin",
      action: "admin_login_success",
      metadata: { ipAddress },
    });

    return json({
      success: true,
      data: {
        accessToken: issued.accessToken,
        expiresAt: issued.expiresAt,
        role: "org_admin",
        employeeId: null,
        employeeName: "Ajustes",
        currentStatus: "unlocked",
        organizationId: resolvedOrganizationId,
      },
    });
  } catch (error) {
    await logUnhandledEdgeError(errUrl, errKey, "kiosk-admin-verify", error, { requestMethod: req.method });
    console.error("kiosk-admin-verify exception", error);
    return json({
      success: false,
      error: "INTERNAL_ERROR",
      message: "Error interno al validar el PIN",
    }, 500);
  }
});
