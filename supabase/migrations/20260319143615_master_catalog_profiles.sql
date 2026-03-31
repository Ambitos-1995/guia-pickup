ALTER TABLE public.master_test_catalog
  ADD COLUMN IF NOT EXISTS catalog_profile JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.master_test_catalog.catalog_profile IS
  'Editorial clinical profile used by the master catalog UI: purpose, population, administration, norms summary, and search tags.';;
