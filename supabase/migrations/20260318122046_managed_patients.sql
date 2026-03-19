-- Migration 026: Managed patient accounts (no email/password required)
-- Patients are created manually by admins/clinicians and never log in directly.

ALTER TABLE public.users
  ADD COLUMN is_managed_account BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN patient_code TEXT;

-- Unique patient code per organization
CREATE UNIQUE INDEX idx_users_patient_code_org
  ON public.users(organization_id, patient_code)
  WHERE patient_code IS NOT NULL;

-- Managed accounts must always be respondents
ALTER TABLE public.users
  ADD CONSTRAINT managed_account_must_be_respondent
  CHECK (NOT is_managed_account OR role = 'respondent');

-- Function to generate the next sequential patient code for an org (PAC-YYYY-NNNN)
CREATE OR REPLACE FUNCTION generate_patient_code(org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  yr TEXT := EXTRACT(YEAR FROM NOW())::TEXT;
  next_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(
    CASE
      WHEN patient_code LIKE 'PAC-' || yr || '-%'
        THEN (SPLIT_PART(patient_code, '-', 3))::INTEGER
      ELSE 0
    END
  ), 0) + 1
  INTO next_num
  FROM public.users
  WHERE organization_id = org_id AND patient_code IS NOT NULL;

  RETURN 'PAC-' || yr || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$$;

-- Grant execute to service role only (backend calls this via supabaseAdmin)
REVOKE ALL ON FUNCTION generate_patient_code(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION generate_patient_code(UUID) TO service_role;;
