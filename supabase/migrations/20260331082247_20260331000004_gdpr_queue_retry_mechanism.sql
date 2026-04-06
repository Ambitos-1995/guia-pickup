-- Añadir columnas de retry
ALTER TABLE public.gdpr_deletion_queue
  ADD COLUMN IF NOT EXISTS max_retries    INTEGER     NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS attempt_count  INTEGER     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at  TIMESTAMPTZ;

-- Constraint: completed_at obligatorio cuando status = 'completed'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname    = 'gdpr_queue_completed_has_timestamp'
      AND conrelid   = 'public.gdpr_deletion_queue'::regclass
  ) THEN
    ALTER TABLE public.gdpr_deletion_queue
      ADD CONSTRAINT gdpr_queue_completed_has_timestamp
      CHECK (status <> 'completed' OR completed_at IS NOT NULL);
  END IF;
END $$;

-- Constraint: attempt_count no puede superar max_retries
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname    = 'gdpr_queue_attempt_count_check'
      AND conrelid   = 'public.gdpr_deletion_queue'::regclass
  ) THEN
    ALTER TABLE public.gdpr_deletion_queue
      ADD CONSTRAINT gdpr_queue_attempt_count_check
      CHECK (attempt_count >= 0 AND attempt_count <= max_retries);
  END IF;
END $$;

-- Índice parcial: failed con next_retry_at definido
CREATE INDEX IF NOT EXISTS idx_gdpr_deletion_queue_retry
  ON public.gdpr_deletion_queue (next_retry_at)
  WHERE status = 'failed' AND next_retry_at IS NOT NULL;

COMMENT ON COLUMN public.gdpr_deletion_queue.max_retries   IS 'Número máximo de reintentos permitidos antes de marcar como fallo permanente.';
COMMENT ON COLUMN public.gdpr_deletion_queue.attempt_count IS 'Número de intentos realizados hasta ahora. Incrementar en cada fallo.';
COMMENT ON COLUMN public.gdpr_deletion_queue.next_retry_at IS 'Timestamp del próximo reintento. NULL si no hay reintento programado.';;
