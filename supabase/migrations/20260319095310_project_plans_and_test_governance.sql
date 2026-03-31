-- Migration 029: Subject-level project plans and test governance metadata

ALTER TABLE public.test_definitions
  ADD COLUMN validation_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (validation_status IN ('draft', 'under_review', 'validated', 'approved', 'rejected')),
  ADD COLUMN source_kind TEXT NOT NULL DEFAULT 'manual'
    CHECK (source_kind IN ('manual', 'official_pdf', 'external_reference', 'master_catalog')),
  ADD COLUMN source_catalog_id TEXT REFERENCES public.master_test_catalog(id) ON DELETE SET NULL,
  ADD COLUMN official_source_url TEXT,
  ADD COLUMN source_repository_path TEXT,
  ADD COLUMN validated_at TIMESTAMPTZ,
  ADD COLUMN validated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN validation_notes TEXT,
  ADD COLUMN import_metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE INDEX idx_test_definitions_validation_status
  ON public.test_definitions(organization_id, validation_status);

CREATE INDEX idx_test_definitions_source_kind
  ON public.test_definitions(organization_id, source_kind);

ALTER TABLE public.assessment_sessions
  ADD COLUMN mode TEXT NOT NULL DEFAULT 'ad_hoc'
    CHECK (mode IN ('planned', 'ad_hoc')),
  ADD COLUMN plan_id UUID;

CREATE TABLE public.project_subject_test_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  subject_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  test_id UUID NOT NULL REFERENCES public.test_definitions(id) ON DELETE RESTRICT,
  project_subject_id UUID NOT NULL REFERENCES public.project_subjects(id) ON DELETE CASCADE,
  project_test_id UUID NOT NULL REFERENCES public.project_tests(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  due_at TIMESTAMPTZ,
  next_due_at TIMESTAMPTZ,
  last_started_at TIMESTAMPTZ,
  last_completed_at TIMESTAMPTZ,
  last_session_id UUID,
  recurrence_unit TEXT
    CHECK (recurrence_unit IN ('days', 'weeks', 'months')),
  recurrence_interval INTEGER
    CHECK (recurrence_interval IS NULL OR recurrence_interval > 0),
  auto_reschedule_on_complete BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT project_subject_test_plans_recurrence_check CHECK (
    (recurrence_unit IS NULL AND recurrence_interval IS NULL)
    OR (recurrence_unit IS NOT NULL AND recurrence_interval IS NOT NULL)
  )
);

ALTER TABLE public.project_subject_test_plans
  ADD CONSTRAINT project_subject_test_plans_last_session_fkey
  FOREIGN KEY (last_session_id)
  REFERENCES public.assessment_sessions(id)
  ON DELETE SET NULL;

ALTER TABLE public.assessment_sessions
  ADD CONSTRAINT assessment_sessions_plan_id_fkey
  FOREIGN KEY (plan_id)
  REFERENCES public.project_subject_test_plans(id)
  ON DELETE SET NULL;

CREATE UNIQUE INDEX idx_project_subject_test_plans_active_unique
  ON public.project_subject_test_plans(project_id, subject_user_id, test_id)
  WHERE status IN ('active', 'paused');

CREATE INDEX idx_project_subject_test_plans_project
  ON public.project_subject_test_plans(project_id);

CREATE INDEX idx_project_subject_test_plans_subject
  ON public.project_subject_test_plans(subject_user_id);

CREATE INDEX idx_project_subject_test_plans_test
  ON public.project_subject_test_plans(test_id);

CREATE INDEX idx_project_subject_test_plans_org
  ON public.project_subject_test_plans(organization_id);

CREATE INDEX idx_project_subject_test_plans_status
  ON public.project_subject_test_plans(project_id, status);

CREATE INDEX idx_project_subject_test_plans_due
  ON public.project_subject_test_plans(project_id, due_at);

CREATE TRIGGER update_project_subject_test_plans_updated_at
  BEFORE UPDATE ON public.project_subject_test_plans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.project_subject_test_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_view_org_project_subject_test_plans"
  ON public.project_subject_test_plans FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

CREATE POLICY "staff_insert_org_project_subject_test_plans"
  ON public.project_subject_test_plans FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

CREATE POLICY "staff_update_org_project_subject_test_plans"
  ON public.project_subject_test_plans FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

CREATE POLICY "service_role_project_subject_test_plans"
  ON public.project_subject_test_plans FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.project_subject_test_plans IS
  'Subject-level planned assessments inside a project, including due dates and simple recurrence.';;
