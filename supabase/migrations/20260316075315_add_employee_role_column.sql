ALTER TABLE kiosk_employees
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'employee'
  CONSTRAINT kiosk_employees_role_check CHECK (role IN ('employee', 'admin'));;
