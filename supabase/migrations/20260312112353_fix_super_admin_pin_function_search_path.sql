create or replace function public.verify_organization_super_admin_pin(
  p_organization_id uuid,
  p_pin text
)
returns boolean
language plpgsql
security definer
set search_path = 'public', 'extensions'
as $$
declare
  v_pin_hash text;
begin
  select os.super_admin_pin_hash
  into v_pin_hash
  from public.organization_settings os
  where os.organization_id = p_organization_id
    and os.super_admin_pin_enabled = true;

  if v_pin_hash is null then
    return false;
  end if;

  return v_pin_hash = crypt(p_pin, v_pin_hash);
end;
$$;;
