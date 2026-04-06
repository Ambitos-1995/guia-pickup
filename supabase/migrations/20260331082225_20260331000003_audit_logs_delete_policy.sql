DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'audit_logs'
      AND policyname = 'service_role_delete_audit_logs'
  ) THEN
    CREATE POLICY "service_role_delete_audit_logs"
      ON public.audit_logs FOR DELETE
      TO service_role
      USING (true);
  END IF;
END $$;

COMMENT ON TABLE public.audit_logs IS
  'Registro de auditoría inmutable para usuarios. Solo service_role puede insertar y borrar (retención GDPR).';;
