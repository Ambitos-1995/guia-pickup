-- ============================================================
-- MIGRACIÓN 007: FIXES DE SEGURIDAD
-- Corrige warnings del security advisor
-- ============================================================

-- Fix 1: Recrear vista sin SECURITY DEFINER
DROP VIEW IF EXISTS public.test_summary;

CREATE VIEW public.test_summary 
WITH (security_invoker = true) AS
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

-- Fix 2: Funciones con search_path inmutable
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_id()
RETURNS UUID 
LANGUAGE SQL 
STABLE 
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS UUID 
LANGUAGE SQL 
STABLE 
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT organization_id FROM public.users WHERE auth_user_id = auth.uid() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.user_has_role(required_role VARCHAR)
RETURNS BOOLEAN 
LANGUAGE SQL 
STABLE 
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users 
    WHERE auth_user_id = auth.uid() 
    AND role = required_role
  );
$$;

CREATE OR REPLACE FUNCTION public.has_valid_consent(p_user_id UUID, p_test_id UUID)
RETURNS BOOLEAN 
LANGUAGE SQL 
STABLE 
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.consents 
    WHERE user_id = p_user_id 
    AND test_id = p_test_id 
    AND accepted = TRUE 
    AND revoked = FALSE
  );
$$;

CREATE OR REPLACE FUNCTION public.encrypt_answers(
  p_answers JSONB,
  p_encryption_key TEXT
)
RETURNS BYTEA 
LANGUAGE SQL 
IMMUTABLE 
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT extensions.pgp_sym_encrypt(
    p_answers::TEXT,
    p_encryption_key,
    'compress-algo=2, cipher-algo=aes256'
  );
$$;

CREATE OR REPLACE FUNCTION public.decrypt_answers(
  p_encrypted BYTEA,
  p_encryption_key TEXT
)
RETURNS JSONB 
LANGUAGE SQL 
IMMUTABLE 
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT extensions.pgp_sym_decrypt(p_encrypted, p_encryption_key)::JSONB;
$$;

CREATE OR REPLACE FUNCTION public.log_audit_action()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_org_id UUID;
  v_action VARCHAR(100);
  v_old_values JSONB;
  v_new_values JSONB;
BEGIN
  SELECT id, organization_id INTO v_user_id, v_org_id
  FROM public.users WHERE auth_user_id = auth.uid();
  
  v_action := TG_ARGV[0] || '_' || TG_OP;
  
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
  
  INSERT INTO public.audit_logs (
    organization_id, user_id, action, resource_type, resource_id, old_values, new_values
  ) VALUES (
    v_org_id, v_user_id, v_action, TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), v_old_values, v_new_values
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_tokens()
RETURNS INTEGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.token_blacklist WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_expired_reports()
RETURNS INTEGER 
LANGUAGE plpgsql 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.reports WHERE expires_at IS NOT NULL AND expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- Fix 3: Policy para token_blacklist (solo lectura por service role, pero añadimos una dummy)
-- NOTA: Esta tabla es intencionalmente restringida - solo backend con service_role puede acceder
-- Añadimos policy que siempre retorna false para silenciar el warning
CREATE POLICY "No public access to token_blacklist"
  ON public.token_blacklist FOR ALL
  USING (false);;
