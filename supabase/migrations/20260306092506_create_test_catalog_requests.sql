-- ===========================================
-- TEST CATALOG REQUESTS
-- Flujo manual para incorporar nuevos tests
-- ===========================================

CREATE TABLE public.test_catalog_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  requested_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  reviewed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_test_id UUID REFERENCES public.test_definitions(id) ON DELETE SET NULL,
  requested_slug TEXT,
  requested_title JSONB NOT NULL,
  requested_tipo TEXT,
  source_kind TEXT NOT NULL CHECK (source_kind IN ('manual', 'official_pdf', 'external_reference')),
  source_document_name TEXT,
  source_document_url TEXT,
  source_document_sha256 TEXT,
  source_notes TEXT,
  requested_use_case TEXT,
  clinical_rationale TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending', 'under_review', 'approved', 'rejected')) DEFAULT 'pending',
  reviewer_notes TEXT,
  catalog_template_id TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT test_catalog_requests_requested_slug_check
    CHECK (requested_slug IS NULL OR requested_slug ~ '^[a-z0-9-]+$'),
  CONSTRAINT test_catalog_requests_sha256_check
    CHECK (source_document_sha256 IS NULL OR source_document_sha256 ~ '^[A-Fa-f0-9]{64}$')
);

CREATE INDEX idx_test_catalog_requests_org
  ON public.test_catalog_requests(organization_id);

CREATE INDEX idx_test_catalog_requests_org_status
  ON public.test_catalog_requests(organization_id, status);

CREATE INDEX idx_test_catalog_requests_requested_by
  ON public.test_catalog_requests(requested_by);

CREATE TRIGGER update_test_catalog_requests_updated_at
  BEFORE UPDATE ON public.test_catalog_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.test_catalog_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_view_test_catalog_requests_in_org"
  ON public.test_catalog_requests FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.users
      WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "clinicians_create_test_catalog_requests"
  ON public.test_catalog_requests FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id
      FROM public.users
      WHERE auth_user_id = auth.uid()
        AND role IN ('clinician', 'admin')
    )
  );

CREATE POLICY "admins_update_test_catalog_requests"
  ON public.test_catalog_requests FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id
      FROM public.users
      WHERE auth_user_id = auth.uid()
        AND role = 'admin'
    )
  );

COMMENT ON TABLE public.test_catalog_requests IS
  'Manual workflow queue for onboarding new psychometric tests into the certified catalog.';;
