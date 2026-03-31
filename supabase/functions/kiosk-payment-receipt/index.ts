import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "npm:pdf-lib@1.17.1";

import {
  authHeaders,
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
  signVerificationToken,
  verifyVerificationToken,
} from "../_shared/kiosk.ts";

const PIN_REGEX = /^[0-9]{4,6}$/;
const FAILURE_LIMIT = 8;
const BLOCK_MINUTES = 10;
const TOKEN_TTL_SECONDS = 10 * 60;

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

interface RequestBody {
  action?: string;
  orgSlug?: string;
  year?: number;
  month?: number;
  receiptId?: string;
  pin?: string;
  verificationToken?: string;
  signatureImg?: string;
}

interface ReceiptRow {
  id: string;
  organization_id: string;
  employee_id: string;
  settlement_id: string;
  year: number;
  month: number;
  status: string;
  employee_name_snapshot: string;
  hours_worked: number;
  hourly_rate: number;
  amount_earned: number;
  worked_minutes: number;
  slot_count: number;
  employee_pin_verified: boolean | null;
  employee_verified_at: string | null;
  employee_signed_at: string | null;
  signature_storage_path: string | null;
  document_snapshot_json: Record<string, unknown> | null;
  document_storage_path: string | null;
  document_hash: string | null;
  created_at: string;
  updated_at: string;
  kiosk_employees?: { nombre: string; apellido: string } | null;
}

interface SettlementRow {
  id: string;
  employee_id: string;
  employee_name_snapshot: string;
  hours_worked: number;
  hourly_rate: number;
  amount_earned: number;
  worked_minutes: number;
  slot_count: number;
  status: string;
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
    const body = (await req.json()) as RequestBody;
    const action = String(body.action || "").trim();
    const orgSlug = String(body.orgSlug || "").trim();

    if (!orgSlug) {
      return json({ success: false, message: "Falta la organizacion" }, 400);
    }

    const { url, serviceRoleKey } = getSupabaseConfig();
    errUrl = url;
    errKey = serviceRoleKey;
    const orgId = await resolveOrgId(url, serviceRoleKey, orgSlug);
    if (!orgId) {
      return json({ success: false, message: "Organizacion no encontrada" }, 404);
    }

    // --- Respondent-session actions ---
    if (action === "my-receipt") {
      const auth = await requireSession(req, url, serviceRoleKey, ["respondent"]);
      if (auth instanceof Response) return auth;
      if (auth.session.organization_id !== orgId || !auth.session.employee_id) {
        return json({ success: false, message: "Sesion fuera de la organizacion activa" }, 403);
      }
      return await handleMyReceipt(url, serviceRoleKey, orgId, auth.session.employee_id, body);
    }

    if (action === "verify-pin") {
      const auth = await requireSession(req, url, serviceRoleKey, ["respondent"]);
      if (auth instanceof Response) return auth;
      if (auth.session.organization_id !== orgId || !auth.session.employee_id) {
        return json({ success: false, message: "Sesion fuera de la organizacion activa" }, 403);
      }
      return await handleVerifyPin(req, url, serviceRoleKey, orgId, body, auth.session.id);
    }

    if (action === "sign") {
      const auth = await requireSession(req, url, serviceRoleKey, ["respondent"]);
      if (auth instanceof Response) return auth;
      if (auth.session.organization_id !== orgId || !auth.session.employee_id) {
        return json({ success: false, message: "Sesion fuera de la organizacion activa" }, 403);
      }
      return await handleSign(url, serviceRoleKey, orgId, body, auth.session.id);
    }

    // --- Admin-session actions ---
    const auth = await requireSession(req, url, serviceRoleKey, ["org_admin"]);
    if (auth instanceof Response) return auth;
    if (auth.session.organization_id !== orgId) {
      return json({ success: false, message: "Sesion fuera de la organizacion activa" }, 403);
    }

    if (action === "generate") {
      return await handleGenerate(url, serviceRoleKey, orgId, body, auth.session.id);
    }

    if (action === "list") {
      return await handleList(url, serviceRoleKey, orgId, body);
    }

    if (action === "pdf") {
      return await handlePdf(url, serviceRoleKey, orgId, body);
    }

    if (action === "bulk-pdf") {
      return await handleBulkPdf(url, serviceRoleKey, orgId, body);
    }

