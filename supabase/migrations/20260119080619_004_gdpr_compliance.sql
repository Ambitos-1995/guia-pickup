-- ============================================================
-- MIGRACIÓN 004: TABLAS DE COMPLIANCE GDPR
-- Consentimiento, Auditoría, Retención de datos
-- ============================================================

-- Tabla de consentimientos (Art. 7 GDPR)
CREATE TABLE public.consents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  test_id UUID NOT NULL REFERENCES public.test_definitions(id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  
  -- Consentimiento
  accepted BOOLEAN NOT NULL,
  consent_text_version VARCHAR(50) NOT NULL,  -- Versión del texto legal
  
  -- Metadatos de auditoría (requeridos por GDPR)
  ip_address INET NOT NULL,
  user_agent TEXT NOT NULL,
  
  -- Timestamps
  consented_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Revocación
  revoked BOOLEAN DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT,
  
  -- Constraint: si está revocado, debe tener fecha
  CONSTRAINT revoked_has_timestamp CHECK (
    revoked = FALSE OR revoked_at IS NOT NULL
  )
);

-- Comentarios
COMMENT ON TABLE public.consents IS 'Registro de consentimientos informados (GDPR Art. 7)';
COMMENT ON COLUMN public.consents.consent_text_version IS 'Versión del texto de consentimiento mostrado al usuario';
COMMENT ON COLUMN public.consents.ip_address IS 'IP del usuario al momento del consentimiento (auditoría)';

-- Tabla de auditoría INMUTABLE (Art. 30 GDPR)
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  
  -- Acción realizada
  action VARCHAR(100) NOT NULL,  -- 'create_response', 'view_score', 'export_data', etc.
  
  -- Recurso afectado
  resource_type VARCHAR(50),  -- 'response', 'user', 'test', etc.
  resource_id UUID,
  
  -- Cambios (para UPDATE/DELETE)
  old_values JSONB,
  new_values JSONB,
  
  -- Metadatos de auditoría
  ip_address INET,
  user_agent TEXT,
  
  -- Resultado
  result VARCHAR(20) DEFAULT 'success',
  error_message TEXT,
  
  -- Timestamp INMUTABLE
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_result CHECK (result IN ('success', 'failure', 'partial')),
  CONSTRAINT audit_immutable CHECK (created_at <= NOW())
);

-- Comentarios
COMMENT ON TABLE public.audit_logs IS 'Registro de auditoría INMUTABLE para compliance GDPR';
COMMENT ON COLUMN public.audit_logs.action IS 'Acción: create_*, read_*, update_*, delete_*, export_*, login, logout';

-- IMPORTANTE: Deshabilitar UPDATE y DELETE en audit_logs
-- Esto se hace via RLS (no hay policy de UPDATE/DELETE)

-- Tabla de registro de eliminaciones (Art. 17 - Derecho al olvido)
CREATE TABLE public.data_retention_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Referencias (pueden ser NULL porque los datos ya fueron eliminados)
  user_id UUID,  -- NO FK porque el usuario fue eliminado
  response_id UUID,  -- NO FK porque la respuesta fue eliminada
  organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  
  -- Razón de eliminación
  deletion_reason VARCHAR(100) NOT NULL,  -- 'user_request', 'retention_expired', 'admin_request'
  
  -- Referencia al backup (si existe)
  backup_reference TEXT,
  
  -- Quién autorizó
  deleted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  
  -- Timestamp
  deleted_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraint
  CONSTRAINT valid_deletion_reason CHECK (
    deletion_reason IN ('user_request', 'retention_expired', 'admin_request', 'legal_request')
  )
);

-- Comentarios
COMMENT ON TABLE public.data_retention_logs IS 'Registro de datos eliminados (GDPR Art. 17 - Derecho al olvido)';
COMMENT ON COLUMN public.data_retention_logs.backup_reference IS 'Referencia al backup encriptado antes de eliminar (si aplica)';

-- Habilitar RLS
ALTER TABLE public.consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_retention_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies para consents
CREATE POLICY "Usuario ve sus propios consentimientos"
  ON public.consents FOR SELECT
  USING (
    user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Usuario puede dar consentimiento"
  ON public.consents FOR INSERT
  WITH CHECK (
    user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Usuario puede revocar su consentimiento"
  ON public.consents FOR UPDATE
  USING (
    user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND revoked = FALSE  -- Solo si no está ya revocado
  );

-- RLS Policies para audit_logs (solo lectura para admins)
CREATE POLICY "Admins ven logs de su organización"
  ON public.audit_logs FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users 
      WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  );

-- INSERT solo via service role (sistema)
CREATE POLICY "Solo sistema puede insertar logs"
  ON public.audit_logs FOR INSERT
  WITH CHECK (false);

-- NO HAY POLICY DE UPDATE/DELETE = INMUTABLE

-- RLS Policies para data_retention_logs
CREATE POLICY "Admins ven logs de retención de su organización"
  ON public.data_retention_logs FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM public.users 
      WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  );

-- Índices
CREATE INDEX idx_consents_user_id ON public.consents(user_id);
CREATE INDEX idx_consents_test_id ON public.consents(test_id);
CREATE INDEX idx_consents_user_test ON public.consents(user_id, test_id);
CREATE INDEX idx_audit_logs_org_id ON public.audit_logs(organization_id);
CREATE INDEX idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_created_at ON public.audit_logs(created_at);
CREATE INDEX idx_audit_logs_resource ON public.audit_logs(resource_type, resource_id);
CREATE INDEX idx_data_retention_deleted_at ON public.data_retention_logs(deleted_at);;
