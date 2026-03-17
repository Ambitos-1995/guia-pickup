CREATE TABLE IF NOT EXISTS public.master_test_catalog (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL,
  short_name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  clinical_area TEXT NOT NULL,
  clinical_area_slug TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  instructions TEXT,
  license_label TEXT,
  license_status TEXT NOT NULL CHECK (
    license_status IN (
      'free_use',
      'public_domain',
      'clinical_free',
      'non_commercial',
      'restricted',
      'requires_certification',
      'unknown'
    )
  ),
  license_notes TEXT,
  license_verified_at TIMESTAMPTZ,
  license_source_url TEXT,
  completeness TEXT NOT NULL CHECK (completeness IN ('full', 'metadata_only')),
  availability_status TEXT NOT NULL CHECK (
    availability_status IN ('available', 'restricted', 'pending_review')
  ),
  test_type TEXT NOT NULL,
  scoring_method TEXT,
  total_range TEXT,
  cutoff_points TEXT,
  response_options JSONB NOT NULL DEFAULT '[]'::JSONB,
  items JSONB NOT NULL DEFAULT '[]'::JSONB,
  subscales JSONB NOT NULL DEFAULT '[]'::JSONB,
  reverse_item_indices JSONB NOT NULL DEFAULT '[]'::JSONB,
  interpretations JSONB NOT NULL DEFAULT '[]'::JSONB,
  multiplier NUMERIC,
  source_repository_path TEXT,
  source_title TEXT,
  source_publisher TEXT,
  source_url TEXT,
  source_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS master_test_catalog_slug_key
  ON public.master_test_catalog (slug);

CREATE INDEX IF NOT EXISTS master_test_catalog_area_idx
  ON public.master_test_catalog (clinical_area_slug);

CREATE INDEX IF NOT EXISTS master_test_catalog_availability_idx
  ON public.master_test_catalog (availability_status);

CREATE INDEX IF NOT EXISTS master_test_catalog_license_idx
  ON public.master_test_catalog (license_status);

CREATE TABLE IF NOT EXISTS public.master_test_catalog_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id TEXT NOT NULL REFERENCES public.master_test_catalog(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('pdf', 'readme', 'html', 'other')),
  file_name TEXT NOT NULL,
  local_path TEXT NOT NULL,
  is_official BOOLEAN NOT NULL DEFAULT FALSE,
  is_publicly_distributable BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (catalog_id, local_path)
);

CREATE INDEX IF NOT EXISTS master_test_catalog_assets_catalog_id_idx
  ON public.master_test_catalog_assets (catalog_id);

DROP TRIGGER IF EXISTS update_master_test_catalog_updated_at ON public.master_test_catalog;
CREATE TRIGGER update_master_test_catalog_updated_at
  BEFORE UPDATE ON public.master_test_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMENT ON TABLE public.master_test_catalog IS
  'Global catalog of psychometric instruments curated from local source materials and official licensing review.';

COMMENT ON TABLE public.master_test_catalog_assets IS
  'Local asset inventory for each catalog entry (PDFs, README files, HTML guides).';;
