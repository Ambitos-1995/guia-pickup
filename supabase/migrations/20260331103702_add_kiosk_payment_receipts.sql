
-- Payment Receipts (Justificantes de Gratificacion)

-- 1. Table
CREATE TABLE public.kiosk_payment_receipts (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    employee_id             UUID NOT NULL REFERENCES public.kiosk_employees(id) ON DELETE RESTRICT,
    settlement_id           UUID NOT NULL REFERENCES public.kiosk_payment_settlements(id) ON DELETE RESTRICT,
    year                    INTEGER NOT NULL,
    month                   INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    status                  TEXT NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'signed', 'superseded')),
    employee_name_snapshot  TEXT NOT NULL DEFAULT '',
    hours_worked            NUMERIC NOT NULL DEFAULT 0,
    hourly_rate             NUMERIC NOT NULL DEFAULT 0,
    amount_earned           NUMERIC NOT NULL DEFAULT 0,
    worked_minutes          INTEGER NOT NULL DEFAULT 0,
    slot_count              INTEGER NOT NULL DEFAULT 0,
    employee_pin_verified   BOOLEAN DEFAULT FALSE,
    employee_verified_at    TIMESTAMPTZ,
    employee_signed_at      TIMESTAMPTZ,
    signature_storage_path  TEXT,
    document_snapshot_json  JSONB,
    document_storage_path   TEXT,
    document_hash           TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Row Level Security
ALTER TABLE public.kiosk_payment_receipts ENABLE ROW LEVEL SECURITY;

-- 3. Partial unique index
CREATE UNIQUE INDEX kiosk_payment_receipts_active_unique
    ON public.kiosk_payment_receipts (organization_id, employee_id, year, month)
    WHERE status IN ('pending', 'signed');

-- 4. Indexes
CREATE INDEX idx_receipts_org_year_month
    ON public.kiosk_payment_receipts (organization_id, year, month);

CREATE INDEX idx_receipts_employee
    ON public.kiosk_payment_receipts (employee_id, year, month);

CREATE INDEX idx_receipts_status
    ON public.kiosk_payment_receipts (status);

-- 5. RLS Policies
CREATE POLICY kiosk_service_role_all
    ON public.kiosk_payment_receipts
    FOR ALL
    TO service_role
    USING (true);

CREATE POLICY kiosk_admin_select
    ON public.kiosk_payment_receipts
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1
            FROM users
            WHERE users.auth_user_id = auth.uid()
              AND users.role::text = 'admin'::text
        )
    );

-- 6. Storage buckets (idempotent upsert)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'receipt-signatures',
    'receipt-signatures',
    false,
    524288,
    ARRAY['image/png']
)
ON CONFLICT (id) DO UPDATE
SET
    name              = EXCLUDED.name,
    public            = EXCLUDED.public,
    file_size_limit   = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'receipt-documents',
    'receipt-documents',
    false,
    5242880,
    ARRAY['application/json', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
SET
    name              = EXCLUDED.name,
    public            = EXCLUDED.public,
    file_size_limit   = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 7. Table comment
COMMENT ON TABLE public.kiosk_payment_receipts IS
    'Justificantes mensuales de gratificacion firmados por los participantes en el kiosko — Proyecto Punto Inclusivo';
;
