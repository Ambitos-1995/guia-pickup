-- ============================================================================
-- RLS POLICIES: employee_profiles
-- ============================================================================

CREATE POLICY "users_view_own_employee_profile"
  ON public.employee_profiles FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM public.users WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "staff_view_org_employee_profiles"
  ON public.employee_profiles FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

CREATE POLICY "admins_manage_employee_profiles"
  ON public.employee_profiles FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "service_role_employee_profiles"
  ON public.employee_profiles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- RLS POLICIES: attendances
-- ============================================================================

CREATE POLICY "service_role_insert_attendances"
  ON public.attendances FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "users_view_own_attendances"
  ON public.attendances FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM public.users WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "staff_view_org_attendances"
  ON public.attendances FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

CREATE POLICY "admins_manage_attendances"
  ON public.attendances FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "service_role_attendances"
  ON public.attendances FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- RLS POLICIES: package_deliveries
-- ============================================================================

CREATE POLICY "staff_view_org_packages"
  ON public.package_deliveries FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

CREATE POLICY "admins_manage_packages"
  ON public.package_deliveries FOR ALL
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users
      WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "service_role_packages"
  ON public.package_deliveries FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);;
