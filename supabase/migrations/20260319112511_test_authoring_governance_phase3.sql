ALTER TABLE public.test_definitions
  ADD COLUMN IF NOT EXISTS license_mode TEXT NOT NULL DEFAULT 'unknown'
    CHECK (license_mode IN ('public_domain', 'free_use', 'internal_owned', 'restricted', 'unknown')),
  ADD COLUMN IF NOT EXISTS usage_policy TEXT NOT NULL DEFAULT 'internal_review_only'
    CHECK (usage_policy IN ('project_allowed', 'internal_review_only')),
  ADD COLUMN IF NOT EXISTS authoring_origin TEXT NOT NULL DEFAULT 'manual'
    CHECK (authoring_origin IN ('manual', 'pdf', 'catalog', 'external_reference')),
  ADD COLUMN IF NOT EXISTS authoring_step TEXT NOT NULL DEFAULT 'identity'
    CHECK (authoring_step IN ('identity', 'administration', 'items', 'scoring', 'governance')),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_checklist JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS editor_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS supersedes_test_id UUID REFERENCES public.test_definitions(id) ON DELETE SET NULL;

UPDATE public.test_definitions
SET
  usage_policy = CASE
    WHEN status = 'active' AND validation_status = 'approved' THEN 'project_allowed'
    ELSE 'internal_review_only'
  END,
  authoring_origin = CASE
    WHEN source_kind = 'official_pdf' THEN 'pdf'
    WHEN source_kind = 'master_catalog' THEN 'catalog'
    WHEN source_kind = 'external_reference' THEN 'external_reference'
    ELSE 'manual'
  END,
  license_mode = CASE
    WHEN source_kind = 'master_catalog' THEN 'free_use'
    ELSE 'unknown'
  END
WHERE usage_policy IS NULL
   OR authoring_origin IS NULL
   OR license_mode IS NULL;

CREATE INDEX IF NOT EXISTS idx_test_definitions_usage_policy
  ON public.test_definitions(organization_id, usage_policy);

CREATE INDEX IF NOT EXISTS idx_test_definitions_license_mode
  ON public.test_definitions(organization_id, license_mode);

CREATE INDEX IF NOT EXISTS idx_test_definitions_authoring_origin
  ON public.test_definitions(organization_id, authoring_origin);

CREATE INDEX IF NOT EXISTS idx_test_definitions_supersedes_test_id
  ON public.test_definitions(supersedes_test_id);

COMMENT ON COLUMN public.test_definitions.license_mode IS
  'Governance-oriented licensing classification for operational use decisions.';

COMMENT ON COLUMN public.test_definitions.usage_policy IS
  'Whether the instrument is eligible for projects or remains internal review only.';

COMMENT ON COLUMN public.test_definitions.authoring_origin IS
  'How the current draft/version was created: manual, pdf, catalog, or external reference.';;
