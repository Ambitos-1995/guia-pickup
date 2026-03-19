begin;

create or replace function public.cleanup_expired_tokens()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  with deleted as (
    delete from public.token_blacklist
    where expires_at < now()
    returning 1
  )
  select count(*) into deleted_count from deleted;

  if deleted_count > 0 then
    insert into public.audit_logs (
      action,
      resource_type,
      resource_id,
      new_values,
      result,
      created_at
    ) values (
      'token_blacklist_cleanup',
      'system',
      null,
      jsonb_build_object('deleted_count', deleted_count, 'executed_at', now()),
      'success',
      now()
    );
  end if;

  return deleted_count;
end;
$$;

create or replace function public.verify_employee_pin(
  p_organization_id uuid,
  p_pin text
)
returns table (
  employee_profile_id uuid,
  user_id uuid,
  employee_code text,
  employee_name text,
  photo_url text,
  current_status text,
  last_attendance_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_employee record;
  v_last_attendance record;
begin
  select ep.id, ep.user_id, ep.employee_code, ep.photo_url, u.nombre
  into v_employee
  from public.employee_profiles ep
  join public.users u on u.id = ep.user_id
  where ep.organization_id = p_organization_id
    and ep.attendance_enabled = true
    and ep.pin_hash = extensions.crypt(p_pin, ep.pin_hash);

  if not found then
    return;
  end if;

  select a.type, a.timestamp
  into v_last_attendance
  from public.attendances a
  where a.employee_profile_id = v_employee.id
    and a.work_date = current_date
  order by a.timestamp desc
  limit 1;

  return query select
    v_employee.id,
    v_employee.user_id,
    v_employee.employee_code::text,
    v_employee.nombre::text,
    v_employee.photo_url::text,
    case
      when v_last_attendance.type is null then 'not_checked_in'
      when v_last_attendance.type = 'check_in' then 'checked_in'
      else 'checked_out'
    end,
    v_last_attendance.timestamp;
end;
$$;

commit;
