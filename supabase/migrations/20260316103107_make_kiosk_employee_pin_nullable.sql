begin;

alter table public.kiosk_employees
  alter column pin drop not null;

commit;;
