import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

import {
  authHeaders,
  base64UrlDecode,
  base64UrlEncode,
  base64UrlEncodeBytes,
  computeSha256,
  corsHeaders,
  fetchJson,
  getClientIp,
  getRateLimitStatus,
  getSessionSecret,
  getSupabaseConfig,
  getUserAgent,
  json,
  logAudit,
  logUnhandledEdgeError,
  recordAuthAttempt,
  requireSession,
  resolveEmployeeByPin,
  resolveOrgId,
  signHmac,
  signVerificationToken,
  verifyVerificationToken,
} from "../_shared/kiosk.ts";

const PARTICIPANT_PIN_REGEX = /^[0-9]{4,6}$/;
const PARTICIPANT_FAILURE_LIMIT = 8;
const PARTICIPANT_BLOCK_MINUTES = 10;
const PARTICIPANT_TOKEN_TTL_SECONDS = 10 * 60;

interface RequestBody {
  action?: string;
  orgSlug?: string;
  contractId?: string;
  employeeId?: string;
  activityDescription?: string;
  schedule?: string;
  validityText?: string;
  representativeName?: string;
  title?: string;
  pin?: string;
  verificationToken?: string;
  participantSignImg?: string;
  adminSignImg?: string;
}

interface ContractRow {
  id: string;
  organization_id: string;
  employee_id: string;
  title: string;
  activity_description: string;
  schedule: string;
  validity_text: string;
  representative_name: string;
  status: string;
  participant_sign_url: string | null;
  participant_verified_at: string | null;
  participant_signed_at: string | null;
  admin_sign_url: string | null;
  admin_signed_at: string | null;
  admin_employee_id: string | null;
  document_hash: string | null;
  document_storage_path: string | null;
  document_snapshot_json: Record<string, unknown> | null;
  employee_pin_verified: boolean | null;
  created_at?: string;
  kiosk_employees?: { nombre: string; apellido: string } | null;
}


Deno.serve(async (req: Request): Promise<Response> => {
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

    const auth = await requireSession(req, url, serviceRoleKey, ["org_admin"]);
    if (auth instanceof Response) return auth;
    if (auth.session.organization_id !== orgId) {
      return json({ success: false, message: "Sesion fuera de la organizacion activa" }, 403);
    }

    if (action === "create") {
      return await handleCreate(url, serviceRoleKey, orgId, body, auth.session.id, auth.session.employee_id);
    }

    if (action === "get") {
      return await handleGet(url, serviceRoleKey, orgId, body);
    }

    if (action === "list-all") {
      return await handleListAll(url, serviceRoleKey, orgId);
    }

    if (action === "list") {
      return await handleListByEmployee(url, serviceRoleKey, orgId, body);
    }

    if (action === "verify-participant") {
      return await handleVerifyParticipant(req, url, serviceRoleKey, orgId, body, auth.session.id);
    }

    if (action === "participant-sign") {
      return await handleParticipantSign(url, serviceRoleKey, orgId, body, auth.session.id);
    }

    if (action === "admin-sign") {
      return await handleAdminSign(url, serviceRoleKey, orgId, body, auth.session.id, auth.session.employee_id);
    }

    if (action === "get-pdf-data") {
      return await handleGetPdfData(url, serviceRoleKey, orgId, body);
    }

    return json({ success: false, message: `Accion desconocida: ${action}` }, 400);
  } catch (err) {
    await logUnhandledEdgeError(errUrl, errKey, "kiosk-contract", err, { requestMethod: req.method });
    console.error("[kiosk-contract] Unexpected error:", err);
    return json({ success: false, message: "Error interno del servidor" }, 500);
  }
});

