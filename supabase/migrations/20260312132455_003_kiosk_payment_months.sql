CREATE TABLE IF NOT EXISTS kiosk_payment_months (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    notes TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_kiosk_payment_months_org_year_month
    ON kiosk_payment_months(organization_id, year, month);;