    return json({ success: false, message: `Accion desconocida: ${action}` }, 400);
  } catch (err) {
    await logUnhandledEdgeError(errUrl, errKey, "kiosk-payment-receipt", err, { requestMethod: req.method });
    console.error("[kiosk-payment-receipt] Unexpected error:", err);
    return json({ success: false, message: "Error interno del servidor" }, 500);
  }
});

// ─── generate ────────────────────────────────────────────────────────────────

async function handleGenerate(
  url: string,
  key: string,
  orgId: string,
  body: RequestBody,
  actorSessionId: string,
): Promise<Response> {
  const year = Number(body.year);
  const month = Number(body.month);

  if (!year || !month || month < 1 || month > 12) {
    return json({ success: false, message: "Ano o mes invalido" }, 400);
  }

  // Fetch settlements with qualifying statuses
  const settlementsRes = await fetchJson<SettlementRow[]>(
    `${url}/rest/v1/kiosk_payment_settlements?select=id,employee_id,employee_name_snapshot,hours_worked,hourly_rate,amount_earned,worked_minutes,slot_count,status&organization_id=eq.${orgId}&year=eq.${year}&month=eq.${month}&status=in.(calculated,review_required,confirmed)`,
    { headers: authHeaders(key) },
  );

  if (!settlementsRes.ok) {
    return json({ success: false, message: "Error al obtener las liquidaciones" }, 500);
  }

  const settlements = settlementsRes.data || [];
  if (settlements.length === 0) {
    return json({ success: true, generated: 0, skippedSigned: 0 });
  }

  // Fetch existing receipts for this org/year/month
  const existingRes = await fetchJson<ReceiptRow[]>(
    `${url}/rest/v1/kiosk_payment_receipts?select=id,employee_id,status&organization_id=eq.${orgId}&year=eq.${year}&month=eq.${month}&status=in.(pending,signed)`,
    { headers: authHeaders(key) },
  );
  if (!existingRes.ok) {
    return json({ success: false, message: "Error al comprobar los recibos existentes" }, 500);
  }

  const existingReceipts = existingRes.data || [];
  const receiptByEmployee = new Map<string, ReceiptRow>();
  for (const r of existingReceipts) {
    receiptByEmployee.set(r.employee_id, r);
  }

  // Classify settlements: skip signed, collect supersede IDs and new inserts
  const toSupersede: string[] = [];
  const toInsert: Array<Record<string, unknown>> = [];
  let skippedSigned = 0;

  for (const settlement of settlements) {
    const existing = receiptByEmployee.get(settlement.employee_id);

    if (existing && existing.status === "signed") {
      skippedSigned++;
      continue;
    }

    if (existing && existing.status === "pending") {
      toSupersede.push(existing.id);
    }

    toInsert.push({
      organization_id: orgId,
      employee_id: settlement.employee_id,
      settlement_id: settlement.id,
      year,
      month,
      status: "pending",
      employee_name_snapshot: settlement.employee_name_snapshot || "",
      hours_worked: Number(settlement.hours_worked || 0),
      hourly_rate: Number(settlement.hourly_rate || 0),
      amount_earned: Number(settlement.amount_earned || 0),
      worked_minutes: Number(settlement.worked_minutes || 0),
      slot_count: Number(settlement.slot_count || 0),
    });
  }

  // Batch supersede in one PATCH
  if (toSupersede.length > 0) {
    const supersedeRes = await fetchJson(
      `${url}/rest/v1/kiosk_payment_receipts?id=in.(${toSupersede.join(",")})&organization_id=eq.${orgId}`,
      {
        method: "PATCH",
        headers: {
          ...authHeaders(key),
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ status: "superseded", updated_at: new Date().toISOString() }),
      },
    );
    if (!supersedeRes.ok) {
      return json({ success: false, message: "Error al reemplazar recibos pendientes anteriores" }, 500);
    }
  }

  // Batch insert all new receipts in one POST
  let generated = 0;
  if (toInsert.length > 0) {
    const insertRes = await fetchJson<Array<{ id: string }>>(
      `${url}/rest/v1/kiosk_payment_receipts?select=id`,
      {
        method: "POST",
        headers: {
          ...authHeaders(key),
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(toInsert),
      },
    );
    if (!insertRes.ok) {
      return json({ success: false, message: "Error al crear los recibos del mes" }, 500);
    }
    generated = insertRes.data?.length || 0;
  }

  await logAudit(url, key, {
    organizationId: orgId,
    actorSessionId,
    actorRole: "org_admin",
    action: "receipts_generated",
    metadata: { year, month, generated, skippedSigned },
  });

  return json({ success: true, generated, skippedSigned });
}

