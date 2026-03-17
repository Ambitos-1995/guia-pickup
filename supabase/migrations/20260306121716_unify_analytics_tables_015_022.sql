
-- ============================================================================
-- CORRECTIVE MIGRATION: Unify analytics tables (resolves conflict 015 vs 022)
-- 
-- Migration 015 (admin_analytics_test_norms) created tables with one schema.
-- Migration 022 (add_analytics_tables) dropped and recreated with different columns.
-- This migration reconciles the live DB (022 schema) with what the services expect.
--
-- Strategy: ADD missing columns from 015 that services reference,
--           KEEP good additions from 022 (CHECK constraints, BYTEA encryption, user_id on clinical_notes)
-- ============================================================================

-- ============================================================================
-- 1. user_demographics: Add columns services expect from migration 015
-- ============================================================================

-- Add date_of_birth (services use calculateAge from this)
ALTER TABLE public.user_demographics 
  ADD COLUMN IF NOT EXISTS date_of_birth DATE;

-- Add employment_status (services reference this for distribution)
ALTER TABLE public.user_demographics 
  ADD COLUMN IF NOT EXISTS employment_status TEXT;

-- Add country_of_residence (services reference this for data quality)
ALTER TABLE public.user_demographics 
  ADD COLUMN IF NOT EXISTS country_of_residence TEXT;

-- Add primary_language (services reference this for data quality)
ALTER TABLE public.user_demographics 
  ADD COLUMN IF NOT EXISTS primary_language TEXT;

-- Add has_diagnosis (services reference this for diagnosis rate)
ALTER TABLE public.user_demographics 
  ADD COLUMN IF NOT EXISTS has_diagnosis BOOLEAN DEFAULT false;

-- Add current_treatment (services reference this for treatment rate)
ALTER TABLE public.user_demographics 
  ADD COLUMN IF NOT EXISTS current_treatment BOOLEAN DEFAULT false;

COMMENT ON TABLE public.user_demographics IS 'Demographic data linked to users for analytics and norms (1:1 with users). Unified schema from migrations 015+022.';
COMMENT ON COLUMN public.user_demographics.date_of_birth IS 'Date of birth for age calculation';
COMMENT ON COLUMN public.user_demographics.age IS 'User age at registration (0-150), alternative to date_of_birth';
COMMENT ON COLUMN public.user_demographics.has_diagnosis IS 'Whether user has a clinical diagnosis';
COMMENT ON COLUMN public.user_demographics.current_treatment IS 'Whether user is currently in treatment';

-- ============================================================================
-- 2. assessment_history: Add columns from migration 015 that services reference
-- ============================================================================

-- Add score_id FK (015 had this, 022 dropped it)
ALTER TABLE public.assessment_history
  ADD COLUMN IF NOT EXISTS score_id UUID REFERENCES public.scores(id) ON DELETE SET NULL;

-- Add percentile (services reference this)
ALTER TABLE public.assessment_history
  ADD COLUMN IF NOT EXISTS percentile DECIMAL(5,2);

-- Add severity_level (services reference this)
ALTER TABLE public.assessment_history
  ADD COLUMN IF NOT EXISTS severity_level TEXT;

-- Add compared_to_previous (015 had this for trend tracking)
ALTER TABLE public.assessment_history
  ADD COLUMN IF NOT EXISTS compared_to_previous TEXT 
  CHECK (compared_to_previous IS NULL OR compared_to_previous IN ('improved', 'stable', 'worsened'));

-- Add change_amount (015 had this for quantifying change)
ALTER TABLE public.assessment_history
  ADD COLUMN IF NOT EXISTS change_amount DECIMAL(10,4);

-- Add clinically_significant (015 had this)
ALTER TABLE public.assessment_history
  ADD COLUMN IF NOT EXISTS clinically_significant BOOLEAN DEFAULT false;

-- Rename score_total to total_score to match what services expect
-- (022 used score_total, services use total_score)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'assessment_history' AND column_name = 'score_total'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'assessment_history' AND column_name = 'total_score'
  ) THEN
    ALTER TABLE public.assessment_history RENAME COLUMN score_total TO total_score;
  END IF;
END $$;

-- Add index on score_id if not exists
CREATE INDEX IF NOT EXISTS idx_assessment_history_score ON public.assessment_history(score_id);

COMMENT ON TABLE public.assessment_history IS 'Longitudinal assessment tracking. Unified schema from migrations 015+022.';

-- ============================================================================
-- 3. test_statistics: Add columns from migration 015 for richer stats
-- ============================================================================

-- Add period column (015 had period-based stats)
ALTER TABLE public.test_statistics
  ADD COLUMN IF NOT EXISTS period TEXT CHECK (period IS NULL OR period IN ('daily', 'weekly', 'monthly', 'all_time'));

-- Add period_start / period_end
ALTER TABLE public.test_statistics
  ADD COLUMN IF NOT EXISTS period_start DATE;

ALTER TABLE public.test_statistics
  ADD COLUMN IF NOT EXISTS period_end DATE;

-- Add completed_responses
ALTER TABLE public.test_statistics
  ADD COLUMN IF NOT EXISTS completed_responses INT DEFAULT 0;

-- Add abandoned_responses
ALTER TABLE public.test_statistics
  ADD COLUMN IF NOT EXISTS abandoned_responses INT DEFAULT 0;

-- Add mean_score (015 used this name, 022 used avg_score)
ALTER TABLE public.test_statistics
  ADD COLUMN IF NOT EXISTS mean_score DECIMAL(10,4);

-- Add median_score
ALTER TABLE public.test_statistics
  ADD COLUMN IF NOT EXISTS median_score DECIMAL(10,4);

-- Add percentiles from 015
ALTER TABLE public.test_statistics
  ADD COLUMN IF NOT EXISTS percentile_10 DECIMAL(10,4);

ALTER TABLE public.test_statistics
  ADD COLUMN IF NOT EXISTS percentile_25 DECIMAL(10,4);

ALTER TABLE public.test_statistics
  ADD COLUMN IF NOT EXISTS percentile_50 DECIMAL(10,4);

ALTER TABLE public.test_statistics
  ADD COLUMN IF NOT EXISTS percentile_75 DECIMAL(10,4);

ALTER TABLE public.test_statistics
  ADD COLUMN IF NOT EXISTS percentile_90 DECIMAL(10,4);

-- Add avg_completion_time_seconds (015 name vs 022 avg_duration_seconds)
ALTER TABLE public.test_statistics
  ADD COLUMN IF NOT EXISTS avg_completion_time_seconds INT;

COMMENT ON TABLE public.test_statistics IS 'Aggregated test metrics for analytics. Unified schema from migrations 015+022.';

-- ============================================================================
-- 4. Verify RLS is still enabled (should be, but double-check)
-- ============================================================================
ALTER TABLE public.user_demographics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_norms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_notes ENABLE ROW LEVEL SECURITY;
;
