-- ============================================================================
-- Migration: Consolidate Duplicate RLS Policies
-- Purpose: Improve performance by merging multiple permissive SELECT policies
-- into single unified policies per table
-- ============================================================================

-- ============================================================================
-- 1. ATTENDANCES - Consolidate 3 SELECT policies into 1
-- ============================================================================
-- Current policies:
-- - admins_manage_attendances (ALL): admin de la org
-- - staff_view_org_attendances (SELECT): admin/clinician de la org  
-- - users_view_own_attendances (SELECT): usuario ve sus propias
--
-- The ALL policy already covers admins, so we need:
-- - Keep ALL for admins (manages all operations)
-- - Consolidate SELECT: staff de la org OR propias del usuario

DROP POLICY IF EXISTS "staff_view_org_attendances" ON attendances;
DROP POLICY IF EXISTS "users_view_own_attendances" ON attendances;

CREATE POLICY "select_attendances_unified" ON attendances
FOR SELECT USING (
  -- Staff (admin/clinician) can view all org attendances
  organization_id IN (
    SELECT u.organization_id FROM users u
    WHERE u.auth_user_id = (SELECT auth.uid())
    AND u.role IN ('admin', 'clinician')
  )
  OR
  -- Users can view their own attendances
  user_id IN (
    SELECT u.id FROM users u
    WHERE u.auth_user_id = (SELECT auth.uid())
  )
);

-- ============================================================================
-- 2. EMPLOYEE_PROFILES - Consolidate 3 SELECT policies into 1
-- ============================================================================
-- Current policies:
-- - admins_manage_employee_profiles (ALL): admin de la org
-- - staff_view_org_employee_profiles (SELECT): admin/clinician de la org
-- - users_view_own_employee_profile (SELECT): usuario ve su propio perfil

DROP POLICY IF EXISTS "staff_view_org_employee_profiles" ON employee_profiles;
DROP POLICY IF EXISTS "users_view_own_employee_profile" ON employee_profiles;

CREATE POLICY "select_employee_profiles_unified" ON employee_profiles
FOR SELECT USING (
  -- Staff (admin/clinician) can view all org profiles
  organization_id IN (
    SELECT u.organization_id FROM users u
    WHERE u.auth_user_id = (SELECT auth.uid())
    AND u.role IN ('admin', 'clinician')
  )
  OR
  -- Users can view their own profile
  user_id IN (
    SELECT u.id FROM users u
    WHERE u.auth_user_id = (SELECT auth.uid())
  )
);

-- ============================================================================
-- 3. INVITATIONS - Consolidate 2 SELECT policies into 1
-- ============================================================================
-- Current policies:
-- - Admins can view org invitations (SELECT): admin de la org
-- - Users can view their own pending invitations (SELECT): usuario ve sus invitaciones pendientes

DROP POLICY IF EXISTS "Admins can view org invitations" ON invitations;
DROP POLICY IF EXISTS "Users can view their own pending invitations" ON invitations;

CREATE POLICY "select_invitations_unified" ON invitations
FOR SELECT USING (
  -- Admins can view all org invitations
  organization_id IN (
    SELECT u.organization_id FROM users u
    WHERE u.auth_user_id = (SELECT auth.uid())
    AND u.role = 'admin'
  )
  OR
  -- Users can view their own pending invitations
  (
    email = (SELECT users.email FROM auth.users WHERE users.id = (SELECT auth.uid()))::text
    AND accepted_at IS NULL
    AND expires_at > now()
  )
);

-- ============================================================================
-- 4. PACKAGE_DELIVERIES - Consolidate 2 SELECT policies into 1
-- ============================================================================
-- Current policies:
-- - admins_manage_packages (ALL): admin de la org - keep this
-- - staff_view_org_packages (SELECT): admin/clinician de la org
--
-- Since ALL policy only covers admins, we need SELECT for clinicians too

DROP POLICY IF EXISTS "staff_view_org_packages" ON package_deliveries;

CREATE POLICY "select_package_deliveries_unified" ON package_deliveries
FOR SELECT USING (
  -- Staff (admin/clinician) can view all org packages
  organization_id IN (
    SELECT u.organization_id FROM users u
    WHERE u.auth_user_id = (SELECT auth.uid())
    AND u.role IN ('admin', 'clinician')
  )
);

-- ============================================================================
-- 5. REPORTS - Consolidate 2 SELECT policies into 1
-- ============================================================================
-- Current policies:
-- - Usuario ve sus propios reportes (SELECT): via response_id
-- - users_view_own_reports_by_user_id (SELECT): via user_id directo

DROP POLICY IF EXISTS "Usuario ve sus propios reportes" ON reports;
DROP POLICY IF EXISTS "users_view_own_reports_by_user_id" ON reports;

CREATE POLICY "select_reports_unified" ON reports
FOR SELECT USING (
  -- User can view reports by direct user_id match
  user_id IN (
    SELECT u.id FROM users u
    WHERE u.auth_user_id = (SELECT auth.uid())
  )
  OR
  -- User can view reports by response_id ownership
  response_id IN (
    SELECT r.id FROM responses r
    WHERE r.user_id IN (
      SELECT u.id FROM users u
      WHERE u.auth_user_id = (SELECT auth.uid())
    )
  )
);

-- ============================================================================
-- 6. TEST_NORMS - Consolidate 2 SELECT policies into 1
-- ============================================================================
-- Current policies:
-- - admins_manage_org_norms (ALL): admin de la org - keep this
-- - users_view_org_or_global_norms (SELECT): global or org norms

DROP POLICY IF EXISTS "users_view_org_or_global_norms" ON test_norms;

CREATE POLICY "select_test_norms_unified" ON test_norms
FOR SELECT USING (
  -- Everyone can view global norms (organization_id IS NULL)
  organization_id IS NULL
  OR
  -- Users can view their org's norms
  organization_id IN (
    SELECT u.organization_id FROM users u
    WHERE u.auth_user_id = (SELECT auth.uid())
  )
);

-- ============================================================================
-- Summary of changes:
-- - attendances: 3 SELECT -> 1 unified SELECT
-- - employee_profiles: 3 SELECT -> 1 unified SELECT  
-- - invitations: 2 SELECT -> 1 unified SELECT
-- - package_deliveries: 2 SELECT -> 1 unified SELECT
-- - reports: 2 SELECT -> 1 unified SELECT
-- - test_norms: 2 SELECT -> 1 unified SELECT
--
-- Total: 14 SELECT policies reduced to 6 unified policies
-- Performance improvement: PostgreSQL evaluates fewer policies per query
-- ============================================================================;
