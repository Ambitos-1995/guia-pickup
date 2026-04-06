-- 1. Ampliar kiosk_row_audit_log con row_pk text
alter table public.kiosk_row_audit_log
  add column if not exists row_pk text;

update public.kiosk_row_audit_log
  set row_pk = row_id::text
  where row_pk is null and row_id is not null;

-- 2. Función genérica actualizada (extracción JSONB segura)
create or replace function public.kiosk_row_audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row_id   uuid;
  v_row_pk   text;
  v_old      jsonb;
  v_new      jsonb;
  v_app_user text;
begin
  begin
    v_app_user := current_setting('app.user', true);
  exception when others then
    v_app_user := null;
  end;

  if TG_OP = 'DELETE' then
    v_old    := to_jsonb(OLD);
    v_new    := null;
    v_row_pk := v_old ->> 'id';
  elsif TG_OP = 'INSERT' then
    v_old    := null;
    v_new    := to_jsonb(NEW);
    v_row_pk := v_new ->> 'id';
  else
    v_old    := to_jsonb(OLD);
    v_new    := to_jsonb(NEW);
    v_row_pk := v_new ->> 'id';
  end if;

  if v_row_pk is not null then
    begin
      v_row_id := v_row_pk::uuid;
    exception when others then
      v_row_id := null;
    end;
  end if;

  insert into public.kiosk_row_audit_log
    (table_name, operation, row_id, row_pk, old_data, new_data, changed_by, app_user)
  values
    (TG_TABLE_NAME, TG_OP, v_row_id, v_row_pk, v_old, v_new, current_user, nullif(v_app_user, ''));

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

-- 3. Función para tablas con PK no estándar
create or replace function public.kiosk_row_audit_trigger_custom_pk()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row_id   uuid;
  v_row_pk   text;
  v_old      jsonb;
  v_new      jsonb;
  v_app_user text;
  v_pk_col   text;
begin
  v_pk_col := TG_ARGV[0];

  begin
    v_app_user := current_setting('app.user', true);
  exception when others then
    v_app_user := null;
  end;

  if TG_OP = 'DELETE' then
    v_old    := to_jsonb(OLD);
    v_new    := null;
    v_row_pk := v_old ->> v_pk_col;
  elsif TG_OP = 'INSERT' then
    v_old    := null;
    v_new    := to_jsonb(NEW);
    v_row_pk := v_new ->> v_pk_col;
  else
    v_old    := to_jsonb(OLD);
    v_new    := to_jsonb(NEW);
    v_row_pk := v_new ->> v_pk_col;
  end if;

  if v_row_pk is not null then
    begin
      v_row_id := v_row_pk::uuid;
    exception when others then
      v_row_id := null;
    end;
  end if;

  insert into public.kiosk_row_audit_log
    (table_name, operation, row_id, row_pk, old_data, new_data, changed_by, app_user)
  values
    (TG_TABLE_NAME, TG_OP, v_row_id, v_row_pk, v_old, v_new, current_user, nullif(v_app_user, ''));

  if TG_OP = 'DELETE' then
    return OLD;
  end if;
  return NEW;
end;
$$;

-- 4. Tablas core de plataforma
drop trigger if exists trg_organizations_audit on public.organizations;
create trigger trg_organizations_audit
  after insert or update or delete on public.organizations
  for each row execute function public.kiosk_row_audit_trigger();

drop trigger if exists trg_users_audit on public.users;
create trigger trg_users_audit
  after insert or update or delete on public.users
  for each row execute function public.kiosk_row_audit_trigger();

drop trigger if exists trg_organization_settings_audit on public.organization_settings;
create trigger trg_organization_settings_audit
  after insert or update or delete on public.organization_settings
  for each row execute function public.kiosk_row_audit_trigger();

drop trigger if exists trg_org_retention_settings_audit on public.organization_retention_settings;
create trigger trg_org_retention_settings_audit
  after insert or update or delete on public.organization_retention_settings
  for each row execute function public.kiosk_row_audit_trigger_custom_pk('organization_id');

drop trigger if exists trg_invitations_audit on public.invitations;
create trigger trg_invitations_audit
  after insert or update or delete on public.invitations
  for each row execute function public.kiosk_row_audit_trigger();

drop trigger if exists trg_employee_profiles_audit on public.employee_profiles;
create trigger trg_employee_profiles_audit
  after insert or update or delete on public.employee_profiles
  for each row execute function public.kiosk_row_audit_trigger();

-- 5. Tablas clínicas / tests (GDPR)
drop trigger if exists trg_test_definitions_audit on public.test_definitions;
create trigger trg_test_definitions_audit
  after insert or update or delete on public.test_definitions
  for each row execute function public.kiosk_row_audit_trigger();

drop trigger if exists trg_responses_audit on public.responses;
create trigger trg_responses_audit
  after insert or update or delete on public.responses
  for each row execute function public.kiosk_row_audit_trigger();

drop trigger if exists trg_scores_audit on public.scores;
create trigger trg_scores_audit
  after insert or update or delete on public.scores
  for each row execute function public.kiosk_row_audit_trigger();

drop trigger if exists trg_consents_audit on public.consents;
create trigger trg_consents_audit
  after insert or update or delete on public.consents
  for each row execute function public.kiosk_row_audit_trigger();

drop trigger if exists trg_reports_audit on public.reports;
create trigger trg_reports_audit
  after insert or update or delete on public.reports
  for each row execute function public.kiosk_row_audit_trigger();

drop trigger if exists trg_clinical_notes_audit on public.clinical_notes;
create trigger trg_clinical_notes_audit
  after insert or update or delete on public.clinical_notes
  for each row execute function public.kiosk_row_audit_trigger();

