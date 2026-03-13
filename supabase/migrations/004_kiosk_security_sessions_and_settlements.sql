CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE kiosk_employees
    ADD COLUMN IF NOT EXISTS pin_hash TEXT,
    ADD COLUMN IF NOT EXISTS pin_lookup_hash TEXT,
    ADD COLUMN IF NOT EXISTS pin_algorithm TEXT NOT NULL DEFAULT 'argon2id',
    ADD COLUMN IF NOT EXISTS pin_migrated_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_kiosk_employees_org_pin_lookup
    ON kiosk_employees (organization_id, pin_lookup_hash)
    WHERE pin_lookup_hash IS NOT NULL;

ALTER TABLE kiosk_schedule_slots
    ADD CONSTRAINT kiosk_schedule_slots_week_check
        CHECK (week BETWEEN 1 AND 53),
    ADD CONSTRAINT kiosk_schedule_slots_time_check
        CHECK (end_time > start_time);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kiosk_schedule_slots_org_unique_slot
    ON kiosk_schedule_slots (organization_id, year, week, day_of_week, start_time, end_time);

CREATE INDEX IF NOT EXISTS idx_kiosk_schedule_slots_org_week_day_employee
    ON kiosk_schedule_slots (organization_id, year, week, day_of_week, employee_id);

ALTER TABLE kiosk_attendance
    ADD COLUMN IF NOT EXISTS slot_id UUID REFERENCES kiosk_schedule_slots(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_kiosk_attendance_slot_action_unique
    ON kiosk_attendance (slot_id, action)
    WHERE slot_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_kiosk_attendance_org_employee_date_recorded
    ON kiosk_attendance (organization_id, employee_id, client_date, recorded_at DESC);

CREATE TABLE IF NOT EXISTS kiosk_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES kiosk_employees(id) ON DELETE SET NULL,
    role TEXT NOT NULL CHECK (role IN ('org_admin', 'respondent')),
    idle_timeout_seconds INTEGER NOT NULL CHECK (idle_timeout_seconds > 0),
    absolute_timeout_seconds INTEGER NOT NULL CHECK (absolute_timeout_seconds > 0),
    absolute_expires_at TIMESTAMPTZ NOT NULL,
    idle_expires_at TIMESTAMPTZ NOT NULL,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    ip_address TEXT NOT NULL DEFAULT '',
    user_agent TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kiosk_sessions_org_active
    ON kiosk_sessions (organization_id, revoked_at, absolute_expires_at, idle_expires_at);

CREATE TABLE IF NOT EXISTS kiosk_auth_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    login_type TEXT NOT NULL CHECK (login_type IN ('admin', 'employee')),
    ip_address TEXT NOT NULL DEFAULT '',
    successful BOOLEAN NOT NULL DEFAULT FALSE,
    blocked_until TIMESTAMPTZ,
    failure_count INTEGER NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kiosk_auth_attempts_lookup
    ON kiosk_auth_attempts (organization_id, login_type, ip_address, attempted_at DESC);

CREATE TABLE IF NOT EXISTS kiosk_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    actor_session_id UUID REFERENCES kiosk_sessions(id) ON DELETE SET NULL,
    actor_role TEXT NOT NULL DEFAULT 'system',
    employee_id UUID REFERENCES kiosk_employees(id) ON DELETE SET NULL,
    slot_id UUID REFERENCES kiosk_schedule_slots(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kiosk_audit_log_org_created
    ON kiosk_audit_log (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS kiosk_payment_settlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES kiosk_employees(id) ON DELETE CASCADE,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    status TEXT NOT NULL CHECK (status IN ('pending', 'calculated', 'review_required', 'confirmed')),
    hours_worked NUMERIC(10,2) NOT NULL DEFAULT 0,
    hourly_rate NUMERIC(10,4) NOT NULL DEFAULT 0,
    amount_earned NUMERIC(10,2) NOT NULL DEFAULT 0,
    worked_minutes INTEGER NOT NULL DEFAULT 0,
    slot_count INTEGER NOT NULL DEFAULT 0,
    employee_name_snapshot TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    meta JSONB NOT NULL DEFAULT '{}'::jsonb,
    calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, employee_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_kiosk_payment_settlements_org_month
    ON kiosk_payment_settlements (organization_id, year, month, status);

ALTER TABLE kiosk_schedule_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE kiosk_payment_months ENABLE ROW LEVEL SECURITY;
ALTER TABLE kiosk_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE kiosk_auth_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE kiosk_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE kiosk_payment_settlements ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE kiosk_employees FROM anon, authenticated;
REVOKE ALL ON TABLE kiosk_attendance FROM anon, authenticated;
REVOKE ALL ON TABLE kiosk_schedule_slots FROM anon, authenticated;
REVOKE ALL ON TABLE kiosk_payment_months FROM anon, authenticated;
REVOKE ALL ON TABLE kiosk_sessions FROM anon, authenticated;
REVOKE ALL ON TABLE kiosk_auth_attempts FROM anon, authenticated;
REVOKE ALL ON TABLE kiosk_audit_log FROM anon, authenticated;
REVOKE ALL ON TABLE kiosk_payment_settlements FROM anon, authenticated;

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_kiosk_payment_settlements_updated_at ON kiosk_payment_settlements;
CREATE TRIGGER trg_kiosk_payment_settlements_updated_at
BEFORE UPDATE ON kiosk_payment_settlements
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
