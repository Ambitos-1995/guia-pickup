-- ============================================================
-- MIGRACIÓN 006: FUNCIONES HELPER Y UTILIDADES
-- Funciones de encriptación, auditoría automática, limpieza
-- ============================================================

-- Función helper: Obtener el user_id del usuario actual
CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS UUID AS $$
  SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.current_user_id() IS 'Retorna el user_id del usuario autenticado actual';

-- Función helper: Obtener organization_id del usuario actual
CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS UUID AS $$
  SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.current_organization_id() IS 'Retorna la organization_id del usuario autenticado actual';

-- Función helper: Verificar si el usuario tiene un rol específico
CREATE OR REPLACE FUNCTION public.user_has_role(required_role VARCHAR)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE auth_user_id = auth.uid() 
    AND role = required_role
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.user_has_role(VARCHAR) IS 'Verifica si el usuario actual tiene el rol especificado';

-- Función helper: Verificar consentimiento válido antes de test
CREATE OR REPLACE FUNCTION public.has_valid_consent(p_user_id UUID, p_test_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.consents 
    WHERE user_id = p_user_id 
    AND test_id = p_test_id 
    AND accepted = TRUE 
    AND revoked = FALSE
  );
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.has_valid_consent(UUID, UUID) IS 'Verifica si un usuario tiene consentimiento válido para un test';

-- Función: Encriptar respuestas (wrapper de pgcrypto)
-- NOTA: La clave debe venir de una variable de entorno, NO hardcodeada
CREATE OR REPLACE FUNCTION public.encrypt_answers(
  p_answers JSONB,
  p_encryption_key TEXT
)
RETURNS BYTEA AS $$
  SELECT extensions.pgp_sym_encrypt(
    p_answers::TEXT,
    p_encryption_key,
    'compress-algo=2, cipher-algo=aes256'
  );
$$ LANGUAGE SQL IMMUTABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.encrypt_answers(JSONB, TEXT) IS 'Encripta respuestas usando AES-256. La clave debe ser segura.';

-- Función: Desencriptar respuestas
CREATE OR REPLACE FUNCTION public.decrypt_answers(
  p_encrypted BYTEA,
  p_encryption_key TEXT
)
RETURNS JSONB AS $$
  SELECT extensions.pgp_sym_decrypt(p_encrypted, p_encryption_key)::JSONB;
$$ LANGUAGE SQL IMMUTABLE SECURITY DEFINER;

COMMENT ON FUNCTION public.decrypt_answers(BYTEA, TEXT) IS 'Desencripta respuestas. Solo usar con autorización.';

-- Función: Registrar acción en audit_log (para triggers)
CREATE OR REPLACE FUNCTION public.log_audit_action()
RETURNS TRIGGER AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_action VARCHAR(100);
  v_old_values JSONB;
  v_new_values JSONB;
BEGIN
  -- Obtener usuario actual
  SELECT id, organization_id INTO v_user_id, v_org_id
  FROM public.users WHERE auth_user_id = auth.uid();
  
  -- Determinar acción
  v_action := TG_ARGV[0] || '_' || TG_OP;
  
  -- Capturar valores
  IF TG_OP = 'DELETE' THEN
    v_old_values := to_jsonb(OLD);
    v_new_values := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old_values := to_jsonb(OLD);
    v_new_values := to_jsonb(NEW);
  ELSE
    v_old_values := NULL;
    v_new_values := to_jsonb(NEW);
  END IF;
  
  -- Insertar log (usando SECURITY DEFINER para bypass RLS)
  INSERT INTO public.audit_logs (
    organization_id,
    user_id,
    action,
    resource_type,
    resource_id,
    old_values,
    new_values
  ) VALUES (
    v_org_id,
    v_user_id,
    v_action,
    TG_TABLE_NAME,
    COALESCE(NEW.id, OLD.id),
    v_old_values,
    v_new_values
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.log_audit_action() IS 'Trigger function para logging automático de cambios';

-- Función: Limpiar tokens expirados (para cron job)
CREATE OR REPLACE FUNCTION public.cleanup_expired_tokens()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.token_blacklist
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.cleanup_expired_tokens() IS 'Elimina tokens expirados de la blacklist. Ejecutar via cron.';

-- Función: Limpiar reportes expirados
CREATE OR REPLACE FUNCTION public.cleanup_expired_reports()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.reports
  WHERE expires_at IS NOT NULL AND expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.cleanup_expired_reports() IS 'Elimina reportes expirados. Ejecutar via cron.';

-- Vista: Resumen de tests por organización (para dashboard)
-- CORREGIDO: Cast explícito a NUMERIC antes de AVG
CREATE OR REPLACE VIEW public.test_summary AS
SELECT 
  td.organization_id,
  td.id AS test_id,
  td.slug,
  td.titulo->>'es' AS titulo_es,
  td.tipo,
  td.status,
  COUNT(DISTINCT r.id) AS total_responses,
  COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'completed') AS completed_responses,
  AVG((s.scores_data->>'total')::NUMERIC)::NUMERIC(10,2) AS avg_score,
  MAX(r.completed_at) AS last_response_at
FROM public.test_definitions td
LEFT JOIN public.responses r ON r.test_id = td.id
LEFT JOIN public.scores s ON s.response_id = r.id
GROUP BY td.id, td.organization_id, td.slug, td.titulo, td.tipo, td.status;

COMMENT ON VIEW public.test_summary IS 'Resumen de tests con estadísticas básicas para dashboard';

-- Triggers de auditoría en tablas críticas
CREATE TRIGGER audit_responses_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.responses
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_action('response');

CREATE TRIGGER audit_consents_changes
  AFTER INSERT OR UPDATE ON public.consents
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_action('consent');

CREATE TRIGGER audit_test_definitions_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.test_definitions
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_action('test_definition');;
