-- ============================================================================
-- TABLE: test_norms
-- ============================================================================
CREATE TABLE public.test_norms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID REFERENCES public.test_definitions(id) ON DELETE SET NULL,
  test_type TEXT NOT NULL,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  population TEXT,
  age_min INT,
  age_max INT,
  gender TEXT,
  education_level TEXT,
  sample_size INT,
  mean_score DECIMAL(10,4),
  std_deviation DECIMAL(10,4),
  percentile_10 DECIMAL(10,4),
  percentile_25 DECIMAL(10,4),
  percentile_50 DECIMAL(10,4),
  percentile_75 DECIMAL(10,4),
  percentile_90 DECIMAL(10,4),
  source_study TEXT,
  publication_year INT,
  country TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_test_norms_org ON public.test_norms(organization_id);
CREATE INDEX idx_test_norms_test ON public.test_norms(test_id);
CREATE INDEX idx_test_norms_type ON public.test_norms(test_type);

COMMENT ON TABLE public.test_norms IS 'Normative data for test interpretation';

-- Enable RLS
ALTER TABLE public.test_norms ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "users_view_org_or_global_norms"
  ON public.test_norms FOR SELECT
  USING (
    organization_id IS NULL
    OR organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "admins_manage_org_norms"
  ON public.test_norms FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "service_role_manage_test_norms"
  ON public.test_norms FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);;
