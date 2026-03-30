ALTER TABLE public.kiosk_contracts ADD COLUMN IF NOT EXISTS participant_verified_at TIMESTAMPTZ;

ALTER TABLE public.kiosk_contracts DROP CONSTRAINT IF EXISTS kiosk_contracts_status_check;

ALTER TABLE public.kiosk_contracts ADD CONSTRAINT kiosk_contracts_status_check
    CHECK (status IN ('pending_participant', 'pending_admin', 'signed', 'cancelled'));;
