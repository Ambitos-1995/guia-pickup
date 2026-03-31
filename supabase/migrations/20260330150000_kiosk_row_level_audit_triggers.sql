begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- kiosk_row_audit_log
-- Captures every INSERT / UPDATE / DELETE on critical kiosk tables via triggers.
-- This catches direct-SQL changes that bypass edge-function audit logging.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.kiosk_row_audit_log (
  id            uuid        primary key default gen_random_uuid(),
  table_name    text        not null,
  operation     text        not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  row_id        uuid,                          -- value of the PK column "id" when present
  old_data      jsonb,                         -- NULL for INSERT
  new_data      jsonb,                         -- NULL for DELETE
  changed_by    text        not null default current_user,   -- DB role that ran the statement
  app_user      text,                          -- app.user set by edge functions (optional)
  client_addr   inet        default inet_client_addr(),
  created_at    timestamptz not null default now()
);

create index if not exists idx_kiosk_row_audit_log_table_op
  on public.kiosk_row_audit_log (table_name, operation, created_at desc);

create index if not exists idx_kiosk_row_audit_log_row_id
  on public.kiosk_row_audit_log (row_id, created_at desc);

create index if not exists idx_kiosk_row_audit_log_created
  on public.kiosk_row_audit_log (created_at desc);

-- Only service_role / postgres may read; no direct client access
revoke all on public.kiosk_row_audit_log from anon, authenticated;
grant select, insert on public.kiosk_row_audit_log to service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Generic trigger function (reused by all tables)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.kiosk_row_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row_id uuid;
  v_old    jsonb;
  v_new    jsonb;
  v_app_user text;
begin
  -- Try to read an optional app.user GUC set by edge functions
  begin
    v_app_user := current_setting('app.user', true);
  exception when others then
    v_app_user := null;
  end;

  if TG_OP = 'DELETE' then
    v_row_id := OLD.id;
    v_old    := to_jsonb(OLD);
    v_new    := null;
  elsif TG_OP = 'INSERT' then
    v_row_id := NEW.id;
    v_old    := null;
    v_new    := to_jsonb(NEW);
  else -- UPDATE
    v_row_id := NEW.id;
    v_old    := to_jsonb(OLD);
    v_new    := to_jsonb(NEW);
  end if;

  insert into public.kiosk_row_audit_log
    (table_name, operation, row_id, old_data, new_data, changed_by, app_user)
  values
    (TG_TABLE_NAME, TG_OP, v_row_id, v_old, v_new, current_user, nullif(v_app_user, ''));

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Attach triggers to kiosk_employees
-- ─────────────────────────────────────────────────────────────────────────────
drop trigger if exists trg_kiosk_employees_audit on public.kiosk_employees;
create trigger trg_kiosk_employees_audit
  after insert or update or delete on public.kiosk_employees
  for each row execute function public.kiosk_row_audit_trigger();

-- ─────────────────────────────────────────────────────────────────────────────
-- Attach triggers to kiosk_contracts
-- ─────────────────────────────────────────────────────────────────────────────
drop trigger if exists trg_kiosk_contracts_audit on public.kiosk_contracts;
create trigger trg_kiosk_contracts_audit
  after insert or update or delete on public.kiosk_contracts
  for each row execute function public.kiosk_row_audit_trigger();

-- ─────────────────────────────────────────────────────────────────────────────
-- Attach triggers to kiosk_attendance
-- ─────────────────────────────────────────────────────────────────────────────
drop trigger if exists trg_kiosk_attendance_audit on public.kiosk_attendance;
create trigger trg_kiosk_attendance_audit
  after insert or update or delete on public.kiosk_attendance
  for each row execute function public.kiosk_row_audit_trigger();

-- ─────────────────────────────────────────────────────────────────────────────
-- Attach triggers to kiosk_schedule_slots
-- ─────────────────────────────────────────────────────────────────────────────
drop trigger if exists trg_kiosk_schedule_slots_audit on public.kiosk_schedule_slots;
create trigger trg_kiosk_schedule_slots_audit
  after insert or update or delete on public.kiosk_schedule_slots
  for each row execute function public.kiosk_row_audit_trigger();

-- ─────────────────────────────────────────────────────────────────────────────
-- Attach triggers to kiosk_payment_months
-- ─────────────────────────────────────────────────────────────────────────────
drop trigger if exists trg_kiosk_payment_months_audit on public.kiosk_payment_months;
create trigger trg_kiosk_payment_months_audit
  after insert or update or delete on public.kiosk_payment_months
  for each row execute function public.kiosk_row_audit_trigger();

commit;
