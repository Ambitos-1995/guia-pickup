-- Migration: Optimize RLS Policies Performance
-- Issue: RLS policies re-evaluate auth.uid() for each row
-- Solution: Replace auth.uid() with (select auth.uid()) for initplan optimization
-- Reference: https://supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select

-- =====================================================
-- ATTENDANCES TABLE (3 policies)
-- =====================================================

DROP POLICY IF EXISTS "admins_manage_attendances" ON public.attendances;
CREATE POLICY "admins_manage_attendances" ON public.attendances
  FOR ALL
  USING (organization_id IN (
    SELECT users.organization_id
    FROM users
    WHERE users.auth_user_id = (select auth.uid())
      AND users.role = 'admin'
  ));

DROP POLICY IF EXISTS "staff_view_org_attendances" ON public.attendances;
CREATE POLICY "staff_view_org_attendances" ON public.attendances
  FOR SELECT
  USING (organization_id IN (
    SELECT users.organization_id
    FROM users
    WHERE users.auth_user_id = (select auth.uid())
      AND users.role IN ('admin', 'clinician')
  ));

DROP POLICY IF EXISTS "users_view_own_attendances" ON public.attendances;
CREATE POLICY "users_view_own_attendances" ON public.attendances
  FOR SELECT
  USING (user_id IN (
    SELECT users.id
    FROM users
    WHERE users.auth_user_id = (select auth.uid())
  ));

-- =====================================================
-- EMPLOYEE_PROFILES TABLE (3 policies)
-- =====================================================

DROP POLICY IF EXISTS "admins_manage_employee_profiles" ON public.employee_profiles;
CREATE POLICY "admins_manage_employee_profiles" ON public.employee_profiles
  FOR ALL
  USING (organization_id IN (
    SELECT users.organization_id
    FROM users
    WHERE users.auth_user_id = (select auth.uid())
      AND users.role = 'admin'
  ));

DROP POLICY IF EXISTS "staff_view_org_employee_profiles" ON public.employee_profiles;
CREATE POLICY "staff_view_org_employee_profiles" ON public.employee_profiles
  FOR SELECT
  USING (organization_id IN (
    SELECT users.organization_id
    FROM users
    WHERE users.auth_user_id = (select auth.uid())
      AND users.role IN ('admin', 'clinician')
  ));

DROP POLICY IF EXISTS "users_view_own_employee_profile" ON public.employee_profiles;
CREATE POLICY "users_view_own_employee_profile" ON public.employee_profiles
  FOR SELECT
  USING (user_id IN (
    SELECT users.id
    FROM users
    WHERE users.auth_user_id = (select auth.uid())
  ));

-- =====================================================
-- INVITATIONS TABLE (5 policies)
-- =====================================================

DROP POLICY IF EXISTS "Admins can view org invitations" ON public.invitations;
CREATE POLICY "Admins can view org invitations" ON public.invitations
  FOR SELECT
  USING (organization_id IN (
    SELECT users.organization_id
    FROM users
    WHERE users.auth_user_id = (select auth.uid())
      AND users.role = 'admin'
  ));

DROP POLICY IF EXISTS "Admins can create invitations" ON public.invitations;
CREATE POLICY "Admins can create invitations" ON public.invitations
  FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role = 'admin'
    )
    AND invited_by IN (
      SELECT users.id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Admins can update invitations" ON public.invitations;
CREATE POLICY "Admins can update invitations" ON public.invitations
  FOR UPDATE
  USING (organization_id IN (
    SELECT users.organization_id
    FROM users
    WHERE users.auth_user_id = (select auth.uid())
      AND users.role = 'admin'
  ));

DROP POLICY IF EXISTS "Admins can delete invitations" ON public.invitations;
CREATE POLICY "Admins can delete invitations" ON public.invitations
  FOR DELETE
  USING (organization_id IN (
    SELECT users.organization_id
    FROM users
    WHERE users.auth_user_id = (select auth.uid())
      AND users.role = 'admin'
  ));

DROP POLICY IF EXISTS "Users can view their own pending invitations" ON public.invitations;
CREATE POLICY "Users can view their own pending invitations" ON public.invitations
  FOR SELECT
  USING (
    email = (SELECT email FROM auth.users WHERE id = (select auth.uid()))::text
    AND accepted_at IS NULL
    AND expires_at > now()
  );

-- =====================================================
-- ORGANIZATION_RETENTION_SETTINGS TABLE (1 policy)
-- =====================================================

DROP POLICY IF EXISTS "Admins can manage retention settings" ON public.organization_retention_settings;
CREATE POLICY "Admins can manage retention settings" ON public.organization_retention_settings
  FOR ALL
  USING (organization_id IN (
    SELECT users.organization_id
    FROM users
    WHERE users.auth_user_id = (select auth.uid())
      AND users.role = 'admin'
  ));

-- =====================================================
-- PACKAGE_DELIVERIES TABLE (2 policies)
-- =====================================================

DROP POLICY IF EXISTS "admins_manage_packages" ON public.package_deliveries;
CREATE POLICY "admins_manage_packages" ON public.package_deliveries
  FOR ALL
  USING (organization_id IN (
    SELECT users.organization_id
    FROM users
    WHERE users.auth_user_id = (select auth.uid())
      AND users.role = 'admin'
  ));

DROP POLICY IF EXISTS "staff_view_org_packages" ON public.package_deliveries;
CREATE POLICY "staff_view_org_packages" ON public.package_deliveries
  FOR SELECT
  USING (organization_id IN (
    SELECT users.organization_id
    FROM users
    WHERE users.auth_user_id = (select auth.uid())
      AND users.role IN ('admin', 'clinician')
  ));

-- =====================================================
-- REPORTS TABLE (1 policy - the one flagged by advisor)
-- =====================================================

DROP POLICY IF EXISTS "users_view_own_reports_by_user_id" ON public.reports;
CREATE POLICY "users_view_own_reports_by_user_id" ON public.reports
  FOR SELECT
  USING (user_id IN (
    SELECT users.id
    FROM users
    WHERE users.auth_user_id = (select auth.uid())
  ));

-- =====================================================
-- TEST_NORMS TABLE (2 policies)
-- =====================================================

DROP POLICY IF EXISTS "users_view_org_or_global_norms" ON public.test_norms;
CREATE POLICY "users_view_org_or_global_norms" ON public.test_norms
  FOR SELECT
  USING (
    organization_id IS NULL
    OR organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "admins_manage_org_norms" ON public.test_norms;
CREATE POLICY "admins_manage_org_norms" ON public.test_norms
  FOR ALL
  USING (organization_id IN (
    SELECT users.organization_id
    FROM users
    WHERE users.auth_user_id = (select auth.uid())
      AND users.role = 'admin'
  ))
  WITH CHECK (organization_id IN (
    SELECT users.organization_id
    FROM users
    WHERE users.auth_user_id = (select auth.uid())
      AND users.role = 'admin'
  ));;
