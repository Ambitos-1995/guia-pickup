-- Migration: fix_rls_policies
-- Purpose: Fix permissive RLS policies that allow any authenticated user to INSERT into sensitive tables
-- Security Issue: WITH CHECK (true) on INSERT policies allows unauthorized data manipulation
-- Solution: Restrict INSERT operations to service_role only

-- ============================================================================
-- AUDIT_LOGS TABLE
-- ============================================================================
-- Drop the permissive policy that allows any authenticated user to insert
DROP POLICY IF EXISTS "system_insert_audit_logs" ON public.audit_logs;

-- Create restrictive policy: only service_role can insert audit logs
CREATE POLICY "service_role_insert_audit_logs"
  ON public.audit_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ============================================================================
-- TOKEN_BLACKLIST TABLE
-- ============================================================================
-- Drop the permissive policy that allows any authenticated user to insert
DROP POLICY IF EXISTS "system_insert_blacklisted_tokens" ON public.token_blacklist;

-- Create restrictive policy: only service_role can insert blacklisted tokens
CREATE POLICY "service_role_insert_blacklisted_tokens"
  ON public.token_blacklist FOR INSERT
  TO service_role
  WITH CHECK (true);

-- ============================================================================
-- DATA_RETENTION_LOGS TABLE
-- ============================================================================
-- Drop the permissive policy that allows any authenticated user to insert
DROP POLICY IF EXISTS "system_insert_retention_logs" ON public.data_retention_logs;

-- Create restrictive policy: only service_role can insert retention logs
CREATE POLICY "service_role_insert_retention_logs"
  ON public.data_retention_logs FOR INSERT
  TO service_role
  WITH CHECK (true);;