// ─── my-receipt ──────────────────────────────────────────────────────────────

async function handleMyReceipt(
  url: string,
  key: string,
  orgId: string,
  employeeId: string,
  body: RequestBody,
): Promise<Response> {
  const year = Number(body.year);
  const month = Number(body.month);

  if (!year || !month || month < 1 || month > 12) {
    return json({ success: false, message: "Falta ano o mes" }, 400);
  }

  const res = await fetchJson<ReceiptRow[]>(
    `${url}/rest/v1/kiosk_payment_receipts?select=id,status,employee_name_snapshot,hours_worked,hourly_rate,amount_earned,employee_signed_at&organization_id=eq.${orgId}&employee_id=eq.${employeeId}&year=eq.${year}&month=eq.${month}&status=in.(pending,signed)&limit=1`,
    { headers: authHeaders(key) },
  );

  if (!res.ok) {
    return json({ success: false, message: "Error al obtener el recibo" }, 500);
  }

  const receipt = res.data?.[0] || null;
  if (!receipt) {
    return json({ success: true, data: null });
  }

  return json({
    success: true,
    data: {
      id: receipt.id,
      status: receipt.status,
      employee_name_snapshot: receipt.employee_name_snapshot,
      hours_worked: Number(receipt.hours_worked || 0),
      hourly_rate: Number(receipt.hourly_rate || 0),
      amount_earned: Number(receipt.amount_earned || 0),
      employee_signed_at: receipt.employee_signed_at,
    },
  });
}

// ─── verify-pin ──────────────────────────────────────────────────────────────

async function handleVerifyPin(
  req: Request,
  url: string,
  key: string,
  orgId: string,
  body: RequestBody,
  actorSessionId: string,
): Promise<Response> {
  const receiptId = String(body.receiptId || "").trim();
  const pin = String(body.pin || "").trim();

  if (!receiptId) return json({ success: false, message: "Falta receiptId" }, 400);
  if (!PIN_REGEX.test(pin)) {
    return json({ success: false, message: "El PIN debe tener entre 4 y 6 cifras." }, 400);
  }

  // Fetch receipt
  const receiptRes = await fetchJson<ReceiptRow[]>(
    `${url}/rest/v1/kiosk_payment_receipts?select=id,organization_id,employee_id,status&id=eq.${encodeURIComponent(receiptId)}&organization_id=eq.${orgId}&limit=1`,
    { headers: authHeaders(key) },
  );

  const receipt = receiptRes.ok ? receiptRes.data?.[0] : null;
  if (!receipt) {
    return json({ success: false, message: "Recibo no encontrado" }, 404);
  }

  if (receipt.status !== "pending") {
    return json({ success: false, message: "El recibo ya esta firmado o no esta disponible." }, 409);
  }

  const ipAddress = getClientIp(req);
  const userAgent = getUserAgent(req);
  const limiter = await getRateLimitStatus(url, key, orgId, "employee", ipAddress);
  const metadataBase = {
    scope: "receipt_employee_verify",
    receipt_id: receipt.id,
    target_employee_id: receipt.employee_id,
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
    const blockedUntil = nextFailureCount >= FAILURE_LIMIT
      ? new Date(Date.now() + BLOCK_MINUTES * 60 * 1000).toISOString()
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

  if (resolvedEmployee.id !== receipt.employee_id) {
    const nextFailureCount = limiter.failureCount + 1;
    const blockedUntil = nextFailureCount >= FAILURE_LIMIT
      ? new Date(Date.now() + BLOCK_MINUTES * 60 * 1000).toISOString()
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
      },
    );

    return json({ success: false, message: "PIN incorrecto." }, 401);
  }

  // Success — reset rate limit
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
    },
  );

  const employeeName = `${resolvedEmployee.nombre} ${resolvedEmployee.apellido}`.trim();

  const verificationToken = await signVerificationToken({
    scope: "receipt_employee_verify",
    orgId,
    employeeId: receipt.employee_id,
    receiptId: receipt.id,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    ver: 1,
  });

  return json({
    success: true,
    verificationToken,
    employeeName,
    expiresInSeconds: TOKEN_TTL_SECONDS,
  });
}

