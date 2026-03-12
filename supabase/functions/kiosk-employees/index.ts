import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

interface RequestBody {
  action?: string;
  orgSlug?: string;
  adminPin?: string;
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
    return json({ success: false, message: "Method not allowed" }, 405);
  }

  try {
    const body = (await req.json()) as RequestBody;
    const action = String(body.action || "").trim();
    const orgSlug = String(body.orgSlug || "").trim();

    if (!orgSlug) {
      return json({ success: false, message: "Falta la organizacion" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ success: false, message: "Config error" }, 500);
    }

    const orgId = await resolveOrgId(supabaseUrl, serviceRoleKey, orgSlug);
    if (!orgId) {
      return json({ success: false, message: "Organizacion no encontrada" }, 404);
    }

    // --- VERIFY: no admin required ---
    if (action === "verify") {
      return handleVerify(supabaseUrl, serviceRoleKey, orgId, body);
    }

    // --- ADMIN actions: list, create ---
    const adminPin = String(body.adminPin || "").trim();
    if (!adminPin) {
      return json({ success: false, message: "Se requiere PIN de admin" }, 401);
    }

    const isAdmin = await verifyAdminPin(supabaseUrl, serviceRoleKey, orgId, adminPin);
    if (!isAdmin) {
      return json({ success: false, message: "PIN de admin invalido" }, 401);
    }

    if (action === "list") {
      return handleList(supabaseUrl, serviceRoleKey, orgId);
    }

    if (action === "create") {
      return handleCreate(supabaseUrl, serviceRoleKey, orgId, body);
    }

    if (action === "update") {
      return handleUpdate(supabaseUrl, serviceRoleKey, orgId, body);
    }

    return json({ success: false, message: "Accion no valida" }, 400);
  } catch (error) {
    console.error("kiosk-employees error", error);
    return json({
      success: false,
      message: "Error interno",
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

// ---- Resolve organization ID from slug ----

async function resolveOrgId(
  supabaseUrl: string,
  key: string,
  slug: string,
): Promise<string | null> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/organizations?select=id&slug=eq.${encodeURIComponent(slug)}&limit=1`,
    { headers: authHeaders(key) },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ id: string }>;
  return rows.length > 0 ? rows[0].id : null;
}

// ---- Verify admin PIN via existing RPC ----

async function verifyAdminPin(
  supabaseUrl: string,
  key: string,
  orgId: string,
  pin: string,
): Promise<boolean> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/rpc/verify_organization_super_admin_pin`,
    {
      method: "POST",
      headers: { ...authHeaders(key), "Content-Type": "application/json" },
      body: JSON.stringify({ p_organization_id: orgId, p_pin: pin }),
    },
  );
  if (!res.ok) return false;
  return (await res.json()) === true;
}

// ---- VERIFY employee PIN ----

async function handleVerify(
  supabaseUrl: string,
  key: string,
  orgId: string,
  body: RequestBody,
): Promise<Response> {
  const pin = String(body.pin || "").trim();

  if (!/^[0-9]{4}$/.test(pin)) {
    return json({ success: false, message: "PIN debe ser 4 cifras" }, 400);
  }

  const res = await fetch(
    `${supabaseUrl}/rest/v1/kiosk_employees?select=id,nombre,apellido,pin,attendance_enabled&organization_id=eq.${orgId}&pin=eq.${encodeURIComponent(pin)}&limit=1`,
    { headers: authHeaders(key) },
  );

  if (!res.ok) {
    return json({ success: false, message: "Error al verificar" }, 500);
  }

  const rows = (await res.json()) as Array<{
    id: string;
    nombre: string;
    apellido: string;
    attendance_enabled: boolean;
  }>;

  if (rows.length === 0) {
    return json({ success: false, message: "PIN incorrecto" }, 401);
  }

  const emp = rows[0];

  if (!emp.attendance_enabled) {
    return json({ success: false, message: "Empleado desactivado" }, 403);
  }

  // Get today's attendance status
  const today = new Date().toISOString().slice(0, 10);
  const attRes = await fetch(
    `${supabaseUrl}/rest/v1/kiosk_attendance?select=action,recorded_at&employee_id=eq.${emp.id}&client_date=eq.${today}&order=recorded_at.desc&limit=1`,
    { headers: authHeaders(key) },
  );

  let currentStatus = "not_checked_in";
  if (attRes.ok) {
    const attRows = (await attRes.json()) as Array<{ action: string }>;
    if (attRows.length > 0) {
      currentStatus = attRows[0].action === "check_in" ? "checked_in" : "checked_out";
    }
  }

  return json({
    success: true,
    data: {
      employeeProfileId: emp.id,
      employeeName: emp.nombre + " " + emp.apellido,
      employeeCode: emp.id,
      currentStatus: currentStatus,
      role: "respondent",
    },
  });
}

// ---- LIST employees ----

async function handleList(
  supabaseUrl: string,
  key: string,
  orgId: string,
): Promise<Response> {
  const res = await fetch(
    `${supabaseUrl}/rest/v1/kiosk_employees?select=id,nombre,apellido,attendance_enabled,created_at&organization_id=eq.${orgId}&order=created_at.desc`,
    { headers: authHeaders(key) },
  );

  if (!res.ok) {
    const details = await res.text();
    console.error("list employees failed", details);
    return json({ success: false, message: "Error al listar empleados" }, 500);
  }

  const rows = await res.json();
  return json({ success: true, data: rows });
}

// ---- CREATE employee ----

async function handleCreate(
  supabaseUrl: string,
  key: string,
  orgId: string,
  body: RequestBody,
): Promise<Response> {
  const nombre = String(body.nombre || "").trim();
  const apellido = String(body.apellido || "").trim();
  const pin = String(body.pin || "").trim();

  if (!nombre || !apellido) {
    return json({ success: false, message: "Nombre y apellido son obligatorios" }, 400);
  }

  if (!/^[0-9]{4}$/.test(pin)) {
    return json({ success: false, message: "El PIN debe ser exactamente 4 cifras" }, 400);
  }

  // Check PIN uniqueness within org
  const checkRes = await fetch(
    `${supabaseUrl}/rest/v1/kiosk_employees?select=id&organization_id=eq.${orgId}&pin=eq.${encodeURIComponent(pin)}&limit=1`,
    { headers: authHeaders(key) },
  );

  if (checkRes.ok) {
    const existing = await checkRes.json();
    if (Array.isArray(existing) && existing.length > 0) {
      return json({ success: false, message: "Ya existe un empleado con ese PIN" }, 409);
    }
  }

  // Insert
  const insertRes = await fetch(
    `${supabaseUrl}/rest/v1/kiosk_employees`,
    {
      method: "POST",
      headers: {
        ...authHeaders(key),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        organization_id: orgId,
        nombre,
        apellido,
        pin,
        attendance_enabled: true,
      }),
    },
  );

  if (!insertRes.ok) {
    const details = await insertRes.text();
    console.error("create employee failed", details);
    return json({ success: false, message: "Error al crear empleado" }, 500);
  }

  const created = await insertRes.json();
  return json({ success: true, data: created[0] || created });
}

