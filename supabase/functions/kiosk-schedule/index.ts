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
  year?: number;
  week?: number;
  dayOfWeek?: number;
  startTime?: string;
  endTime?: string;
  slotId?: string;
  signupId?: string;
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

    if (action === "list") {
      return handleList(supabaseUrl, serviceRoleKey, orgId, body);
    }

    if (action === "assign") {
      return handleAssign(supabaseUrl, serviceRoleKey, orgId, body);
    }

    if (action === "release") {
      return handleRelease(supabaseUrl, serviceRoleKey, orgId, body);
    }

    if (action === "create") {
      return handleCreate(supabaseUrl, serviceRoleKey, orgId, body);
    }

    return json({ success: false, message: "Accion no valida" }, 400);
  } catch (error) {
    console.error("kiosk-schedule error", error);
    return json({
      success: false,
      message: "Error interno",
      details: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});

// ---- Resolve org ----

async function resolveOrgId(url: string, key: string, slug: string): Promise<string | null> {
  const res = await fetch(
    `${url}/rest/v1/organizations?select=id&slug=eq.${encodeURIComponent(slug)}&limit=1`,
    { headers: authHeaders(key) },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ id: string }>;
  return rows.length > 0 ? rows[0].id : null;
}

// ---- Verify admin PIN ----

async function verifyAdminPin(url: string, key: string, orgId: string, pin: string): Promise<boolean> {
  const res = await fetch(`${url}/rest/v1/rpc/verify_organization_super_admin_pin`, {
    method: "POST",
    headers: { ...authHeaders(key), "Content-Type": "application/json" },
    body: JSON.stringify({ p_organization_id: orgId, p_pin: pin }),
  });
  if (!res.ok) return false;
  return (await res.json()) === true;
}

// ---- Resolve employee by PIN ----

async function resolveEmployee(
  url: string,
  key: string,
  orgId: string,
  pin: string,
): Promise<{ id: string; nombre: string; apellido: string } | null> {
  const res = await fetch(
    `${url}/rest/v1/kiosk_employees?select=id,nombre,apellido&organization_id=eq.${orgId}&pin=eq.${encodeURIComponent(pin)}&attendance_enabled=eq.true&limit=1`,
    { headers: authHeaders(key) },
  );
  if (!res.ok) return null;
  const rows = (await res.json()) as Array<{ id: string; nombre: string; apellido: string }>;
  return rows.length > 0 ? rows[0] : null;
}

// ---- LIST slots ----

async function handleList(
  url: string,
  key: string,
  orgId: string,
  body: RequestBody,
): Promise<Response> {
  const year = Number(body.year);
  const week = Number(body.week);

  if (!year || !week) {
    return json({ success: false, message: "Falta year o week" }, 400);
  }

  const res = await fetch(
    `${url}/rest/v1/kiosk_schedule_slots?select=id,day_of_week,start_time,end_time,employee_id,kiosk_employees(id,nombre,apellido)&organization_id=eq.${orgId}&year=eq.${year}&week=eq.${week}&order=day_of_week.asc,start_time.asc`,
    { headers: authHeaders(key) },
  );

  if (!res.ok) {
    const details = await res.text();
    console.error("list slots failed", details);
    return json({ success: false, message: "Error al listar franjas" }, 500);
  }

  const rows = (await res.json()) as Array<{
    id: string;
    day_of_week: number;
    start_time: string;
    end_time: string;
    employee_id: string | null;
    kiosk_employees: { id: string; nombre: string; apellido: string } | null;
  }>;

  const slots = rows.map((row) => {
    const emp = row.kiosk_employees;
    const occupied = !!row.employee_id;
    return {
      id: row.id,
      day_of_week: row.day_of_week,
      start_time: row.start_time,
      end_time: row.end_time,
      assigned_employee_profile_id: occupied ? row.employee_id : null,
      assigned_employee_name: emp ? emp.nombre + " " + emp.apellido : "",
      assigned_employee_code: emp ? emp.id : "",
      signup_id: occupied ? row.id : null,
      status: occupied ? "occupied" : "free",
    };
  });

  return json({ success: true, data: slots });
}

// ---- CREATE slot (admin) ----

async function handleCreate(
  url: string,
  key: string,
  orgId: string,
  body: RequestBody,
): Promise<Response> {
  const year = Number(body.year);
  const week = Number(body.week);
  const dayOfWeek = Number(body.dayOfWeek);
  const startTime = String(body.startTime || "").trim();
  const endTime = String(body.endTime || "").trim();

  if (!year || !week || !dayOfWeek || !startTime || !endTime) {
    return json({ success: false, message: "Faltan datos de la franja" }, 400);
  }
  if (dayOfWeek < 1 || dayOfWeek > 7) {
    return json({ success: false, message: "Dia de semana invalido" }, 400);
  }

  const res = await fetch(`${url}/rest/v1/kiosk_schedule_slots`, {
    method: "POST",
    headers: {
      ...authHeaders(key),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      organization_id: orgId,
      year,
      week,
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
      employee_id: null,
    }),
  });

  if (!res.ok) {
    const details = await res.text();
    console.error("create slot failed", details);
    return json({ success: false, message: "Error al crear la franja" }, 500);
  }

  const created = (await res.json()) as Array<{ id: string; day_of_week: number; start_time: string; end_time: string }>;
  const slot = created[0] || created;
  return json({
    success: true,
    data: {
      id: (slot as { id: string }).id,
      slot_id: (slot as { id: string }).id,
      day_of_week: (slot as { day_of_week: number }).day_of_week,
      start_time: (slot as { start_time: string }).start_time,
      end_time: (slot as { end_time: string }).end_time,
      status: "free",
    },
  });
}

