ALTER TABLE public.employee_profiles
ADD COLUMN IF NOT EXISTS pin_fingerprint TEXT;

COMMENT ON COLUMN public.employee_profiles.pin_fingerprint IS
  'Fingerprint (hash) of PIN for uniqueness checks per organization';

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_profiles_pin_fingerprint
ON public.employee_profiles(organization_id, pin_fingerprint)
WHERE pin_fingerprint IS NOT NULL;
;