// ─── sign ────────────────────────────────────────────────────────────────────

async function handleSign(
  url: string,
  key: string,
  orgId: string,
  body: RequestBody,
  actorSessionId: string,
): Promise<Response> {
  const receiptId = String(body.receiptId || "").trim();
  const verificationToken = String(body.verificationToken || "").trim();

  if (!receiptId) return json({ success: false, message: "Falta receiptId" }, 400);
  if (!verificationToken) return json({ success: false, message: "Falta verificationToken" }, 400);
  if (!body.signatureImg) return json({ success: false, message: "Falta signatureImg" }, 400);

  // Verify token
  const tokenPayload = await verifyVerificationToken(verificationToken, "receipt_employee_verify");
  if (!tokenPayload) {
    return json({
      success: false,
      error: "VERIFICATION_TOKEN_INVALID",
      message: "La validacion del PIN ha caducado. Vuelve a introducir el PIN.",
    }, 401);
  }

  if (tokenPayload.receiptId !== receiptId) {
    return json({
      success: false,
      error: "VERIFICATION_TOKEN_MISMATCH",
      message: "La validacion del PIN no corresponde a este recibo.",
    }, 403);
  }

  // Fetch receipt
  const receiptRes = await fetchJson<ReceiptRow[]>(
    `${url}/rest/v1/kiosk_payment_receipts?select=id,organization_id,employee_id,settlement_id,year,month,status,employee_name_snapshot,hours_worked,hourly_rate,amount_earned,worked_minutes,slot_count&id=eq.${encodeURIComponent(receiptId)}&organization_id=eq.${orgId}&limit=1`,
    { headers: authHeaders(key) },
  );

  const receipt = receiptRes.ok ? receiptRes.data?.[0] : null;
  if (!receipt) {
    return json({ success: false, message: "Recibo no encontrado" }, 404);
  }

  if (tokenPayload.employeeId !== receipt.employee_id) {
    return json({
      success: false,
      error: "VERIFICATION_TOKEN_MISMATCH",
      message: "La validacion del PIN no corresponde a este recibo.",
    }, 403);
  }

  if (receipt.status !== "pending") {
    return json({ success: false, message: "El recibo ya esta firmado o no esta disponible." }, 409);
  }

  // Validate and decode signature image
  const signatureImg = String(body.signatureImg || "").trim();
  if (!signatureImg.startsWith("data:image/png;base64,")) {
    return json({
      success: false,
      error: "SIGNATURE_INVALID_FORMAT",
      message: "La firma debe ser una imagen PNG en base64.",
    }, 400);
  }

  const decodeResult = decodeSignatureImage(signatureImg);
  if ("error" in decodeResult) {
    return json({
      success: false,
      error: decodeResult.errorCode,
      message: decodeResult.error,
    }, decodeResult.status);
  }

  const signatureBytes = decodeResult.bytes;
  if (signatureBytes.length > 512 * 1024) {
    return json({
      success: false,
      error: "SIGNATURE_TOO_LARGE",
      message: "La firma excede el tamano maximo permitido (512 KB).",
    }, 400);
  }

  const supabaseAdmin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const signaturePath = `${orgId}/${receiptId}/employee.png`;
  const now = new Date().toISOString();
  const employeeVerifiedAt = new Date(tokenPayload.iat * 1000).toISOString();

  const documentSnapshot: Record<string, unknown> = {
    schema_version: 1,
    receipt_id: receipt.id,
    organization_id: receipt.organization_id,
    employee_id: receipt.employee_id,
    settlement_id: receipt.settlement_id,
    year: receipt.year,
    month: receipt.month,
    employee_name_snapshot: receipt.employee_name_snapshot,
    hours_worked: Number(receipt.hours_worked || 0),
    hourly_rate: Number(receipt.hourly_rate || 0),
    amount_earned: Number(receipt.amount_earned || 0),
    worked_minutes: Number(receipt.worked_minutes || 0),
    slot_count: Number(receipt.slot_count || 0),
    employee_pin_verified: true,
    employee_verified_at: employeeVerifiedAt,
    employee_signed_at: now,
    signature_storage_path: signaturePath,
    signed_at: now,
  };

  const documentJsonStr = JSON.stringify(documentSnapshot);
  const documentHash = await computeSha256(documentJsonStr);
  const documentPath = `${orgId}/${receiptId}/signed-receipt.json`;

  // Upload signature and document snapshot concurrently
  const [uploadResult, docUploadResult] = await Promise.all([
    supabaseAdmin.storage
      .from("receipt-signatures")
      .upload(signaturePath, new Blob([signatureBytes], { type: "image/png" }), {
        contentType: "image/png",
        upsert: true,
      }),
    supabaseAdmin.storage
      .from("receipt-documents")
      .upload(documentPath, new Blob([JSON.stringify(documentSnapshot, null, 2)], { type: "application/json" }), {
        contentType: "application/json",
        upsert: true,
      }),
  ]);

  if (uploadResult.error) {
    console.error("[kiosk-payment-receipt] Signature upload failed:", uploadResult.error.message);
    return json({
      success: false,
      error: "STORAGE_UPLOAD_FAILED",
      message: "Error al subir la firma.",
    }, 500);
  }

  if (docUploadResult.error) {
    console.error("[kiosk-payment-receipt] Document upload failed:", docUploadResult.error.message);
    return json({
      success: false,
      error: "DOCUMENT_UPLOAD_FAILED",
      message: "Error al guardar el documento firmado.",
    }, 500);
  }

  // Update receipt record
  const updateRes = await fetchJson(
    `${url}/rest/v1/kiosk_payment_receipts?id=eq.${encodeURIComponent(receipt.id)}&organization_id=eq.${orgId}`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders(key),
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        status: "signed",
        employee_pin_verified: true,
        employee_verified_at: employeeVerifiedAt,
        employee_signed_at: now,
        signature_storage_path: signaturePath,
        document_snapshot_json: documentSnapshot,
        document_storage_path: documentPath,
        document_hash: documentHash,
        updated_at: now,
      }),
    },
  );

  if (!updateRes.ok) {
    console.error("[kiosk-payment-receipt] Receipt update error:", updateRes.data);
    return json({ success: false, message: "Error al guardar la firma del recibo." }, 500);
  }

  await logAudit(url, key, {
    organizationId: orgId,
    actorSessionId,
    actorRole: "respondent",
    employeeId: receipt.employee_id,
    action: "receipt_signed",
    metadata: {
      receipt_id: receipt.id,
      year: receipt.year,
      month: receipt.month,
      document_hash: documentHash,
      document_storage_path: documentPath,
    },
  });

  return json({ success: true });
}