// ---- UPDATE employee ----

async function handleUpdate(
  supabaseUrl: string,
  key: string,
  orgId: string,
  body: RequestBody,
): Promise<Response> {
  const employeeId = String(body.employeeId || "").trim();
  const nombre = body.nombre !== undefined ? String(body.nombre).trim() : undefined;
  const apellido = body.apellido !== undefined ? String(body.apellido).trim() : undefined;
  const pin = body.pin !== undefined && body.pin !== null ? String(body.pin).trim() : undefined;

  if (!employeeId) {
    return json({ success: false, message: "Falta el ID del empleado" }, 400);
  }
  if (nombre !== undefined && !nombre) {
    return json({ success: false, message: "El nombre no puede estar vacío" }, 400);
  }
  if (apellido !== undefined && !apellido) {
    return json({ success: false, message: "El apellido no puede estar vacío" }, 400);
  }
  if (pin !== undefined && pin !== "" && !/^[0-9]{4}$/.test(pin)) {
    return json({ success: false, message: "El PIN debe ser exactamente 4 cifras" }, 400);
  }

  // Check PIN uniqueness (excluding current employee)
  if (pin) {
    const checkRes = await fetch(
      `${supabaseUrl}/rest/v1/kiosk_employees?select=id&organization_id=eq.${orgId}&pin=eq.${encodeURIComponent(pin)}&id=neq.${encodeURIComponent(employeeId)}&limit=1`,
      { headers: authHeaders(key) },
    );
    if (checkRes.ok) {
      const existing = await checkRes.json();
      if (Array.isArray(existing) && existing.length > 0) {
        return json({ success: false, message: "Ya existe un empleado con ese PIN" }, 409);
      }
    }
  }

  // Build update payload
  const updates: Record<string, string> = {};
  if (nombre) updates.nombre = nombre;
  if (apellido) updates.apellido = apellido;
  if (pin) updates.pin = pin;

  if (Object.keys(updates).length === 0) {
    return json({ success: false, message: "No hay cambios para guardar" }, 400);
  }

  const updateRes = await fetch(
    `${supabaseUrl}/rest/v1/kiosk_employees?id=eq.${encodeURIComponent(employeeId)}&organization_id=eq.${orgId}`,
    {
      method: "PATCH",
      headers: {
        ...authHeaders(key),
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(updates),
    },
  );

  if (!updateRes.ok) {
    const details = await updateRes.text();
    console.error("update employee failed", details);
    return json({ success: false, message: "Error al actualizar empleado" }, 500);
  }

  const updated = await updateRes.json();
  return json({ success: true, data: updated[0] || updated });
}

// ---- Helpers ----

function authHeaders(key: string): Record<string, string> {
  return {
    Authorization: `Bearer ${key}`,
    apikey: key,
  };
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: corsHeaders,
  });
}
