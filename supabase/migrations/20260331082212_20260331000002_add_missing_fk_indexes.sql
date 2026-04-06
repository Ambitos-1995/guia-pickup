-- Índice compuesto: audit_logs (organization_id, created_at DESC)
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_created_at
  ON public.audit_logs (organization_id, created_at DESC);

-- Índice compuesto: gdpr_deletion_queue (organization_id, status)
CREATE INDEX IF NOT EXISTS idx_gdpr_deletion_queue_org_status
  ON public.gdpr_deletion_queue (organization_id, status);

-- Índice compuesto: responses (organization_id, status)
CREATE INDEX IF NOT EXISTS idx_responses_org_status
  ON public.responses (organization_id, status);

-- Índice compuesto: scores (organization_id, calculated_at DESC)
CREATE INDEX IF NOT EXISTS idx_scores_org_calculated_at
  ON public.scores (organization_id, calculated_at DESC);;