// ─── list ────────────────────────────────────────────────────────────────────

async function handleList(
  url: string,
  key: string,
  orgId: string,
  body: RequestBody,
): Promise<Response> {
  const year = Number(body.year);
  const month = Number(body.month);

  if (!year || !month || month < 1 || month > 12) {
    return json({ success: false, message: "Ano o mes invalido" }, 400);
  }

  const res = await fetchJson<
    Array<
      ReceiptRow & { kiosk_employees: { nombre: string; apellido: string } | null }
    >
  >(
    `${url}/rest/v1/kiosk_payment_receipts?select=id,employee_id,employee_name_snapshot,hours_worked,hourly_rate,amount_earned,status,employee_signed_at,kiosk_employees(nombre,apellido)&organization_id=eq.${orgId}&year=eq.${year}&month=eq.${month}&status=in.(pending,signed)&order=employee_name_snapshot.asc`,
    { headers: authHeaders(key) },
  );

  if (!res.ok) {
    return json({ success: false, message: "Error al obtener los recibos" }, 500);
  }

  const receipts = (res.data || []).map((r) => {
    const emp = r.kiosk_employees;
    return {
      id: r.id,
      employee_id: r.employee_id,
      employee_name: emp ? `${emp.nombre} ${emp.apellido}`.trim() : "",
      employee_name_snapshot: r.employee_name_snapshot,
      hours_worked: Number(r.hours_worked || 0),
      hourly_rate: Number(r.hourly_rate || 0),
      amount_earned: Number(r.amount_earned || 0),
      status: r.status,
      employee_signed_at: r.employee_signed_at,
    };
  });

  return json({ success: true, receipts });
}

// ─── pdf ─────────────────────────────────────────────────────────────────────

