-- ================================================
-- MIGRATION: Alter Reports Table - Add missing columns
-- ================================================
-- Description: Adds user_id and format columns to existing reports table
-- Note: The reports table was created in 00000000000000_initial_schema.sql
-- This migration adds columns needed for API compatibility
-- Date: 2026-01-21

-- Add user_id column (nullable for backwards compatibility)
ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES public.users(id) ON DELETE CASCADE;

-- Add format column with default
ALTER TABLE public.reports
ADD COLUMN IF NOT EXISTS format TEXT DEFAULT 'pdf';

-- Create index on user_id
CREATE INDEX IF NOT EXISTS idx_reports_user_id ON public.reports(user_id);

-- Update RLS policy to include user_id access
DROP POLICY IF EXISTS "users_view_own_reports_by_user_id" ON public.reports;
CREATE POLICY "users_view_own_reports_by_user_id"
  ON public.reports FOR SELECT
  USING (user_id IN (
    SELECT id FROM public.users WHERE auth_user_id = auth.uid()
  ));;