async function handleCreate(
  url: string,
  key: string,
  orgId: string,
  body: RequestBody,
  actorSessionId: string,
  createdByEmployeeId: string | null,
): Promise<Response> {
  const employeeId = String(body.employeeId || "").trim();
  if (!employeeId) return json({ success: false, message: "Falta employeeId" }, 400);
  if (!body.activityDescription) return json({ success: false, message: "Falta activityDescription" }, 400);
  if (!body.representativeName) return json({ success: false, message: "Falta representativeName" }, 400);

  const payload = {
    organization_id: orgId,
    employee_id: employeeId,
    title: body.title || "Acuerdo de Participacion en Actividad Ocupacional",
    activity_description: body.activityDescription,
    schedule: body.schedule || "Segun turnos asignados semanalmente",
    validity_text: body.validityText || "3 meses, renovable",
    representative_name: body.representativeName,
    status: "pending_participant",
  };

  const res = await fetchJson<{ id: string }[]>(
    `${url}/rest/v1/kiosk_contracts?select=id`,
    {
      method: "POST",
      headers: {
        ...authHeaders(key),
        "Content-Type": "application/json",
        "Prefer": "return=representation",
      },
      body: JSON.stringify(payload),
    },
  );

  if (!res.ok || !res.data?.[0]?.id) {
    console.error("[kiosk-contract] create error:", res.data);
    return json({ success: false, message: "Error al crear el acuerdo" }, 500);
  }

  const contractId = res.data[0].id;

  await logAudit(url, key, {
    organizationId: orgId,
    actorSessionId,
    actorRole: "org_admin",
    employeeId,
    action: "contract_created",
    metadata: {
      contract_id: contractId,
      created_by_employee_id: createdByEmployeeId,
      target_employee_id: employeeId,
    },
  });

  return json({ success: true, contractId, status: "pending_participant" });
}

async function handleGet(
  url: string,
  key: string,
  orgId: string,
  body: RequestBody,
): Promise<Response> {
  const contractId = String(body.contractId || "").trim();
  if (!contractId) return json({ success: false, message: "Falta contractId" }, 400);

  const contract = await fetchContract(url, key, orgId, contractId, true);
  if (!contract) {
    return json({ success: false, message: "Acuerdo no encontrado" }, 404);
  }

  const employee = contract.kiosk_employees;
  return json({
    success: true,
    data: {
      id: contract.id,
      title: contract.title,
      activity_description: contract.activity_description,
      schedule: contract.schedule,
      validity_text: contract.validity_text,
      representative_name: contract.representative_name,
      status: contract.status,
      employee_id: contract.employee_id,
      employee_name: employee ? `${employee.nombre} ${employee.apellido}`.trim() : "",
      participant_pin_verified: !!contract.employee_pin_verified,
      participant_verified_at: contract.participant_verified_at,
      participant_signed_at: contract.participant_signed_at,
      admin_signed_at: contract.admin_signed_at,
      document_storage_path: contract.document_storage_path,
    },
  });
}

async function handleListAll(
  url: string,
  key: string,
  orgId: string,
): Promise<Response> {
  const res = await fetchJson<ContractRow[]>(
    `${url}/rest/v1/kiosk_contracts?organization_id=eq.${encodeURIComponent(orgId)}&select=id,title,status,created_at,participant_verified_at,participant_signed_at,admin_signed_at,employee_id,employee_pin_verified,kiosk_employees(nombre,apellido)&order=created_at.desc`,
    { headers: authHeaders(key) },
  );

  if (!res.ok) {
    return json({ success: false, message: "Error al obtener acuerdos" }, 500);
  }

  const contracts = (res.data || []).map((contract) => {
    const employee = contract.kiosk_employees;
    return {
      id: contract.id,
      title: contract.title,
      status: contract.status,
      created_at: contract.created_at || null,
      participant_verified_at: contract.participant_verified_at,
      participant_signed_at: contract.participant_signed_at,
      admin_signed_at: contract.admin_signed_at,
      participant_pin_verified: !!contract.employee_pin_verified,
      employee_id: contract.employee_id,
      employee_name: employee ? `${employee.nombre} ${employee.apellido}`.trim() : "",
    };
  });

  return json({ success: true, contracts });
}

async function handleListByEmployee(
  url: string,
  key: string,
  orgId: string,
  body: RequestBody,
): Promise<Response> {
  const employeeId = String(body.employeeId || "").trim();
  if (!employeeId) return json({ success: false, message: "Falta employeeId" }, 400);

  const res = await fetchJson<ContractRow[]>(
    `${url}/rest/v1/kiosk_contracts?organization_id=eq.${encodeURIComponent(orgId)}&employee_id=eq.${encodeURIComponent(employeeId)}&select=id,title,status,created_at,participant_verified_at,participant_signed_at,admin_signed_at,employee_pin_verified&order=created_at.desc`,
    { headers: authHeaders(key) },
  );

  if (!res.ok) {
    return json({ success: false, message: "Error al obtener acuerdos" }, 500);
  }

  const contracts = (res.data || []).map((contract) => ({
    id: contract.id,
    title: contract.title,
    status: contract.status,
    created_at: contract.created_at || null,
    participant_verified_at: contract.participant_verified_at,
    participant_signed_at: contract.participant_signed_at,
    admin_signed_at: contract.admin_signed_at,
    participant_pin_verified: !!contract.employee_pin_verified,
  }));

  return json({ success: true, contracts });
}