async function handlePdf(
  url: string,
  key: string,
  orgId: string,
  body: RequestBody,
): Promise<Response> {
  const receiptId = String(body.receiptId || "").trim();
  if (!receiptId) return json({ success: false, message: "Falta receiptId" }, 400);

  const receiptRes = await fetchJson<ReceiptRow[]>(
    `${url}/rest/v1/kiosk_payment_receipts?select=id,organization_id,employee_id,year,month,status,employee_name_snapshot,hours_worked,hourly_rate,amount_earned,employee_signed_at,signature_storage_path,document_hash&id=eq.${encodeURIComponent(receiptId)}&organization_id=eq.${orgId}&limit=1`,
    { headers: authHeaders(key) },
  );

  const receipt = receiptRes.ok ? receiptRes.data?.[0] : null;
  if (!receipt) {
    return json({ success: false, message: "Recibo no encontrado" }, 404);
  }

  // Load signature image if present
  let signatureBytes: Uint8Array | null = null;
  if (receipt.signature_storage_path) {
    const supabaseAdmin = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabaseAdmin.storage
      .from("receipt-signatures")
      .download(receipt.signature_storage_path);
    if (!error && data) {
      signatureBytes = new Uint8Array(await data.arrayBuffer());
    }
  }

  const pdfBytes = await buildReceiptPdf(receipt, signatureBytes);
  const pdfBase64 = bytesToBase64(pdfBytes);

  return json({ success: true, pdfBase64 });
}

// ─── bulk-pdf ────────────────────────────────────────────────────────────────

async function handleBulkPdf(
  url: string,
  key: string,
  orgId: string,
  body: RequestBody,
): Promise<Response> {
  const year = Number(body.year);
  const month = Number(body.month);

  if (!year || !month || month < 1 || month > 12) {
    return json({ success: false, message: "Ano o mes invalido" }, 400);
  }

  const receiptsRes = await fetchJson<ReceiptRow[]>(
    `${url}/rest/v1/kiosk_payment_receipts?select=id,organization_id,employee_id,year,month,status,employee_name_snapshot,hours_worked,hourly_rate,amount_earned,employee_signed_at,signature_storage_path,document_hash&organization_id=eq.${orgId}&year=eq.${year}&month=eq.${month}&status=eq.signed&order=employee_name_snapshot.asc`,
    { headers: authHeaders(key) },
  );

  if (!receiptsRes.ok) {
    return json({ success: false, message: "Error al obtener los recibos" }, 500);
  }

  const signedReceipts = receiptsRes.data || [];
  if (signedReceipts.length === 0) {
    return json({ success: false, message: "No hay recibos firmados para este mes" }, 404);
  }

  const supabaseAdmin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Download signatures and build individual PDFs concurrently
  const individualPdfs = await Promise.all(
    signedReceipts.map(async (receipt) => {
      let signatureBytes: Uint8Array | null = null;
      if (receipt.signature_storage_path) {
        const { data, error } = await supabaseAdmin.storage
          .from("receipt-signatures")
          .download(receipt.signature_storage_path);
        if (!error && data) {
          signatureBytes = new Uint8Array(await data.arrayBuffer());
        }
      }
      return buildReceiptPdf(receipt, signatureBytes);
    }),
  );

  // Merge sequentially (mutates mergedPdf)
  const mergedPdf = await PDFDocument.create();
  for (const pdfBytes of individualPdfs) {
    const donor = await PDFDocument.load(pdfBytes);
    const copiedPages = await mergedPdf.copyPages(donor, donor.getPageIndices());
    for (const page of copiedPages) {
      mergedPdf.addPage(page);
    }
  }

  const mergedBytes = await mergedPdf.save();
  const pdfBase64 = bytesToBase64(new Uint8Array(mergedBytes));
  const filename = `Recibos_${year}_${String(month).padStart(2, "0")}.pdf`;

  return json({ success: true, pdfBase64, filename });
}

// ─── PDF generation ──────────────────────────────────────────────────────────