drop trigger if exists trg_user_demographics_audit on public.user_demographics;
create trigger trg_user_demographics_audit
  after insert or update or delete on public.user_demographics
  for each row execute function public.kiosk_row_audit_trigger();

drop trigger if exists trg_assessment_history_audit on public.assessment_history;
create trigger trg_assessment_history_audit
  after insert or update or delete on public.assessment_history
  for each row execute function public.kiosk_row_audit_trigger();

drop trigger if exists trg_test_norms_audit on public.test_norms;
create trigger trg_test_norms_audit
  after insert or update or delete on public.test_norms
  for each row execute function public.kiosk_row_audit_trigger();

drop trigger if exists trg_test_statistics_audit on public.test_statistics;
create trigger trg_test_statistics_audit
  after insert or update or delete on public.test_statistics
  for each row execute function public.kiosk_row_audit_trigger();

drop trigger if exists trg_test_catalog_requests_audit on public.test_catalog_requests;
create trigger trg_test_catalog_requests_audit
  after insert or update or delete on public.test_catalog_requests
  for each row execute function public.kiosk_row_audit_trigger();

drop trigger if exists trg_user_test_assignments_audit on public.user_test_assignments;
create trigger trg_user_test_assignments_audit
  after insert or update or delete on public.user_test_assignments
  for each row execute function public.kiosk_row_audit_trigger();

-- 6. Proyectos / sesiones clínicas
drop trigger if exists trg_projects_audit on public.projects;
create trigger trg_projects_audit
  after insert or update or delete on public.projects
  for each row execute function public.kiosk_row_audit_trigger();

drop trigger if exists trg_project_subjects_audit on public.project_subjects;
create trigger trg_project_subjects_audit
  after insert or update or delete on public.project_subjects
  for each row execute function public.kiosk_row_audit_trigger();

drop trigger if exists trg_project_tests_audit on public.project_tests;
create trigger trg_project_tests_audit
  after insert or update or delete on public.project_tests
  for each row execute function public.kiosk_row_audit_trigger();

drop trigger if exists trg_project_subject_test_plans_audit on public.project_subject_test_plans;
create trigger trg_project_subject_test_plans_audit
  after insert or update or delete on public.project_subject_test_plans
  for each row execute function public.kiosk_row_audit_trigger();

drop trigger if exists trg_assessment_sessions_audit on public.assessment_sessions;
create trigger trg_assessment_sessions_audit
  after insert or update or delete on public.assessment_sessions
  for each row execute function public.kiosk_row_audit_trigger();

-- 7. Catálogo maestro
drop trigger if exists trg_master_test_catalog_audit on public.master_test_catalog;
create trigger trg_master_test_catalog_audit
  after insert or update or delete on public.master_test_catalog
  for each row execute function public.kiosk_row_audit_trigger();

drop trigger if exists trg_master_test_catalog_assets_audit on public.master_test_catalog_assets;
create trigger trg_master_test_catalog_assets_audit
  after insert or update or delete on public.master_test_catalog_assets
  for each row execute function public.kiosk_row_audit_trigger();

-- 8. GDPR / Compliance
drop trigger if exists trg_gdpr_deletion_queue_audit on public.gdpr_deletion_queue;
create trigger trg_gdpr_deletion_queue_audit
  after insert or update or delete on public.gdpr_deletion_queue
  for each row execute function public.kiosk_row_audit_trigger();

-- 9. Miscelánea
drop trigger if exists trg_attendances_audit on public.attendances;
create trigger trg_attendances_audit
  after insert or update or delete on public.attendances
  for each row execute function public.kiosk_row_audit_trigger();

drop trigger if exists trg_package_deliveries_audit on public.package_deliveries;
create trigger trg_package_deliveries_audit
  after insert or update or delete on public.package_deliveries
  for each row execute function public.kiosk_row_audit_trigger();

drop trigger if exists trg_dashboard_quick_notes_audit on public.dashboard_quick_notes;
create trigger trg_dashboard_quick_notes_audit
  after insert or update or delete on public.dashboard_quick_notes
  for each row execute function public.kiosk_row_audit_trigger();

-- 10. Alto volumen — triggers selectivos
drop trigger if exists trg_kiosk_sessions_audit on public.kiosk_sessions;
create trigger trg_kiosk_sessions_audit
  after update or delete on public.kiosk_sessions
  for each row execute function public.kiosk_row_audit_trigger();

drop trigger if exists trg_kiosk_auth_attempts_audit on public.kiosk_auth_attempts;
create trigger trg_kiosk_auth_attempts_audit
  after delete on public.kiosk_auth_attempts
  for each row execute function public.kiosk_row_audit_trigger();

drop trigger if exists trg_kiosk_payment_settlements_audit on public.kiosk_payment_settlements;
create trigger trg_kiosk_payment_settlements_audit
  after insert or update or delete on public.kiosk_payment_settlements
  for each row execute function public.kiosk_row_audit_trigger();

drop trigger if exists trg_token_blacklist_audit on public.token_blacklist;
create trigger trg_token_blacklist_audit
  after insert or update or delete on public.token_blacklist
  for each row execute function public.kiosk_row_audit_trigger_custom_pk('token_hash');

-- 11. Permisos
revoke all on public.kiosk_row_audit_log from anon, authenticated;
grant select, insert on public.kiosk_row_audit_log to service_role;

-- 12. Índice en row_pk
create index if not exists idx_kiosk_row_audit_log_row_pk
  on public.kiosk_row_audit_log (row_pk, created_at desc);;
