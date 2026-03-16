begin;

alter table public.kiosk_employees
  add column if not exists pin_hash text,
  add column if not exists pin_lookup_hash text,
  add column if not exists pin_algorithm text,
  add column if not exists pin_migrated_at timestamptz;

create unique index if not exists kiosk_employees_org_pin_lookup_hash_key
  on public.kiosk_employees (organization_id, pin_lookup_hash)
  where pin_lookup_hash is not null;

create index if not exists idx_kiosk_employees_org_attendance_name
  on public.kiosk_employees (organization_id, attendance_enabled, nombre, apellido);

alter table public.kiosk_attendance
  add column if not exists slot_id uuid;

create index if not exists idx_kiosk_attendance_org_date_action
  on public.kiosk_attendance (organization_id, client_date, action);

create index if not exists idx_kiosk_attendance_slot_id
  on public.kiosk_attendance (slot_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'kiosk_attendance_slot_id_fkey'
      and conrelid = 'public.kiosk_attendance'::regclass
  ) then
    alter table public.kiosk_attendance
      add constraint kiosk_attendance_slot_id_fkey
      foreign key (slot_id)
      references public.kiosk_schedule_slots(id)
      on delete set null;
  end if;
end $$;

create table if not exists public.kiosk_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid references public.kiosk_employees(id) on delete set null,
  role text not null check (role in ('org_admin', 'respondent')),
  idle_timeout_seconds integer not null check (idle_timeout_seconds > 0),
  absolute_timeout_seconds integer not null check (absolute_timeout_seconds > 0),
  absolute_expires_at timestamptz not null,
  idle_expires_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  ip_address text not null default '',
  user_agent text not null default '',
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.kiosk_sessions enable row level security;

create index if not exists idx_kiosk_sessions_org_created
  on public.kiosk_sessions (organization_id, created_at desc);

create index if not exists idx_kiosk_sessions_employee
  on public.kiosk_sessions (employee_id, created_at desc);

create index if not exists idx_kiosk_sessions_expiry
  on public.kiosk_sessions (idle_expires_at, absolute_expires_at)
  where revoked_at is null;

create table if not exists public.kiosk_auth_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  login_type text not null check (login_type in ('admin', 'employee')),
  ip_address text not null,
  successful boolean not null,
  failure_count integer not null default 0,
  blocked_until timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  attempted_at timestamptz not null default now()
);

alter table public.kiosk_auth_attempts enable row level security;

create index if not exists idx_kiosk_auth_attempts_lookup
  on public.kiosk_auth_attempts (organization_id, login_type, ip_address, attempted_at desc);

create index if not exists idx_kiosk_auth_attempts_blocked
  on public.kiosk_auth_attempts (organization_id, login_type, ip_address, blocked_until desc)
  where blocked_until is not null;

create table if not exists public.kiosk_audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_session_id uuid references public.kiosk_sessions(id) on delete set null,
  actor_role text not null default 'system',
  employee_id uuid references public.kiosk_employees(id) on delete set null,
  slot_id uuid references public.kiosk_schedule_slots(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.kiosk_audit_log enable row level security;

create index if not exists idx_kiosk_audit_log_org_created
  on public.kiosk_audit_log (organization_id, created_at desc);

create index if not exists idx_kiosk_audit_log_action
  on public.kiosk_audit_log (action, created_at desc);

create table if not exists public.kiosk_payment_settlements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  employee_id uuid not null references public.kiosk_employees(id) on delete restrict,
  year integer not null,
  month integer not null check (month between 1 and 12),
  status text not null check (status in ('pending', 'calculated', 'review_required', 'confirmed')),
  hours_worked numeric not null default 0,
  hourly_rate numeric not null default 0,
  amount_earned numeric not null default 0,
  worked_minutes integer not null default 0,
  slot_count integer not null default 0,
  employee_name_snapshot text not null default '',
  notes text not null default '',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.kiosk_payment_settlements enable row level security;

create unique index if not exists kiosk_payment_settlements_org_employee_year_month_key
  on public.kiosk_payment_settlements (organization_id, employee_id, year, month);

create index if not exists idx_kiosk_payment_settlements_month
  on public.kiosk_payment_settlements (organization_id, year, month);

alter table public.kiosk_schedule_slots enable row level security;
alter table public.kiosk_payment_months enable row level security;

commit;