async function buildReceiptPdf(
  receipt: ReceiptRow,
  signatureBytes: Uint8Array | null,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const margin = 50;
  let y = height - margin;

  // Title
  const titleText = "FUNDACION AMBITOS";
  const titleSize = 18;
  const titleWidth = fontBold.widthOfTextAtSize(titleText, titleSize);
  page.drawText(titleText, {
    x: (width - titleWidth) / 2,
    y,
    size: titleSize,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  y -= 28;

  // Subtitle
  const subtitleText = "Recibo de Gratificacion Mensual";
  const subtitleSize = 14;
  const subtitleWidth = fontBold.widthOfTextAtSize(subtitleText, subtitleSize);
  page.drawText(subtitleText, {
    x: (width - subtitleWidth) / 2,
    y,
    size: subtitleSize,
    font: fontBold,
    color: rgb(0.2, 0.2, 0.2),
  });
  y -= 20;

  // Horizontal line separator
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: rgb(0.6, 0.6, 0.6),
  });
  y -= 30;

  // Fields
  const fieldSize = 12;
  const lineHeight = 22;
  const monthName = MONTH_NAMES[(receipt.month || 1) - 1] || "";
  const periodo = `${monthName} ${receipt.year}`;

  const fields: Array<[string, string]> = [
    ["Participante:", receipt.employee_name_snapshot || ""],
    ["Periodo:", periodo],
    ["Horas realizadas:", String(Number(receipt.hours_worked || 0))],
    ["Tarifa por hora:", `${Number(receipt.hourly_rate || 0).toFixed(2)} EUR`],
    ["Gratificacion total:", `${Number(receipt.amount_earned || 0).toFixed(2)} EUR`],
  ];

  for (const [label, value] of fields) {
    page.drawText(label, {
      x: margin,
      y,
      size: fieldSize,
      font: fontBold,
      color: rgb(0, 0, 0),
    });
    page.drawText(value, {
      x: margin + 160,
      y,
      size: fieldSize,
      font: fontRegular,
      color: rgb(0, 0, 0),
    });
    y -= lineHeight;
  }

  y -= 10;

  // Legal text
  const legalText =
    "El/la participante confirma haber recibido la gratificacion indicada, correspondiente a su participacion en la actividad ocupacional del Punto de Entrega SEUR - Punto Inclusivo, conforme al Real Decreto 2274/1985.";
  const legalSize = 10;
  const legalLines = wrapText(legalText, fontRegular, legalSize, width - 2 * margin);
  for (const line of legalLines) {
    page.drawText(line, {
      x: margin,
      y,
      size: legalSize,
      font: fontRegular,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= 16;
  }

  y -= 20;

  // Signature image
  if (signatureBytes) {
    try {
      const pngImage = await pdfDoc.embedPng(signatureBytes);
      const imgDims = pngImage.scale(0.5);
      const maxWidth = 200;
      const maxHeight = 80;
      const scale = Math.min(maxWidth / imgDims.width, maxHeight / imgDims.height, 1);
      const drawWidth = imgDims.width * scale;
      const drawHeight = imgDims.height * scale;

      page.drawImage(pngImage, {
        x: margin,
        y: y - drawHeight,
        width: drawWidth,
        height: drawHeight,
      });
      y -= drawHeight + 10;
    } catch (err) {
      console.error("[kiosk-payment-receipt] Error embedding signature in PDF:", err);
    }
  }

  // Signed date
  if (receipt.employee_signed_at) {
    const signedDate = new Date(receipt.employee_signed_at);
    const dateStr = signedDate.toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Madrid",
    });
    page.drawText(`Firmado: ${dateStr}`, {
      x: margin,
      y,
      size: 10,
      font: fontRegular,
      color: rgb(0.3, 0.3, 0.3),
    });
    y -= 20;
  }

  // Document hash footer
  if (receipt.document_hash) {
    const hashText = `Hash: ${receipt.document_hash}`;
    const hashSize = 7;
    page.drawText(hashText, {
      x: margin,
      y: margin - 10,
      size: hashSize,
      font: fontRegular,
      color: rgb(0.6, 0.6, 0.6),
    });
  }

  const pdfBytes = await pdfDoc.save();
  return new Uint8Array(pdfBytes);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function wrapText(
  text: string,
  font: ReturnType<typeof StandardFonts.Helvetica extends infer T ? () => T : never>,
  fontSize: number,
  maxWidth: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    // deno-lint-ignore no-explicit-any
    const testWidth = (font as any).widthOfTextAtSize(testLine, fontSize);
    if (testWidth > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }
  return lines;
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

function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += 8192) {
    chunks.push(String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192))));
  }
  return btoa(chunks.join(""));
}
