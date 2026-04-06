-- =============================================================================
-- Migration: 20260331000001_fix_master_catalog_rls_policies.sql
-- Description: Añade políticas RLS faltantes en master_test_catalog y assets.
--   - Las migraciones anteriores (20260319...) crearon políticas sólo para admin
--     y clinician. Los respondents autenticados no pueden leer el catálogo en
--     flujos futuros, y service_role necesita política explícita de ALL para
--     operaciones de seed/mantenimiento.
--   - Se usa CREATE POLICY con guarda IF NOT EXISTS via DO block para idempotencia.
-- =============================================================================

-- -----------------------------------------------------------------------
-- master_test_catalog: política ALL para service_role (seed / mantenimiento)
-- -----------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'master_test_catalog'
      AND policyname = 'service_role_manage_master_catalog'
  ) THEN
    CREATE POLICY "service_role_manage_master_catalog"
      ON public.master_test_catalog FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- -----------------------------------------------------------------------
-- master_test_catalog_assets: política ALL para service_role
-- -----------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'master_test_catalog_assets'
      AND policyname = 'service_role_manage_master_catalog_assets'
  ) THEN
    CREATE POLICY "service_role_manage_master_catalog_assets"
      ON public.master_test_catalog_assets FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;;
