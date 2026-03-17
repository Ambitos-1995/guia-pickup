-- ============================================================
-- MIGRACIÓN 005: TABLAS AUXILIARES
-- Reportes PDF y Token Blacklist
-- ============================================================

-- Tabla de reportes generados
CREATE TABLE public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID UNIQUE NOT NULL REFERENCES public.responses(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  
  -- Tipo de reporte
  report_type VARCHAR(20) DEFAULT 'pdf',
  
  -- Contenido ENCRIPTADO
  content_encrypted BYTEA NOT NULL,
  
  -- Metadatos del archivo
  filename VARCHAR(255),
  mime_type VARCHAR(100) DEFAULT 'application/pdf',
  file_size_bytes INTEGER,
  
  -- Integridad
  integrity_hash VARCHAR(64),  -- SHA-256
  
  -- Tracking de descargas
  download_count INTEGER DEFAULT 0,
  last_downloaded_at TIMESTAMPTZ,
  
  -- Expiración (opcional)
  expires_at TIMESTAMPTZ,
  
  -- Timestamps
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_report_type CHECK (report_type IN ('pdf', 'json', 'csv', 'fhir'))
);

-- Comentarios
COMMENT ON TABLE public.reports IS 'Reportes PDF/JSON generados a partir de respuestas';
COMMENT ON COLUMN public.reports.content_encrypted IS 'Contenido del reporte encriptado con pgcrypto';
COMMENT ON COLUMN public.reports.integrity_hash IS 'Hash SHA-256 para verificar integridad del archivo';

-- Tabla de tokens revocados (logout)
CREATE TABLE public.token_blacklist (
  -- Hash del token (no el token en sí, por seguridad)
  token_hash VARCHAR(64) PRIMARY KEY,  -- SHA-256 del token
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  
  -- Razón de revocación
  reason VARCHAR(100),  -- 'logout', 'password_change', 'admin_revoke', 'security'
  
  -- Timestamps
  revoked_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,  -- Cuando el token habría expirado naturalmente
  
  -- Constraint
  CONSTRAINT valid_revocation_reason CHECK (
    reason IS NULL OR reason IN ('logout', 'password_change', 'admin_revoke', 'security', 'session_limit')
  )
);

-- Comentarios
COMMENT ON TABLE public.token_blacklist IS 'Tokens JWT revocados (logout, cambio de contraseña, etc.)';
COMMENT ON COLUMN public.token_blacklist.token_hash IS 'SHA-256 del token, no el token en sí';
COMMENT ON COLUMN public.token_blacklist.expires_at IS 'Fecha de expiración original del token. Limpiar registros después de esta fecha.';

-- Tabla para configuración de la plataforma (por organización)
CREATE TABLE public.organization_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID UNIQUE NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  
  -- Configuración GDPR
  data_retention_days INTEGER DEFAULT 2555,  -- 7 años por defecto
  require_consent BOOLEAN DEFAULT TRUE,
  consent_text_es TEXT,
  consent_text_en TEXT,
  
  -- Configuración de branding
  logo_url TEXT,
  primary_color VARCHAR(7) DEFAULT '#3B82F6',
  secondary_color VARCHAR(7) DEFAULT '#1E40AF',
  
  -- Configuración de notificaciones
  notify_admin_on_critical_alert BOOLEAN DEFAULT TRUE,
  admin_notification_email VARCHAR(255),
  
  -- Configuración de exportación
  allow_data_export BOOLEAN DEFAULT TRUE,
  export_format VARCHAR(20) DEFAULT 'json',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comentarios
COMMENT ON TABLE public.organization_settings IS 'Configuración personalizada por organización';

-- Trigger updated_at
CREATE TRIGGER update_organization_settings_updated_at
  BEFORE UPDATE ON public.organization_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar RLS
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.token_blacklist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies para reports
CREATE POLICY "Usuario ve sus propios reportes"
  ON public.reports FOR SELECT
  USING (
    response_id IN (
      SELECT id FROM public.responses 
      WHERE user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    )
    OR
    organization_id IN (
      SELECT organization_id FROM public.users 
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

-- INSERT/UPDATE solo via service role
CREATE POLICY "Solo sistema puede crear reportes"
  ON public.reports FOR INSERT
  WITH CHECK (false);

CREATE POLICY "Solo sistema puede actualizar reportes"
  ON public.reports FOR UPDATE
  USING (false);

-- RLS Policies para token_blacklist (solo sistema)
-- No hay policies = solo service role puede acceder

-- RLS Policies para organization_settings
CREATE POLICY "Admins ven config de su organización"
  ON public.organization_settings FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users 
      WHERE auth_user_id = auth.uid()
    )
  );

CREATE POLICY "Solo admins pueden actualizar config"
  ON public.organization_settings FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users 
      WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  );

-- Índices
CREATE INDEX idx_reports_response_id ON public.reports(response_id);
CREATE INDEX idx_reports_org_id ON public.reports(organization_id);
CREATE INDEX idx_reports_expires_at ON public.reports(expires_at);
CREATE INDEX idx_token_blacklist_user_id ON public.token_blacklist(user_id);
CREATE INDEX idx_token_blacklist_expires_at ON public.token_blacklist(expires_at);;
