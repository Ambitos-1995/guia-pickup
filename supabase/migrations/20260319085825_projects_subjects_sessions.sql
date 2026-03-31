-- Migration 027: Projects, subjects enrolment, project batteries and assisted sessions

CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('protocol', 'subvencion', 'programa', 'clinical_case')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'archived')),
  subject_label TEXT NOT NULL DEFAULT 'subject'
    CHECK (subject_label IN ('subject', 'patient', 'participant')),
  description TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT projects_name_check CHECK (length(trim(name)) >= 2),
  CONSTRAINT projects_code_check CHECK (code ~ '^[A-Z0-9-]+$'),
  UNIQUE(organization_id, code)
);

CREATE INDEX idx_projects_org ON public.projects(organization_id);
CREATE INDEX idx_projects_org_status ON public.projects(organization_id, status);
CREATE INDEX idx_projects_created_by ON public.projects(created_by);

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.project_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  subject_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'withdrawn')),
  enrollment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(project_id, subject_user_id)
);

CREATE INDEX idx_project_subjects_project ON public.project_subjects(project_id);
CREATE INDEX idx_project_subjects_subject ON public.project_subjects(subject_user_id);
CREATE INDEX idx_project_subjects_org ON public.project_subjects(organization_id);
CREATE INDEX idx_project_subjects_status ON public.project_subjects(status);

CREATE TRIGGER update_project_subjects_updated_at
  BEFORE UPDATE ON public.project_subjects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.project_tests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  test_id UUID NOT NULL REFERENCES public.test_definitions(id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  required BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE(project_id, test_id)
);

CREATE INDEX idx_project_tests_project ON public.project_tests(project_id);
CREATE INDEX idx_project_tests_test ON public.project_tests(test_id);
CREATE INDEX idx_project_tests_org ON public.project_tests(organization_id);
CREATE INDEX idx_project_tests_active ON public.project_tests(project_id, active);

CREATE TRIGGER update_project_tests_updated_at
  BEFORE UPDATE ON public.project_tests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TABLE public.assessment_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  subject_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  test_id UUID NOT NULL REFERENCES public.test_definitions(id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  started_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  response_id UUID REFERENCES public.responses(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT assessment_sessions_completed_check CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR (status <> 'completed')
  )
);

CREATE INDEX idx_assessment_sessions_project ON public.assessment_sessions(project_id);
CREATE INDEX idx_assessment_sessions_subject ON public.assessment_sessions(subject_user_id);
CREATE INDEX idx_assessment_sessions_test ON public.assessment_sessions(test_id);
CREATE INDEX idx_assessment_sessions_org ON public.assessment_sessions(organization_id);
CREATE INDEX idx_assessment_sessions_status ON public.assessment_sessions(status);
CREATE INDEX idx_assessment_sessions_project_status
  ON public.assessment_sessions(project_id, status);

CREATE TRIGGER update_assessment_sessions_updated_at
  BEFORE UPDATE ON public.assessment_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.user_test_assignments
  ADD COLUMN project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE public.assessment_history
  ADD COLUMN project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE public.responses
  ADD COLUMN project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

ALTER TABLE public.scores
  ADD COLUMN project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

CREATE INDEX idx_uta_project ON public.user_test_assignments(project_id);
CREATE INDEX idx_assessment_history_project ON public.assessment_history(project_id);
CREATE INDEX idx_responses_project ON public.responses(project_id);
CREATE INDEX idx_scores_project ON public.scores(project_id);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_view_org_projects"
  ON public.projects FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

CREATE POLICY "staff_insert_org_projects"
  ON public.projects FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

CREATE POLICY "staff_update_org_projects"
  ON public.projects FOR UPDATE
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

CREATE POLICY "service_role_projects"
  ON public.projects FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "staff_view_org_project_subjects"
  ON public.project_subjects FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

CREATE POLICY "staff_insert_org_project_subjects"
  ON public.project_subjects FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

CREATE POLICY "staff_update_org_project_subjects"
  ON public.project_subjects FOR UPDATE
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

CREATE POLICY "service_role_project_subjects"
  ON public.project_subjects FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "staff_view_org_project_tests"
  ON public.project_tests FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

CREATE POLICY "staff_insert_org_project_tests"
  ON public.project_tests FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

CREATE POLICY "staff_update_org_project_tests"
  ON public.project_tests FOR UPDATE
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

CREATE POLICY "service_role_project_tests"
  ON public.project_tests FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "staff_view_org_assessment_sessions"
  ON public.assessment_sessions FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

CREATE POLICY "staff_insert_org_assessment_sessions"
  ON public.assessment_sessions FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

CREATE POLICY "staff_update_org_assessment_sessions"
  ON public.assessment_sessions FOR UPDATE
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

CREATE POLICY "service_role_assessment_sessions"
  ON public.assessment_sessions FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.projects IS
  'Operational projects or protocols inside a tenant. Primary entry point for assisted assessments.';
COMMENT ON TABLE public.project_subjects IS
  'Reusable subject enrolment in a project. Subjects remain users with role respondent in v1.';
COMMENT ON TABLE public.project_tests IS
  'Battery or protocol of tests enabled for a project.';
COMMENT ON TABLE public.assessment_sessions IS
  'Staff-assisted assessment execution sessions linked to project, subject and test.';;
