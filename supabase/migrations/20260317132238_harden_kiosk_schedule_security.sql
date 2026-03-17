begin;

drop policy if exists "Allow public read access to schedule slots" on public.kiosk_schedule_slots;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'kiosk_schedule_slots_start_before_end_check'
      and conrelid = 'public.kiosk_schedule_slots'::regclass
  ) then
    alter table public.kiosk_schedule_slots
      add constraint kiosk_schedule_slots_start_before_end_check
      check (start_time < end_time);
  end if;
end $$;

create unique index if not exists kiosk_schedule_slots_org_year_week_day_start_key
  on public.kiosk_schedule_slots (organization_id, year, week, day_of_week, start_time);

create index if not exists idx_kiosk_schedule_slots_employee_id
  on public.kiosk_schedule_slots (employee_id)
  where employee_id is not null;

create index if not exists idx_kiosk_audit_log_actor_session_id
  on public.kiosk_audit_log (actor_session_id)
  where actor_session_id is not null;

create index if not exists idx_kiosk_audit_log_employee_id
  on public.kiosk_audit_log (employee_id)
  where employee_id is not null;

create index if not exists idx_kiosk_audit_log_slot_id
  on public.kiosk_audit_log (slot_id)
  where slot_id is not null;

create index if not exists idx_kiosk_payment_settlements_employee_id
  on public.kiosk_payment_settlements (employee_id);

commit;;
