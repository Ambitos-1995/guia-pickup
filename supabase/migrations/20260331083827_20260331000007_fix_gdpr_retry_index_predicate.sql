-- Fix: exclude exhausted retries from the index so the worker
-- never scans permanently-failed rows on every poll cycle.
DROP INDEX IF EXISTS public.idx_gdpr_deletion_queue_retry;

CREATE INDEX idx_gdpr_deletion_queue_retry
  ON public.gdpr_deletion_queue (next_retry_at)
  WHERE status = 'failed'
    AND next_retry_at IS NOT NULL
    AND attempt_count < max_retries;;
