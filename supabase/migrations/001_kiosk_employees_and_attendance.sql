-- =====================================================
-- Kiosk employees table (PIN-based, created from admin)
-- =====================================================
CREATE TABLE IF NOT EXISTS kiosk_employees (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    nombre TEXT NOT NULL,
    apellido TEXT NOT NULL,
    pin TEXT NOT NULL,
    attendance_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(organization_id, pin)
);

-- Index for fast PIN lookups
CREATE INDEX IF NOT EXISTS idx_kiosk_employees_org_pin
    ON kiosk_employees(organization_id, pin);

-- =====================================================
-- Kiosk attendance records (clock in/out)
-- =====================================================
CREATE TABLE IF NOT EXISTS kiosk_attendance (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES kiosk_employees(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('check_in', 'check_out')),
    client_date DATE NOT NULL,
    recorded_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kiosk_attendance_employee_date
    ON kiosk_attendance(employee_id, client_date DESC);

-- =====================================================
-- RLS policies (service role bypasses, but good practice)
-- =====================================================
ALTER TABLE kiosk_employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE kiosk_attendance ENABLE ROW LEVEL SECURITY;
