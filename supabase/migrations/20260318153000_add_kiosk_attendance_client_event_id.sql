begin;
alter table public.kiosk_attendance
  add column if not exists client_event_id text;
create unique index if not exists kiosk_attendance_org_client_event_id_key
  on public.kiosk_attendance (organization_id, client_event_id)
  where client_event_id is not null;
commit;
