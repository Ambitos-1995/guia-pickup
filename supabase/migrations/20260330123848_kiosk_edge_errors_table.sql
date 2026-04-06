create table if not exists public.kiosk_edge_errors (
  id             uuid        primary key default gen_random_uuid(),
  function_name  text        not null,
  organization_id uuid       references public.organizations(id) on delete set null,
  error_message  text        not null default '',
  error_stack    text,
  request_method text,
  request_url    text,
  metadata       jsonb       not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists idx_kiosk_edge_errors_fn_created
  on public.kiosk_edge_errors (function_name, created_at desc);

create index if not exists idx_kiosk_edge_errors_created
  on public.kiosk_edge_errors (created_at desc);

revoke all on public.kiosk_edge_errors from anon, authenticated;
grant select, insert on public.kiosk_edge_errors to service_role;;