async function handleVerifyParticipant(
  req: Request,
  url: string,
  key: string,
  orgId: string,
  body: RequestBody,
  actorSessionId: string,
): Promise<Response> {
  const contractId = String(body.contractId || "").trim();
  const pin = String(body.pin || "").trim();

  if (!contractId) return json({ success: false, message: "Falta contractId" }, 400);
  if (!PARTICIPANT_PIN_REGEX.test(pin)) {
    return json({ success: false, message: "El PIN del participante debe tener entre 4 y 6 cifras." }, 400);
  }

  const contract = await fetchContract(url, key, orgId, contractId);
  if (!contract) {
    return json({ success: false, message: "Acuerdo no encontrado" }, 404);
  }
  if (contract.status === "signed") {
    return json({ success: false, message: "El acuerdo ya esta firmado." }, 409);
  }
  if (contract.status === "cancelled") {
    return json({ success: false, message: "El acuerdo esta cancelado." }, 409);
  }
  if (contract.status === "pending_admin") {
    return json({
      success: false,
      error: "PARTICIPANT_ALREADY_SIGNED",
      message: "La firma del participante ya esta registrada. Solo falta la cofirma de la Fundacion.",
    }, 409);
  }

  const ipAddress = getClientIp(req);
  const userAgent = getUserAgent(req);
  const limiter = await getRateLimitStatus(url, key, orgId, "employee", ipAddress);
  const metadataBase = {
    scope: "contract_participant_verify",
    contract_id: contract.id,
    target_employee_id: contract.employee_id,
    actor_session_id: actorSessionId,
    user_agent: userAgent,
  };

  if (limiter.blockedUntil) {
    return json({
      success: false,
      error: "TOO_MANY_ATTEMPTS",
      message: "Demasiados intentos. Espera unos minutos antes de volver a probar.",
      retryAt: limiter.blockedUntil,
    }, 429);
  }

  const resolvedEmployee = await resolveEmployeeByPin(url, key, orgId, pin);
  if (!resolvedEmployee) {
    const nextFailureCount = limiter.failureCount + 1;
    const blockedUntil = nextFailureCount >= PARTICIPANT_FAILURE_LIMIT
      ? new Date(Date.now() + PARTICIPANT_BLOCK_MINUTES * 60 * 1000).toISOString()
      : null;

    await recordAuthAttempt(
      url,
      key,
      orgId,
      "employee",
      ipAddress,
      false,
      nextFailureCount,
      blockedUntil,
      {
        ...metadataBase,
        reason: "pin_not_matched",
        failure_count: nextFailureCount,
        blocked_until: blockedUntil,
      },
    );

    return json({ success: false, message: "PIN incorrecto." }, 401);
  }

  const resolvedEmployeeName = `${resolvedEmployee.nombre} ${resolvedEmployee.apellido}`.trim();
  if (resolvedEmployee.id !== contract.employee_id) {
    const nextFailureCount = limiter.failureCount + 1;
    const blockedUntil = nextFailureCount >= PARTICIPANT_FAILURE_LIMIT
      ? new Date(Date.now() + PARTICIPANT_BLOCK_MINUTES * 60 * 1000).toISOString()
      : null;

    await recordAuthAttempt(
      url,
      key,
      orgId,
      "employee",
      ipAddress,
      false,
      nextFailureCount,
      blockedUntil,
      {
        ...metadataBase,
        reason: "employee_mismatch",
        failure_count: nextFailureCount,
        blocked_until: blockedUntil,
        resolved_employee_id: resolvedEmployee.id,
        resolved_employee_name: resolvedEmployeeName,
      },
    );

    return json({
      success: false,
      error: "EMPLOYEE_MISMATCH",
      message: `Ese PIN pertenece a ${resolvedEmployeeName}, no al participante asignado en este acuerdo.`,
      resolvedEmployeeName,
    }, 409);
  }

  await recordAuthAttempt(
    url,
    key,
    orgId,
    "employee",
    ipAddress,
    true,
    0,
    null,
    {
      ...metadataBase,
      reason: "verified",
      resolved_employee_id: resolvedEmployee.id,
      resolved_employee_name: resolvedEmployeeName,
    },
  );

  const verificationToken = await signVerificationToken({
    contractId: contract.id,
    orgId,
    employeeId: contract.employee_id,
    scope: "contract_participant_verify",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + PARTICIPANT_TOKEN_TTL_SECONDS,
    ver: 1,
  });

  return json({
    success: true,
    verificationToken,
    employeeName: resolvedEmployeeName,
    expiresInSeconds: PARTICIPANT_TOKEN_TTL_SECONDS,
  });
}

