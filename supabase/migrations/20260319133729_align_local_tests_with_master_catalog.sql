WITH catalog_aliases AS (
  SELECT
    td.id AS test_definition_id,
    td.slug AS local_slug,
    mtc.id AS catalog_id,
    mtc.slug AS catalog_slug,
    mtc.license_status,
    mtc.availability_status,
    mtc.completeness,
    mtc.source_url,
    mtc.source_repository_path
  FROM public.test_definitions td
  JOIN public.master_test_catalog mtc
    ON mtc.slug = td.slug

  UNION ALL

  SELECT
    td.id AS test_definition_id,
    td.slug AS local_slug,
    mtc.id AS catalog_id,
    mtc.slug AS catalog_slug,
    mtc.license_status,
    mtc.availability_status,
    mtc.completeness,
    mtc.source_url,
    mtc.source_repository_path
  FROM public.test_definitions td
  JOIN public.master_test_catalog mtc
    ON td.slug = 'whodas-2.0-12'
   AND mtc.slug = 'whodas-12'
)
UPDATE public.test_definitions td
SET
  source_kind = 'master_catalog',
  source_catalog_id = ca.catalog_id,
  official_source_url = COALESCE(td.official_source_url, ca.source_url),
  source_repository_path = COALESCE(td.source_repository_path, ca.source_repository_path),
  authoring_origin = 'catalog',
  authoring_step = 'governance',
  license_mode = CASE
    WHEN ca.license_status = 'public_domain' THEN 'public_domain'
    WHEN ca.license_status IN ('free_use', 'clinical_free') THEN 'free_use'
    WHEN ca.license_status IN ('restricted', 'requires_certification', 'non_commercial') THEN 'restricted'
    ELSE td.license_mode
  END,
  validation_status = CASE
    WHEN td.status = 'active'
      AND ca.availability_status = 'available'
      AND ca.completeness = 'full'
      AND ca.license_status IN ('public_domain', 'free_use', 'clinical_free')
    THEN 'approved'
    ELSE td.validation_status
  END,
  usage_policy = CASE
    WHEN td.status = 'active'
      AND ca.availability_status = 'available'
      AND ca.completeness = 'full'
      AND ca.license_status IN ('public_domain', 'free_use', 'clinical_free')
    THEN 'project_allowed'
    ELSE td.usage_policy
  END,
  validated_at = CASE
    WHEN td.status = 'active'
      AND ca.availability_status = 'available'
      AND ca.completeness = 'full'
      AND ca.license_status IN ('public_domain', 'free_use', 'clinical_free')
    THEN COALESCE(td.validated_at, NOW())
    ELSE td.validated_at
  END,
  approved_at = CASE
    WHEN td.status = 'active'
      AND ca.availability_status = 'available'
      AND ca.completeness = 'full'
      AND ca.license_status IN ('public_domain', 'free_use', 'clinical_free')
    THEN COALESCE(td.approved_at, NOW())
    ELSE td.approved_at
  END,
  validation_notes = CASE
    WHEN td.status = 'active'
      AND ca.availability_status = 'available'
      AND ca.completeness = 'full'
      AND ca.license_status IN ('public_domain', 'free_use', 'clinical_free')
      AND COALESCE(BTRIM(td.validation_notes), '') = ''
    THEN 'Alineado automaticamente con el catalogo maestro y habilitado para uso operativo.'
    WHEN COALESCE(BTRIM(td.validation_notes), '') = ''
    THEN 'Alineado automaticamente con el catalogo maestro. Requiere revision adicional antes de uso operativo.'
    ELSE td.validation_notes
  END,
  review_checklist = COALESCE(td.review_checklist, '{}'::jsonb) || jsonb_build_object(
    'source_identified', true,
    'license_reviewed', true,
    'instructions_present', ca.completeness = 'full',
    'items_reviewed', ca.completeness = 'full',
    'scoring_consistent', ca.completeness = 'full',
    'interpretations_reviewed', ca.completeness = 'full',
    'project_use_allowed',
      td.status = 'active'
      AND ca.availability_status = 'available'
      AND ca.completeness = 'full'
      AND ca.license_status IN ('public_domain', 'free_use', 'clinical_free')
  ),
  import_metadata = COALESCE(td.import_metadata, '{}'::jsonb) || jsonb_build_object(
    'catalog_id', ca.catalog_id,
    'catalog_slug', ca.catalog_slug,
    'catalog_availability_status', ca.availability_status,
    'catalog_completeness', ca.completeness,
    'catalog_license_status', ca.license_status,
    'aligned_from_existing_definition', true,
    'alignment_source', '20260319173000_align_local_tests_with_master_catalog'
  )
FROM catalog_aliases ca
WHERE td.id = ca.test_definition_id
  AND (
    td.source_catalog_id IS DISTINCT FROM ca.catalog_id
    OR td.source_kind IS DISTINCT FROM 'master_catalog'
    OR td.authoring_origin IS DISTINCT FROM 'catalog'
    OR td.authoring_step IS DISTINCT FROM 'governance'
    OR (
      td.status = 'active'
      AND ca.availability_status = 'available'
      AND ca.completeness = 'full'
      AND ca.license_status IN ('public_domain', 'free_use', 'clinical_free')
      AND (
        td.validation_status IS DISTINCT FROM 'approved'
        OR td.usage_policy IS DISTINCT FROM 'project_allowed'
        OR td.validated_at IS NULL
        OR td.approved_at IS NULL
      )
    )
  );;
