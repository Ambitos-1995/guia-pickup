begin;

create table if not exists public.kiosk_debug_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_session_id uuid references public.kiosk_sessions(id) on delete set null,
  employee_id uuid references public.kiosk_employees(id) on delete set null,
  source text not null check (source in ('frontend', 'edge', 'system')),
  scope text not null,
  action text not null,
  outcome text not null default 'info',
  message text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_kiosk_debug_events_org_created
  on public.kiosk_debug_events (organization_id, created_at desc);

create index if not exists idx_kiosk_debug_events_scope_action
  on public.kiosk_debug_events (scope, action, created_at desc);

create table if not exists public.kiosk_debug_schedule_mutations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_session_id uuid references public.kiosk_sessions(id) on delete set null,
  actor_employee_id uuid references public.kiosk_employees(id) on delete set null,
  target_employee_id uuid references public.kiosk_employees(id) on delete set null,
  slot_id uuid references public.kiosk_schedule_slots(id) on delete set null,
  mutation_type text not null check (mutation_type in ('assign', 'reassign', 'release', 'create', 'create_and_assign', 'update', 'delete')),
  outcome text not null default 'success',
  year integer,
  week integer,
  day_of_week integer,
  start_time time,
  end_time time,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_kiosk_debug_schedule_mutations_org_created
  on public.kiosk_debug_schedule_mutations (organization_id, created_at desc);

create index if not exists idx_kiosk_debug_schedule_mutations_slot
  on public.kiosk_debug_schedule_mutations (slot_id, created_at desc);

create table if not exists public.kiosk_debug_attendance_attempts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_session_id uuid references public.kiosk_sessions(id) on delete set null,
  employee_id uuid references public.kiosk_employees(id) on delete set null,
  slot_id uuid references public.kiosk_schedule_slots(id) on delete set null,
  action text not null check (action in ('status', 'check_in', 'check_out')),
  outcome text not null,
  client_date date,
  scheduled_start time,
  scheduled_end time,
  message text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_kiosk_debug_attendance_attempts_org_created
  on public.kiosk_debug_attendance_attempts (organization_id, created_at desc);

create index if not exists idx_kiosk_debug_attendance_attempts_employee_date
  on public.kiosk_debug_attendance_attempts (employee_id, client_date, created_at desc);

create table if not exists public.kiosk_debug_client_reports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  employee_id uuid references public.kiosk_employees(id) on delete set null,
  actor_session_id uuid references public.kiosk_sessions(id) on delete set null,
  route text not null default '',
  app_version text not null default '',
  device_label text not null default '',
  report_type text not null default 'client_report',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_kiosk_debug_client_reports_created
  on public.kiosk_debug_client_reports (created_at desc);

revoke all on public.kiosk_debug_events from anon, authenticated;
revoke all on public.kiosk_debug_schedule_mutations from anon, authenticated;
revoke all on public.kiosk_debug_attendance_attempts from anon, authenticated;
revoke all on public.kiosk_debug_client_reports from anon, authenticated;

grant select, insert, update, delete on public.kiosk_debug_events to service_role;
grant select, insert, update, delete on public.kiosk_debug_schedule_mutations to service_role;
grant select, insert, update, delete on public.kiosk_debug_attendance_attempts to service_role;
grant select, insert, update, delete on public.kiosk_debug_client_reports to service_role;

commit;
