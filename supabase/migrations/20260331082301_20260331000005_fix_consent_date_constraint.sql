DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname    = 'consents_revocation_after_consent_check'
      AND conrelid   = 'public.consents'::regclass
  ) THEN
    ALTER TABLE public.consents
      ADD CONSTRAINT consents_revocation_after_consent_check
      CHECK (revoked_at IS NULL OR revoked_at >= consented_at);
  END IF;
END $$;

COMMENT ON CONSTRAINT consents_revocation_after_consent_check ON public.consents IS
  'GDPR Art. 7: la revocación del consentimiento no puede ser anterior al consentimiento original.';;
