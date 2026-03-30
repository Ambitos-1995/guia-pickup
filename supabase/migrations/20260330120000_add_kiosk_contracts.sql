-- Acuerdos de participación en actividad ocupacional (RD 2274/1985)
-- Proyecto "Punto Inclusivo" — Fundación Ámbitos / EcoÁmbitos

CREATE TABLE public.kiosk_contracts (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id       UUID NOT NULL,
    employee_id           UUID NOT NULL REFERENCES public.kiosk_employees(id) ON DELETE CASCADE,
    title                 TEXT NOT NULL DEFAULT 'Acuerdo de Participación en Actividad Ocupacional',
    activity_description  TEXT NOT NULL,
    schedule              TEXT NOT NULL DEFAULT 'Según turnos asignados semanalmente',
    validity_text         TEXT NOT NULL DEFAULT '3 meses, renovable',
    representative_name   TEXT NOT NULL,
    status                TEXT NOT NULL DEFAULT 'pending_participant',
    -- status values: pending_participant | pending_admin | signed | cancelled
    participant_sign_url  TEXT,
    participant_verified_at TIMESTAMPTZ,
    participant_signed_at TIMESTAMPTZ,
    admin_sign_url        TEXT,
    admin_signed_at       TIMESTAMPTZ,
    admin_employee_id     UUID,   -- kiosk_employees.id del admin que co-firmó
    document_hash         TEXT,   -- SHA-256 del contenido del acuerdo (FES evidence)
    employee_pin_verified BOOLEAN DEFAULT FALSE,
    created_at            TIMESTAMPTZ DEFAULT NOW(),
    updated_at            TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT kiosk_contracts_status_check CHECK (
        status IN ('pending_participant', 'pending_admin', 'signed', 'cancelled')
    )
);

CREATE INDEX idx_kiosk_contracts_employee ON public.kiosk_contracts(employee_id);
CREATE INDEX idx_kiosk_contracts_status   ON public.kiosk_contracts(status);
CREATE INDEX idx_kiosk_contracts_org      ON public.kiosk_contracts(organization_id);

CREATE TRIGGER update_kiosk_contracts_updated_at
    BEFORE UPDATE ON public.kiosk_contracts
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.kiosk_contracts ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.kiosk_contracts IS
    'Acuerdos de participación en actividad ocupacional (RD 2274/1985) — Proyecto Punto Inclusivo';
