-- ============================================================================
-- MIGRATION: Analytics tables (demographics, statistics, history, notes)
-- Description: Creates tables for user demographics, test statistics,
--              assessment history, and clinical notes for analytics features
-- Date: 2026-02-04
-- ============================================================================

-- Ensure pgcrypto is available for UUID generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- TABLE: user_demographics
-- Description: Demographic data linked to users (1:1 relationship)
-- Used for analytics, norms calculation, and population segmentation
-- ============================================================================
CREATE TABLE public.user_demographics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  
  -- Demographic fields
  age INTEGER CHECK (age IS NULL OR (age >= 0 AND age <= 150)),
  gender TEXT CHECK (gender IS NULL OR gender IN ('male', 'female', 'non_binary', 'prefer_not_to_say', 'other')),
  education_level TEXT CHECK (education_level IS NULL OR education_level IN (
    'none', 'primary', 'secondary', 'vocational', 'bachelor', 'master', 'doctorate', 'other'
  )),
  occupation TEXT,
  country TEXT,
  region TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraints: one demographic record per user
  UNIQUE(user_id)
);

-- Indexes for efficient queries
CREATE INDEX idx_user_demographics_org ON public.user_demographics(organization_id);
CREATE INDEX idx_user_demographics_user ON public.user_demographics(user_id);
CREATE INDEX idx_user_demographics_country ON public.user_demographics(country);
CREATE INDEX idx_user_demographics_age ON public.user_demographics(age);

-- Trigger for updated_at
CREATE TRIGGER update_user_demographics_updated_at
  BEFORE UPDATE ON public.user_demographics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.user_demographics IS 'Demographic data linked to users for analytics and norms calculation (1:1 with users)';
COMMENT ON COLUMN public.user_demographics.age IS 'User age at registration (0-150)';
COMMENT ON COLUMN public.user_demographics.gender IS 'Gender: male, female, non_binary, prefer_not_to_say, other';
COMMENT ON COLUMN public.user_demographics.education_level IS 'Highest education level achieved';

-- ============================================================================
-- TABLE: assessment_history
-- Description: Longitudinal tracking of user assessments over time
-- Used for progress monitoring and outcome tracking
-- ============================================================================
CREATE TABLE public.assessment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  test_id UUID NOT NULL REFERENCES public.test_definitions(id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  response_id UUID REFERENCES public.responses(id) ON DELETE SET NULL,
  
  -- Score data
  score_total DECIMAL(10,4),
  score_data JSONB DEFAULT '{}'::jsonb,
  
  -- Assessment metadata
  assessment_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX idx_assessment_history_org ON public.assessment_history(organization_id);
CREATE INDEX idx_assessment_history_user ON public.assessment_history(user_id);
CREATE INDEX idx_assessment_history_test ON public.assessment_history(test_id);
CREATE INDEX idx_assessment_history_user_test ON public.assessment_history(user_id, test_id);
CREATE INDEX idx_assessment_history_date ON public.assessment_history(assessment_date DESC);
CREATE INDEX idx_assessment_history_response ON public.assessment_history(response_id);

COMMENT ON TABLE public.assessment_history IS 'Longitudinal assessment tracking for user progress monitoring';
COMMENT ON COLUMN public.assessment_history.score_total IS 'Total score from the assessment';
COMMENT ON COLUMN public.assessment_history.score_data IS 'Detailed score breakdown (domains, subscales, etc.)';
COMMENT ON COLUMN public.assessment_history.assessment_date IS 'Date when assessment was completed';

-- ============================================================================
-- TABLE: clinical_notes
-- Description: Encrypted clinical notes linked to responses
-- GDPR-compliant storage for sensitive clinical observations
-- ============================================================================
CREATE TABLE public.clinical_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  response_id UUID REFERENCES public.responses(id) ON DELETE SET NULL,
  clinician_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  
  -- Encrypted note content (AES-256 via pgcrypto)
  note_encrypted BYTEA NOT NULL,
  
  -- Note classification
  note_type TEXT CHECK (note_type IS NULL OR note_type IN (
    'clinical_observation', 'treatment_note', 'progress_note', 
    'assessment_interpretation', 'follow_up', 'other'
  )),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for efficient queries
CREATE INDEX idx_clinical_notes_org ON public.clinical_notes(organization_id);
CREATE INDEX idx_clinical_notes_user ON public.clinical_notes(user_id);
CREATE INDEX idx_clinical_notes_response ON public.clinical_notes(response_id);
CREATE INDEX idx_clinical_notes_clinician ON public.clinical_notes(clinician_id);
CREATE INDEX idx_clinical_notes_type ON public.clinical_notes(note_type);
CREATE INDEX idx_clinical_notes_created ON public.clinical_notes(created_at DESC);

-- Trigger for updated_at
CREATE TRIGGER update_clinical_notes_updated_at
  BEFORE UPDATE ON public.clinical_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.clinical_notes IS 'Encrypted clinical notes linked to responses (GDPR-compliant)';
COMMENT ON COLUMN public.clinical_notes.note_encrypted IS 'Clinical note encrypted with pgp_sym_encrypt (AES-256)';
COMMENT ON COLUMN public.clinical_notes.note_type IS 'Type: clinical_observation, treatment_note, progress_note, etc.';
COMMENT ON COLUMN public.clinical_notes.clinician_id IS 'User who created the note (must have clinician or admin role)';

-- ============================================================================
-- TABLE: test_statistics
-- Description: Aggregated metrics per test for analytics dashboards
-- Can be organization-specific or global (null organization_id)
-- ============================================================================
CREATE TABLE public.test_statistics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES public.test_definitions(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Response counts
  total_responses INTEGER NOT NULL DEFAULT 0 CHECK (total_responses >= 0),
  
  -- Score statistics
  avg_score DECIMAL(10,4),
  std_deviation DECIMAL(10,4),
  min_score DECIMAL(10,4),
  max_score DECIMAL(10,4),
  
  -- Completion metrics
  completion_rate DECIMAL(5,4) CHECK (completion_rate IS NULL OR (completion_rate >= 0 AND completion_rate <= 1)),
  avg_duration_seconds INTEGER CHECK (avg_duration_seconds IS NULL OR avg_duration_seconds >= 0),
  
  -- Calculation metadata
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Constraints: one statistics record per test per organization (null org = global)
  UNIQUE(test_id, organization_id)
);

-- Indexes for efficient queries
CREATE INDEX idx_test_statistics_org ON public.test_statistics(organization_id);
CREATE INDEX idx_test_statistics_test ON public.test_statistics(test_id);
CREATE INDEX idx_test_statistics_calculated ON public.test_statistics(calculated_at DESC);

COMMENT ON TABLE public.test_statistics IS 'Aggregated test metrics for analytics (org-specific or global)';
COMMENT ON COLUMN public.test_statistics.organization_id IS 'NULL for global statistics, otherwise org-specific';
COMMENT ON COLUMN public.test_statistics.total_responses IS 'Total number of responses for this test';
COMMENT ON COLUMN public.test_statistics.avg_score IS 'Average score across all completed responses';
COMMENT ON COLUMN public.test_statistics.std_deviation IS 'Standard deviation of scores';
COMMENT ON COLUMN public.test_statistics.completion_rate IS 'Ratio of completed vs total responses (0.0 to 1.0)';
COMMENT ON COLUMN public.test_statistics.avg_duration_seconds IS 'Average time to complete the test';
COMMENT ON COLUMN public.test_statistics.calculated_at IS 'When these statistics were last calculated';

-- ============================================================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE public.user_demographics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_statistics ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES: user_demographics
-- ============================================================================

-- Users can view their own demographics
CREATE POLICY "users_view_own_demographics"
  ON public.user_demographics FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM public.users WHERE auth_user_id = auth.uid()
    )
  );

