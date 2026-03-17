-- Migration: user_test_assignments
-- Assigns specific tests to specific users. Respondents only see tests assigned to them.

CREATE TABLE public.user_test_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  test_id UUID NOT NULL REFERENCES public.test_definitions(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  assigned_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'assigned'
    CHECK (status IN ('assigned', 'in_progress', 'completed', 'cancelled')),
  priority INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  due_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, test_id)
);

CREATE INDEX idx_uta_user ON public.user_test_assignments(user_id);
CREATE INDEX idx_uta_test ON public.user_test_assignments(test_id);
CREATE INDEX idx_uta_org ON public.user_test_assignments(organization_id);
CREATE INDEX idx_uta_status ON public.user_test_assignments(status);
CREATE INDEX idx_uta_user_status ON public.user_test_assignments(user_id, status);

CREATE TRIGGER update_user_test_assignments_updated_at
  BEFORE UPDATE ON public.user_test_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.user_test_assignments IS
  'Explicit test assignments per user. Respondents only see tests assigned to them.';

-- RLS
ALTER TABLE public.user_test_assignments ENABLE ROW LEVEL SECURITY;

-- Respondents see their own assignments
CREATE POLICY "respondents_view_own_assignments"
  ON public.user_test_assignments FOR SELECT
  USING (
    user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  );

-- Staff see all assignments in their org
CREATE POLICY "staff_view_org_assignments"
  ON public.user_test_assignments FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

-- Staff insert assignments in their org
CREATE POLICY "staff_insert_org_assignments"
  ON public.user_test_assignments FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

-- Staff update assignments in their org
CREATE POLICY "staff_update_org_assignments"
  ON public.user_test_assignments FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

-- Staff delete assignments in their org
CREATE POLICY "staff_delete_org_assignments"
  ON public.user_test_assignments FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

-- Service role full access
CREATE POLICY "service_role_assignments"
  ON public.user_test_assignments FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);
;
