alter table public.master_test_catalog enable row level security;
alter table public.master_test_catalog_assets enable row level security;

drop policy if exists "catalog_staff_can_view_master_test_catalog" on public.master_test_catalog;
drop policy if exists "catalog_admins_manage_master_test_catalog" on public.master_test_catalog;
drop policy if exists "catalog_staff_can_view_master_test_catalog_assets" on public.master_test_catalog_assets;
drop policy if exists "catalog_admins_manage_master_test_catalog_assets" on public.master_test_catalog_assets;

create policy "catalog_staff_can_view_master_test_catalog"
on public.master_test_catalog
for select
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.auth_user_id = (select auth.uid())
      and users.role in ('admin', 'clinician')
  )
);

create policy "catalog_admins_manage_master_test_catalog"
on public.master_test_catalog
for all
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.auth_user_id = (select auth.uid())
      and users.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.users
    where users.auth_user_id = (select auth.uid())
      and users.role = 'admin'
  )
);

create policy "catalog_staff_can_view_master_test_catalog_assets"
on public.master_test_catalog_assets
for select
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.auth_user_id = (select auth.uid())
      and users.role in ('admin', 'clinician')
  )
);

create policy "catalog_admins_manage_master_test_catalog_assets"
on public.master_test_catalog_assets
for all
to authenticated
using (
  exists (
    select 1
    from public.users
    where users.auth_user_id = (select auth.uid())
      and users.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.users
    where users.auth_user_id = (select auth.uid())
      and users.role = 'admin'
  )
);