-- Users can insert their own demographics
CREATE POLICY "users_insert_own_demographics"
  ON public.user_demographics FOR INSERT
  WITH CHECK (
    user_id IN (
      SELECT id FROM public.users WHERE auth_user_id = auth.uid()
    )
  );

-- Users can update their own demographics
CREATE POLICY "users_update_own_demographics"
  ON public.user_demographics FOR UPDATE
  USING (
    user_id IN (
      SELECT id FROM public.users WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    user_id IN (
      SELECT id FROM public.users WHERE auth_user_id = auth.uid()
    )
  );

-- Staff (admin/clinician) can view demographics in their organization
CREATE POLICY "staff_view_org_demographics"
  ON public.user_demographics FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

-- Admins can manage all demographics in their organization
CREATE POLICY "admins_manage_org_demographics"
  ON public.user_demographics FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  );

-- Service role bypass for backend operations
CREATE POLICY "service_role_user_demographics"
  ON public.user_demographics FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- RLS POLICIES: assessment_history
-- ============================================================================

-- Users can view their own assessment history
CREATE POLICY "users_view_own_assessment_history"
  ON public.assessment_history FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM public.users WHERE auth_user_id = auth.uid()
    )
  );

-- Staff (admin/clinician) can view assessment history in their organization
CREATE POLICY "staff_view_org_assessment_history"
  ON public.assessment_history FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

-- Staff can insert assessment history in their organization
CREATE POLICY "staff_insert_org_assessment_history"
  ON public.assessment_history FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

-- Service role bypass for backend operations
CREATE POLICY "service_role_assessment_history"
  ON public.assessment_history FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- RLS POLICIES: clinical_notes
-- ============================================================================

-- Staff can view clinical notes in their organization
CREATE POLICY "staff_view_org_clinical_notes"
  ON public.clinical_notes FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

-- Staff can insert clinical notes in their organization
CREATE POLICY "staff_insert_org_clinical_notes"
  ON public.clinical_notes FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

-- Staff can update their own clinical notes
CREATE POLICY "staff_update_own_clinical_notes"
  ON public.clinical_notes FOR UPDATE
  USING (
    clinician_id IN (
      SELECT id FROM public.users WHERE auth_user_id = auth.uid()
    )
  )
  WITH CHECK (
    clinician_id IN (
      SELECT id FROM public.users WHERE auth_user_id = auth.uid()
    )
  );

-- Admins can delete clinical notes in their organization
CREATE POLICY "admins_delete_org_clinical_notes"
  ON public.clinical_notes FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  );

-- Service role bypass for backend operations
CREATE POLICY "service_role_clinical_notes"
  ON public.clinical_notes FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- RLS POLICIES: test_statistics
-- ============================================================================

-- Staff can view statistics for their organization or global stats
CREATE POLICY "staff_view_org_test_statistics"
  ON public.test_statistics FOR SELECT
  USING (
    organization_id IS NULL
    OR organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

-- Only service role can manage statistics (calculated by backend jobs)
CREATE POLICY "service_role_manage_test_statistics"
  ON public.test_statistics FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);;
