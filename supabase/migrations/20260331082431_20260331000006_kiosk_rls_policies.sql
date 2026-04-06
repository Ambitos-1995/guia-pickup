-- kiosk_attendance
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kiosk_attendance' AND policyname='kiosk_service_role_all') THEN
    CREATE POLICY "kiosk_service_role_all" ON public.kiosk_attendance FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kiosk_attendance' AND policyname='kiosk_admin_select') THEN
    CREATE POLICY "kiosk_admin_select" ON public.kiosk_attendance FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.users WHERE auth_user_id = auth.uid() AND role = 'admin'));
  END IF;
END $$;

-- kiosk_audit_log
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kiosk_audit_log' AND policyname='kiosk_service_role_all') THEN
    CREATE POLICY "kiosk_service_role_all" ON public.kiosk_audit_log FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kiosk_audit_log' AND policyname='kiosk_admin_select') THEN
    CREATE POLICY "kiosk_admin_select" ON public.kiosk_audit_log FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.users WHERE auth_user_id = auth.uid() AND role = 'admin'));
  END IF;
END $$;

-- kiosk_auth_attempts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kiosk_auth_attempts' AND policyname='kiosk_service_role_all') THEN
    CREATE POLICY "kiosk_service_role_all" ON public.kiosk_auth_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kiosk_auth_attempts' AND policyname='kiosk_admin_select') THEN
    CREATE POLICY "kiosk_admin_select" ON public.kiosk_auth_attempts FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.users WHERE auth_user_id = auth.uid() AND role = 'admin'));
  END IF;
END $$;

-- kiosk_contracts
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kiosk_contracts' AND policyname='kiosk_service_role_all') THEN
    CREATE POLICY "kiosk_service_role_all" ON public.kiosk_contracts FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kiosk_contracts' AND policyname='kiosk_admin_select') THEN
    CREATE POLICY "kiosk_admin_select" ON public.kiosk_contracts FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.users WHERE auth_user_id = auth.uid() AND role = 'admin'));
  END IF;
END $$;

-- kiosk_employees
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kiosk_employees' AND policyname='kiosk_service_role_all') THEN
    CREATE POLICY "kiosk_service_role_all" ON public.kiosk_employees FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kiosk_employees' AND policyname='kiosk_admin_select') THEN
    CREATE POLICY "kiosk_admin_select" ON public.kiosk_employees FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.users WHERE auth_user_id = auth.uid() AND role = 'admin'));
  END IF;
END $$;

-- kiosk_payment_months
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kiosk_payment_months' AND policyname='kiosk_service_role_all') THEN
    CREATE POLICY "kiosk_service_role_all" ON public.kiosk_payment_months FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kiosk_payment_months' AND policyname='kiosk_admin_select') THEN
    CREATE POLICY "kiosk_admin_select" ON public.kiosk_payment_months FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.users WHERE auth_user_id = auth.uid() AND role = 'admin'));
  END IF;
END $$;

-- kiosk_payment_settlements
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kiosk_payment_settlements' AND policyname='kiosk_service_role_all') THEN
    CREATE POLICY "kiosk_service_role_all" ON public.kiosk_payment_settlements FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kiosk_payment_settlements' AND policyname='kiosk_admin_select') THEN
    CREATE POLICY "kiosk_admin_select" ON public.kiosk_payment_settlements FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.users WHERE auth_user_id = auth.uid() AND role = 'admin'));
  END IF;
END $$;

-- kiosk_schedule_slots
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kiosk_schedule_slots' AND policyname='kiosk_service_role_all') THEN
    CREATE POLICY "kiosk_service_role_all" ON public.kiosk_schedule_slots FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kiosk_schedule_slots' AND policyname='kiosk_admin_select') THEN
    CREATE POLICY "kiosk_admin_select" ON public.kiosk_schedule_slots FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.users WHERE auth_user_id = auth.uid() AND role = 'admin'));
  END IF;
END $$;

-- kiosk_sessions
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kiosk_sessions' AND policyname='kiosk_service_role_all') THEN
    CREATE POLICY "kiosk_service_role_all" ON public.kiosk_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='kiosk_sessions' AND policyname='kiosk_admin_select') THEN
    CREATE POLICY "kiosk_admin_select" ON public.kiosk_sessions FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.users WHERE auth_user_id = auth.uid() AND role = 'admin'));
  END IF;
END $$;;