async function handleParticipantSign(
  url: string,
  key: string,
  orgId: string,
  body: RequestBody,
  actorSessionId: string,
): Promise<Response> {
  const contractId = String(body.contractId || "").trim();
  const verificationToken = String(body.verificationToken || "").trim();

  if (!contractId) return json({ success: false, message: "Falta contractId" }, 400);
  if (!verificationToken) return json({ success: false, message: "Falta verificationToken" }, 400);
  if (!body.participantSignImg) return json({ success: false, message: "Falta participantSignImg" }, 400);

  const contract = await fetchContract(url, key, orgId, contractId);
  if (!contract) {
    return json({ success: false, message: "Acuerdo no encontrado" }, 404);
  }
  if (contract.status === "signed") {
    return json({ success: false, message: "El acuerdo ya esta firmado." }, 409);
  }
  if (contract.status === "cancelled") {
    return json({ success: false, message: "El acuerdo esta cancelado." }, 409);
  }
  if (contract.status !== "pending_participant") {
    return json({
      success: false,
      error: "PARTICIPANT_ALREADY_SIGNED",
      message: "La firma del participante ya esta registrada.",
    }, 409);
  }

  const tokenPayload = await verifyVerificationToken(verificationToken, "contract_participant_verify");
  if (!tokenPayload) {
    return json({
      success: false,
      error: "VERIFICATION_TOKEN_INVALID",
      message: "La validacion del PIN ha caducado. Vuelve a introducir el PIN del participante.",
    }, 401);
  }

  if (tokenPayload.orgId !== orgId || tokenPayload.contractId !== contract.id || tokenPayload.employeeId !== contract.employee_id) {
    return json({
      success: false,
      error: "VERIFICATION_TOKEN_MISMATCH",
      message: "La validacion del PIN no corresponde a este acuerdo.",
    }, 403);
  }

  const uploadResult = await uploadSignature(url, key, orgId, contract.id, "participant", body.participantSignImg);
  if ("error" in uploadResult) {
    return json({
      success: false,
      error: uploadResult.errorCode,
      message: `Error al subir la firma del participante: ${uploadResult.error}`,
    }, uploadResult.status);
  }
  const participantUrl = uploadResult.path;

  const participantVerifiedAt = new Date(tokenPayload.iat * 1000).toISOString();
  const participantSignedAt = new Date().toISOString();

  const updateRes = await fetchJson(
    `${url}/rest/v1/kiosk_contracts?id=eq.${encodeURIComponent(contract.id)}&organization_id=eq.${encodeURIComponent(orgId)}`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders(key),
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        status: "pending_admin",
        participant_sign_url: participantUrl,
        participant_verified_at: participantVerifiedAt,
        participant_signed_at: participantSignedAt,
        employee_pin_verified: true,
      }),
    },
  );

  if (!updateRes.ok) {
    console.error("[kiosk-contract] participant update error:", updateRes.data);
    return json({ success: false, message: "Error al guardar la firma del participante." }, 500);
  }

  await Promise.all([
    logAudit(url, key, {
      organizationId: orgId,
      actorSessionId,
      actorRole: "org_admin",
      employeeId: contract.employee_id,
      action: "contract_participant_verified",
      metadata: {
        contract_id: contract.id,
        participant_verified_at: participantVerifiedAt,
      },
    }),
    logAudit(url, key, {
      organizationId: orgId,
      actorSessionId,
      actorRole: "org_admin",
      employeeId: contract.employee_id,
      action: "contract_participant_signed",
      metadata: {
        contract_id: contract.id,
        participant_sign_url: participantUrl,
        participant_signed_at: participantSignedAt,
      },
    }),
  ]);

  return json({
    success: true,
    contractId: contract.id,
    status: "pending_admin",
    participantVerifiedAt,
    participantSignedAt,
  });
}

