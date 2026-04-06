-- ============================================================
-- ADD MISSING FK INDEXES
-- Using CREATE INDEX (without CONCURRENTLY) inside migration transaction
-- ============================================================

-- assessment_sessions: plan_id, response_id, started_by
CREATE INDEX IF NOT EXISTS idx_assessment_sessions_plan_id
  ON public.assessment_sessions(plan_id);

CREATE INDEX IF NOT EXISTS idx_assessment_sessions_response_id
  ON public.assessment_sessions(response_id);

CREATE INDEX IF NOT EXISTS idx_assessment_sessions_started_by
  ON public.assessment_sessions(started_by);

-- gdpr_deletion_queue: requested_by
CREATE INDEX IF NOT EXISTS idx_gdpr_deletion_queue_requested_by
  ON public.gdpr_deletion_queue(requested_by);

-- kiosk_debug_attendance_attempts: actor_session_id, slot_id
CREATE INDEX IF NOT EXISTS idx_kiosk_debug_attendance_actor_session
  ON public.kiosk_debug_attendance_attempts(actor_session_id);

CREATE INDEX IF NOT EXISTS idx_kiosk_debug_attendance_slot_id
  ON public.kiosk_debug_attendance_attempts(slot_id);

-- kiosk_debug_client_reports: actor_session_id, employee_id, organization_id
CREATE INDEX IF NOT EXISTS idx_kiosk_debug_client_reports_actor_session
  ON public.kiosk_debug_client_reports(actor_session_id);

CREATE INDEX IF NOT EXISTS idx_kiosk_debug_client_reports_employee
  ON public.kiosk_debug_client_reports(employee_id);

CREATE INDEX IF NOT EXISTS idx_kiosk_debug_client_reports_org
  ON public.kiosk_debug_client_reports(organization_id);

-- kiosk_debug_events: actor_session_id, employee_id
CREATE INDEX IF NOT EXISTS idx_kiosk_debug_events_actor_session
  ON public.kiosk_debug_events(actor_session_id);

CREATE INDEX IF NOT EXISTS idx_kiosk_debug_events_employee
  ON public.kiosk_debug_events(employee_id);

-- kiosk_debug_schedule_mutations: actor_employee_id, actor_session_id, target_employee_id
CREATE INDEX IF NOT EXISTS idx_kiosk_debug_schedule_actor_employee
  ON public.kiosk_debug_schedule_mutations(actor_employee_id);

CREATE INDEX IF NOT EXISTS idx_kiosk_debug_schedule_actor_session
  ON public.kiosk_debug_schedule_mutations(actor_session_id);

CREATE INDEX IF NOT EXISTS idx_kiosk_debug_schedule_target_employee
  ON public.kiosk_debug_schedule_mutations(target_employee_id);

-- kiosk_edge_errors: organization_id
CREATE INDEX IF NOT EXISTS idx_kiosk_edge_errors_org
  ON public.kiosk_edge_errors(organization_id);

-- kiosk_payment_receipts: settlement_id
CREATE INDEX IF NOT EXISTS idx_kiosk_payment_receipts_settlement
  ON public.kiosk_payment_receipts(settlement_id);

-- project_subject_test_plans: created_by, last_session_id, project_subject_id, project_test_id
CREATE INDEX IF NOT EXISTS idx_project_subject_test_plans_created_by
  ON public.project_subject_test_plans(created_by);

CREATE INDEX IF NOT EXISTS idx_project_subject_test_plans_last_session
  ON public.project_subject_test_plans(last_session_id);

CREATE INDEX IF NOT EXISTS idx_project_subject_test_plans_subject_id
  ON public.project_subject_test_plans(project_subject_id);

CREATE INDEX IF NOT EXISTS idx_project_subject_test_plans_pt_id
  ON public.project_subject_test_plans(project_test_id);

-- project_subjects: created_by
CREATE INDEX IF NOT EXISTS idx_project_subjects_created_by
  ON public.project_subjects(created_by);

-- project_tests: created_by
CREATE INDEX IF NOT EXISTS idx_project_tests_created_by
  ON public.project_tests(created_by);

-- test_catalog_requests: created_test_id, reviewed_by
CREATE INDEX IF NOT EXISTS idx_test_catalog_requests_created_test
  ON public.test_catalog_requests(created_test_id);

CREATE INDEX IF NOT EXISTS idx_test_catalog_requests_reviewed_by
  ON public.test_catalog_requests(reviewed_by);

-- test_definitions: approved_by, source_catalog_id, validated_by
CREATE INDEX IF NOT EXISTS idx_test_definitions_approved_by
  ON public.test_definitions(approved_by);

CREATE INDEX IF NOT EXISTS idx_test_definitions_source_catalog_id
  ON public.test_definitions(source_catalog_id);

CREATE INDEX IF NOT EXISTS idx_test_definitions_validated_by
  ON public.test_definitions(validated_by);

-- user_test_assignments: assigned_by
CREATE INDEX IF NOT EXISTS idx_uta_assigned_by
  ON public.user_test_assignments(assigned_by);;
