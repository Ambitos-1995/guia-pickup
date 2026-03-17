-- ============================================================================
-- MIGRATION: Attendance Module for TGM (Trastorno Mental Grave)
-- ============================================================================

-- Ensure pgcrypto is available for PIN hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================================
-- TABLE: employee_profiles
-- ============================================================================
CREATE TABLE public.employee_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  pin_hash TEXT NOT NULL,
  employee_code TEXT NOT NULL,
  photo_url TEXT,
  hourly_rate DECIMAL(10,2) DEFAULT 0,
  attendance_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id),
  UNIQUE(organization_id, employee_code)
);

CREATE INDEX idx_employee_profiles_org ON public.employee_profiles(organization_id);
CREATE INDEX idx_employee_profiles_user ON public.employee_profiles(user_id);
CREATE INDEX idx_employee_profiles_code ON public.employee_profiles(organization_id, employee_code);

CREATE TRIGGER update_employee_profiles_updated_at
  BEFORE UPDATE ON public.employee_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- TABLE: attendances
-- ============================================================================
CREATE TABLE public.attendances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_profile_id UUID NOT NULL REFERENCES public.employee_profiles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK (type IN ('check_in', 'check_out')),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  work_date DATE NOT NULL DEFAULT CURRENT_DATE,
  device_id TEXT,
  ip_address TEXT,
  notes TEXT,
  is_manual_entry BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_attendances_employee ON public.attendances(employee_profile_id);
CREATE INDEX idx_attendances_user ON public.attendances(user_id);
CREATE INDEX idx_attendances_org ON public.attendances(organization_id);
CREATE INDEX idx_attendances_date ON public.attendances(organization_id, work_date);
CREATE INDEX idx_attendances_timestamp ON public.attendances(organization_id, timestamp DESC);
CREATE INDEX idx_attendances_type_date ON public.attendances(employee_profile_id, work_date, type);

-- ============================================================================
-- TABLE: package_deliveries
-- ============================================================================
CREATE TABLE public.package_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_profile_id UUID NOT NULL REFERENCES public.employee_profiles(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  year INTEGER NOT NULL,
  month INTEGER NOT NULL CHECK (month >= 1 AND month <= 12),
  packages_count INTEGER NOT NULL DEFAULT 0 CHECK (packages_count >= 0),
  package_value DECIMAL(10,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(employee_profile_id, year, month)
);

CREATE INDEX idx_package_deliveries_employee ON public.package_deliveries(employee_profile_id);
CREATE INDEX idx_package_deliveries_org ON public.package_deliveries(organization_id);
CREATE INDEX idx_package_deliveries_period ON public.package_deliveries(organization_id, year, month);

CREATE TRIGGER update_package_deliveries_updated_at
  BEFORE UPDATE ON public.package_deliveries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Enable RLS
-- ============================================================================
ALTER TABLE public.employee_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_deliveries ENABLE ROW LEVEL SECURITY;;
