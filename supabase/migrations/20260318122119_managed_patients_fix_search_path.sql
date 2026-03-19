-- Fix: set immutable search_path on generate_patient_code (security hardening)
CREATE OR REPLACE FUNCTION generate_patient_code(org_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;;