async function handleAdminSign(
  url: string,
  key: string,
  orgId: string,
  body: RequestBody,
  actorSessionId: string,
  adminEmployeeId: string | null,
): Promise<Response> {
  const contractId = String(body.contractId || "").trim();
  if (!contractId) return json({ success: false, message: "Falta contractId" }, 400);
  if (!body.adminSignImg) return json({ success: false, message: "Falta adminSignImg" }, 400);
  if (!adminEmployeeId) {
    return json({
      success: false,
      message: "La cofirma requiere iniciar sesion con un PIN personal de administrador.",
    }, 403);
  }

  const contract = await fetchContract(url, key, orgId, contractId);
  if (!contract) {
    return json({ success: false, message: "Acuerdo no encontrado" }, 404);
  }
  if (contract.status === "signed") {
    return json({ success: false, message: "El acuerdo ya esta firmado." }, 409);
  }
  if (contract.status === "cancelled") {
    return json({ success: false, message: "El acuerdo esta cancelado." }, 409);
  }
  if (contract.status !== "pending_admin") {
    return json({
      success: false,
      message: "Primero debe validarse el PIN del participante y guardarse su firma.",
    }, 409);
  }
  if (!contract.participant_sign_url || !contract.participant_signed_at) {
    return json({
      success: false,
      message: "Falta la firma del participante. Vuelve a completar el paso anterior.",
    }, 409);
  }

  const adminUploadResult = await uploadSignature(url, key, orgId, contract.id, "admin", body.adminSignImg);
  if ("error" in adminUploadResult) {
    return json({
      success: false,
      error: adminUploadResult.errorCode,
      message: `Error al subir la firma del representante: ${adminUploadResult.error}`,
    }, adminUploadResult.status);
  }
  const adminSignUrl = adminUploadResult.path;

  const adminSignedAt = new Date().toISOString();
  const signedDocument = buildSignedDocumentSnapshot(
    contract,
    adminEmployeeId,
    adminSignUrl,
    adminSignedAt,
  );
  const documentUploadResult = await uploadDocumentSnapshot(
    url,
    key,
    orgId,
    contract.id,
    signedDocument,
  );
  if ("error" in documentUploadResult) {
    return json({
      success: false,
      error: documentUploadResult.errorCode,
      message: `Error al guardar el documento firmado: ${documentUploadResult.error}`,
    }, documentUploadResult.status);
  }

  const documentHash = await computeSha256(JSON.stringify(signedDocument));

  const updateRes = await fetchJson(
    `${url}/rest/v1/kiosk_contracts?id=eq.${encodeURIComponent(contract.id)}&organization_id=eq.${encodeURIComponent(orgId)}`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders(key),
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
      },
      body: JSON.stringify({
        status: "signed",
        admin_sign_url: adminSignUrl,
        admin_signed_at: adminSignedAt,
        admin_employee_id: adminEmployeeId,
        document_hash: documentHash,
        document_storage_path: documentUploadResult.path,
        document_snapshot_json: signedDocument,
      }),
    },
  );

  if (!updateRes.ok) {
    console.error("[kiosk-contract] admin update error:", updateRes.data);
    return json({ success: false, message: "Error al guardar la cofirma." }, 500);
  }

  await logAudit(url, key, {
    organizationId: orgId,
    actorSessionId,
    actorRole: "org_admin",
    employeeId: contract.employee_id,
    action: "contract_signed",
    metadata: {
      contract_id: contract.id,
      admin_employee_id: adminEmployeeId,
      admin_signed_at: adminSignedAt,
      document_hash: documentHash,
      document_storage_path: documentUploadResult.path,
      participant_verified_at: contract.participant_verified_at,
      participant_signed_at: contract.participant_signed_at,
    },
  });

  return json({
    success: true,
    contractId: contract.id,
    status: "signed",
    adminSignedAt,
    documentHash,
    documentPath: documentUploadResult.path,
  });
}

