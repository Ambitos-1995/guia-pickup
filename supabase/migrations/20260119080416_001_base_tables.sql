-- ============================================================
-- MIGRACIÓN 001: TABLAS BASE
-- Sistema de Tests Psicométricos - Multi-tenant
-- ============================================================

-- Tabla de organizaciones (multi-tenancy)
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Validación de slug (solo letras, números y guiones)
  CONSTRAINT valid_slug CHECK (slug ~* '^[a-z0-9-]+$')
);

-- Comentario de tabla
COMMENT ON TABLE public.organizations IS 'Organizaciones/instituciones que usan la plataforma (multi-tenant)';

-- Tabla de usuarios (perfiles extendidos)
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  email VARCHAR(255) NOT NULL,
  nombre VARCHAR(255),
  role VARCHAR(50) DEFAULT 'respondent',
  estado VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_login_at TIMESTAMPTZ,
  
  -- Validaciones
  CONSTRAINT valid_role CHECK (role IN ('admin', 'clinician', 'respondent')),
  CONSTRAINT valid_estado CHECK (estado IN ('active', 'inactive', 'suspended')),
  CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

-- Comentario de tabla
COMMENT ON TABLE public.users IS 'Perfiles de usuario extendidos, vinculados a auth.users de Supabase';
COMMENT ON COLUMN public.users.role IS 'Rol: admin (gestión completa), clinician (crear tests, ver resultados), respondent (responder tests)';

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers de updated_at
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar RLS
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- RLS Policies para organizations
CREATE POLICY "Usuarios ven su propia organización"
  ON public.organizations FOR SELECT
  USING (
    id IN (
      SELECT organization_id FROM public.users 
      WHERE auth_user_id = auth.uid()
    )
  );

-- RLS Policies para users
CREATE POLICY "Usuarios ven miembros de su organización"
  ON public.users FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users 
      WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Usuarios pueden actualizar su propio perfil"
  ON public.users FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

CREATE POLICY "Admins pueden insertar usuarios en su organización"
  ON public.users FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.users 
      WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  );;