// ---- ASSIGN slot ----

async function handleAssign(
  url: string,
  key: string,
  orgId: string,
  body: RequestBody,
): Promise<Response> {
  const pin = String(body.pin || "").trim();
  const slotId = String(body.slotId || "").trim();

  if (!pin || !slotId) {
    return json({ success: false, message: "Faltan datos" }, 400);
  }

  const emp = await resolveEmployee(url, key, orgId, pin);
  if (!emp) {
    return json({ success: false, message: "PIN incorrecto" }, 401);
  }

  // Check slot is free and belongs to org
  const slotRes = await fetch(
    `${url}/rest/v1/kiosk_schedule_slots?select=id,employee_id&id=eq.${encodeURIComponent(slotId)}&organization_id=eq.${orgId}&limit=1`,
    { headers: authHeaders(key) },
  );
  if (!slotRes.ok) {
    return json({ success: false, message: "Error al verificar franja" }, 500);
  }
  const slots = (await slotRes.json()) as Array<{ id: string; employee_id: string | null }>;
  if (slots.length === 0) {
    return json({ success: false, message: "Franja no encontrada" }, 404);
  }
  if (slots[0].employee_id !== null) {
    return json({ success: false, message: "La franja ya esta ocupada" }, 409);
  }

  const updateRes = await fetch(
    `${url}/rest/v1/kiosk_schedule_slots?id=eq.${encodeURIComponent(slotId)}&organization_id=eq.${orgId}`,
    {
      method: "PATCH",
      headers: { ...authHeaders(key), "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ employee_id: emp.id }),
    },
  );

  if (!updateRes.ok) {
    const details = await updateRes.text();
    console.error("assign slot failed", details);
    return json({ success: false, message: "Error al asignar franja" }, 500);
  }

  const updated = (await updateRes.json()) as Array<{ id: string; day_of_week: number; start_time: string; end_time: string }>;
  const slot = updated[0] || updated;
  return json({
    success: true,
    data: {
      id: (slot as { id: string }).id,
      day_of_week: (slot as { day_of_week: number }).day_of_week,
      start_time: (slot as { start_time: string }).start_time,
      end_time: (slot as { end_time: string }).end_time,
      assigned_employee_profile_id: emp.id,
      assigned_employee_name: emp.nombre + " " + emp.apellido,
      assigned_employee_code: emp.id,
      signup_id: (slot as { id: string }).id,
      status: "occupied",
    },
  });
}

// ---- RELEASE slot ----

async function handleRelease(
  url: string,
  key: string,
  orgId: string,
  body: RequestBody,
): Promise<Response> {
  const pin = String(body.pin || "").trim();
  const slotId = String(body.slotId || "").trim();

  if (!pin || !slotId) {
    return json({ success: false, message: "Faltan datos" }, 400);
  }

  // Fetch slot first
  const slotRes = await fetch(
    `${url}/rest/v1/kiosk_schedule_slots?select=id,employee_id,day_of_week,start_time,end_time&id=eq.${encodeURIComponent(slotId)}&organization_id=eq.${orgId}&limit=1`,
    { headers: authHeaders(key) },
  );
  if (!slotRes.ok) {
    return json({ success: false, message: "Error al verificar franja" }, 500);
  }
  const slots = (await slotRes.json()) as Array<{ id: string; employee_id: string | null; day_of_week: number; start_time: string; end_time: string }>;
  if (slots.length === 0) {
    return json({ success: false, message: "Franja no encontrada" }, 404);
  }

  // Admin PIN can release any slot
  const isAdmin = await verifyAdminPin(url, key, orgId, pin);
  if (!isAdmin) {
    // Must be the employee who owns the slot
    const emp = await resolveEmployee(url, key, orgId, pin);
    if (!emp) {
      return json({ success: false, message: "PIN incorrecto" }, 401);
    }
    if (slots[0].employee_id !== emp.id) {
      return json({ success: false, message: "No puedes liberar esta franja" }, 403);
    }
  }

  const updateRes = await fetch(
    `${url}/rest/v1/kiosk_schedule_slots?id=eq.${encodeURIComponent(slotId)}&organization_id=eq.${orgId}`,
    {
      method: "PATCH",
      headers: { ...authHeaders(key), "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ employee_id: null }),
    },
  );

  if (!updateRes.ok) {
    const details = await updateRes.text();
    console.error("release slot failed", details);
    return json({ success: false, message: "Error al liberar franja" }, 500);
  }

  const slot = slots[0];
  return json({
    success: true,
    data: {
      id: slot.id,
      day_of_week: slot.day_of_week,
      start_time: slot.start_time,
      end_time: slot.end_time,
      assigned_employee_profile_id: null,
      assigned_employee_name: "",
      assigned_employee_code: "",
      signup_id: null,
      status: "free",
    },
  });
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