async function fetchContract(
  url: string,
  key: string,
  orgId: string,
  contractId: string,
  includeEmployee = false,
): Promise<ContractRow | null> {
  const select = includeEmployee
    ? "id,organization_id,employee_id,title,activity_description,schedule,validity_text,representative_name,status,participant_sign_url,participant_verified_at,participant_signed_at,admin_sign_url,admin_signed_at,admin_employee_id,document_hash,document_storage_path,document_snapshot_json,employee_pin_verified,kiosk_employees(nombre,apellido)"
    : "id,organization_id,employee_id,title,activity_description,schedule,validity_text,representative_name,status,participant_sign_url,participant_verified_at,participant_signed_at,admin_sign_url,admin_signed_at,admin_employee_id,document_hash,document_storage_path,document_snapshot_json,employee_pin_verified";

  const res = await fetchJson<ContractRow[]>(
    `${url}/rest/v1/kiosk_contracts?id=eq.${encodeURIComponent(contractId)}&organization_id=eq.${encodeURIComponent(orgId)}&select=${select}&limit=1`,
    { headers: authHeaders(key) },
  );

  return res.ok ? res.data?.[0] || null : null;
}

async function uploadSignature(
  supabaseUrl: string,
  serviceRoleKey: string,
  orgId: string,
  contractId: string,
  role: "participant" | "admin",
  dataUrl: string,
): Promise<{ path: string } | { error: string; errorCode: string; status: number }> {
  try {
    const decodeResult = decodeSignatureImage(dataUrl);
    if ("error" in decodeResult) {
      return decodeResult;
    }
    const bytes = decodeResult.bytes;
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const path = `${orgId}/${contractId}/${role}.png`;
    const uploadResult = await supabaseAdmin.storage
      .from("contract-signatures")
      .upload(path, new Blob([bytes], { type: "image/png" }), {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadResult.error) {
      console.error(
        `[kiosk-contract] Storage upload failed (${role}): size=${bytes.length} body=${uploadResult.error.message}`,
      );
      return {
        error: `Storage upload failed: ${uploadResult.error.message} (size=${bytes.length})`,
        errorCode: "STORAGE_UPLOAD_FAILED",
        status: 500,
      };
    }

    if (!uploadResult.data?.path) {
      return {
        error: `Storage upload returned no path (size=${bytes.length})`,
        errorCode: "STORAGE_UPLOAD_FAILED",
        status: 500,
      };
    }

    return { path: uploadResult.data.path };
  } catch (err) {
    console.error(`[kiosk-contract] uploadSignature error (${role}):`, err);
    return {
      error: `Exception: ${err instanceof Error ? err.message : String(err)}`,
      errorCode: "SIGNATURE_UPLOAD_EXCEPTION",
      status: 500,
    };
  }
}

async function uploadDocumentSnapshot(
  supabaseUrl: string,
  serviceRoleKey: string,
  orgId: string,
  contractId: string,
  signedDocument: Record<string, unknown>,
): Promise<{ path: string } | { error: string; errorCode: string; status: number }> {
  try {
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const path = `${orgId}/${contractId}/signed-document.json`;
    const payload = JSON.stringify(signedDocument, null, 2);
    const uploadResult = await supabaseAdmin.storage
      .from("contract-documents")
      .upload(path, new Blob([payload], { type: "application/json" }), {
        contentType: "application/json",
        upsert: true,
      });

    if (uploadResult.error) {
      console.error("[kiosk-contract] Document upload failed:", uploadResult.error);
      return {
        error: `Storage upload failed: ${uploadResult.error.message}`,
        errorCode: "DOCUMENT_UPLOAD_FAILED",
        status: 500,
      };
    }

    if (!uploadResult.data?.path) {
      return {
        error: "Storage upload returned no path",
        errorCode: "DOCUMENT_UPLOAD_FAILED",
        status: 500,
      };
    }

    return { path: uploadResult.data.path };
  } catch (err) {
    console.error("[kiosk-contract] uploadDocumentSnapshot error:", err);
    return {
      error: `Exception: ${err instanceof Error ? err.message : String(err)}`,
      errorCode: "DOCUMENT_UPLOAD_EXCEPTION",
      status: 500,
    };
  }
}

function decodeSignatureImage(
  input: string,
): { bytes: Uint8Array } | { error: string; errorCode: string; status: number } {
  const raw = String(input || "").trim();
  if (!raw) {
    return {
      error: "Firma vacia",
      errorCode: "SIGNATURE_EMPTY",
      status: 400,
    };
  }

  const commaIndex = raw.indexOf(",");
  const base64Candidate = commaIndex >= 0 ? raw.slice(commaIndex + 1) : raw;
  const normalized = base64Candidate
    .replace(/\s+/g, "")
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  if (!normalized) {
    return {
      error: "No hay contenido base64 en la firma",
      errorCode: "SIGNATURE_EMPTY",
      status: 400,
    };
  }

  try {
    if (typeof Uint8Array.fromBase64 === "function") {
      return { bytes: Uint8Array.fromBase64(normalized) };
    }

    const binaryStr = atob(normalized);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return { bytes };
  } catch (_error) {
    return {
      error: "Base64 de firma invalido",
      errorCode: "SIGNATURE_INVALID_BASE64",
      status: 400,
    };
  }
}

async function handleGetPdfData(
  url: string,
  key: string,
  orgId: string,
  body: RequestBody,
): Promise<Response> {
  const contractId = String(body.contractId || "").trim();
  if (!contractId) return json({ success: false, message: "Falta contractId" }, 400);

  const contract = await fetchContract(url, key, orgId, contractId, true);
  if (!contract) {
    return json({ success: false, message: "Acuerdo no encontrado" }, 404);
  }
  if (contract.status !== "signed") {
    return json({ success: false, message: "El acuerdo aun no esta firmado" }, 409);
  }

  const supabaseAdmin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const [participantSignBase64, adminSignBase64] = await Promise.all([
    contract.participant_sign_url
      ? downloadSignatureAsBase64(supabaseAdmin, contract.participant_sign_url)
      : Promise.resolve(null),
    contract.admin_sign_url
      ? downloadSignatureAsBase64(supabaseAdmin, contract.admin_sign_url)
      : Promise.resolve(null),
  ]);

  let adminSignerName = "";
  if (contract.admin_employee_id) {
    const adminRes = await fetchJson<{ nombre: string; apellido: string }[]>(
      `${url}/rest/v1/kiosk_employees?id=eq.${encodeURIComponent(contract.admin_employee_id)}&organization_id=eq.${encodeURIComponent(orgId)}&select=nombre,apellido&limit=1`,
      { headers: authHeaders(key) },
    );
    if (adminRes.ok && adminRes.data?.[0]) {
      adminSignerName = `${adminRes.data[0].nombre} ${adminRes.data[0].apellido}`.trim();
    }
  }

  const emp = contract.kiosk_employees;
  const employeeName = emp ? `${emp.nombre} ${emp.apellido}`.trim() : "";

  return json({
    success: true,
    data: {
      id: contract.id,
      title: contract.title,
      employee_name: employeeName,
      representative_name: contract.representative_name,
      admin_signer_name: adminSignerName,
      activity_description: contract.activity_description,
      schedule: contract.schedule,
      validity_text: contract.validity_text,
      participant_signed_at: contract.participant_signed_at,
      admin_signed_at: contract.admin_signed_at,
      participant_sign_base64: participantSignBase64,
      admin_sign_base64: adminSignBase64,
      document_hash: contract.document_hash,
    },
  });
}

async function downloadSignatureAsBase64(
  supabaseAdmin: ReturnType<typeof createClient>,
  storagePath: string,
): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.storage
      .from("contract-signatures")
      .download(storagePath);
    if (error || !data) return null;
    const arrayBuffer = await data.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const chunks: string[] = [];
    for (let i = 0; i < bytes.length; i += 8192) {
      chunks.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192))));
    }
    return "data:image/png;base64," + btoa(chunks.join(""));
  } catch (_err) {
    return null;
  }
}

function buildSignedDocumentSnapshot(
  contract: ContractRow,
  adminEmployeeId: string,
  adminSignUrl: string,
  adminSignedAt: string,
): Record<string, unknown> {
  return {
    schema_version: 1,
    contract_id: contract.id,
    organization_id: contract.organization_id,
    employee_id: contract.employee_id,
    title: contract.title,
    activity_description: contract.activity_description,
    schedule: contract.schedule,
    validity_text: contract.validity_text,
    representative_name: contract.representative_name,
    status: "signed",
    participant_pin_verified: !!contract.employee_pin_verified,
    participant_verified_at: contract.participant_verified_at,
    participant_signed_at: contract.participant_signed_at,
    participant_sign_url: contract.participant_sign_url,
    admin_employee_id: adminEmployeeId,
    admin_signed_at: adminSignedAt,
    admin_sign_url: adminSignUrl,
    signed_at: adminSignedAt,
  };
}

