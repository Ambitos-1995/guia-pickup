-- ============================================================
-- FIX auth_rls_initplan: wrap auth.uid() with (select auth.uid())
-- so it evaluates once per query instead of once per row
-- ============================================================

-- ============================================================
-- TABLE: dashboard_quick_notes
-- ============================================================
ALTER POLICY "Users can delete own quick notes"
  ON public.dashboard_quick_notes
  USING (user_id = (select auth.uid()));

ALTER POLICY "Users can insert own quick notes"
  ON public.dashboard_quick_notes
  WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY "Users can update own quick notes"
  ON public.dashboard_quick_notes
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

ALTER POLICY "Users can view own quick notes"
  ON public.dashboard_quick_notes
  USING (user_id = (select auth.uid()));

-- ============================================================
-- TABLE: kiosk_attendance
-- ============================================================
ALTER POLICY "kiosk_admin_select"
  ON public.kiosk_attendance
  USING (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = 'admin'::text
    )
  );

-- ============================================================
-- TABLE: kiosk_audit_log
-- ============================================================
ALTER POLICY "kiosk_admin_select"
  ON public.kiosk_audit_log
  USING (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = 'admin'::text
    )
  );

-- ============================================================
-- TABLE: kiosk_auth_attempts
-- ============================================================
ALTER POLICY "kiosk_admin_select"
  ON public.kiosk_auth_attempts
  USING (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = 'admin'::text
    )
  );

-- ============================================================
-- TABLE: kiosk_contracts
-- ============================================================
ALTER POLICY "kiosk_admin_select"
  ON public.kiosk_contracts
  USING (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = 'admin'::text
    )
  );

-- ============================================================
-- TABLE: kiosk_employees
-- ============================================================
ALTER POLICY "kiosk_admin_select"
  ON public.kiosk_employees
  USING (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = 'admin'::text
    )
  );

-- ============================================================
-- TABLE: kiosk_payment_months
-- ============================================================
ALTER POLICY "kiosk_admin_select"
  ON public.kiosk_payment_months
  USING (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = 'admin'::text
    )
  );

-- ============================================================
-- TABLE: kiosk_payment_receipts
-- ============================================================
ALTER POLICY "kiosk_admin_select"
  ON public.kiosk_payment_receipts
  USING (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = 'admin'::text
    )
  );

-- ============================================================
-- TABLE: kiosk_payment_settlements
-- ============================================================
ALTER POLICY "kiosk_admin_select"
  ON public.kiosk_payment_settlements
  USING (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = 'admin'::text
    )
  );

-- ============================================================
-- TABLE: kiosk_schedule_slots
-- ============================================================
ALTER POLICY "kiosk_admin_select"
  ON public.kiosk_schedule_slots
  USING (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = 'admin'::text
    )
  );

-- ============================================================
-- TABLE: kiosk_sessions
-- ============================================================
ALTER POLICY "kiosk_admin_select"
  ON public.kiosk_sessions
  USING (
    EXISTS (
      SELECT 1
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = 'admin'::text
    )
  );;
