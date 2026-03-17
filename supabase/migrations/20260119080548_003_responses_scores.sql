-- ============================================================
-- MIGRACIÓN 003: TABLAS DE RESPUESTAS Y SCORES
-- Respuestas encriptadas (GDPR) + Scores calculados
-- ============================================================

-- Tabla de respuestas (datos sensibles encriptados)
CREATE TABLE public.responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id UUID NOT NULL REFERENCES public.test_definitions(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  
  -- Respuestas ENCRIPTADAS con pgcrypto
  -- Se usa pgp_sym_encrypt(data::text, key) para insertar
  -- Se usa pgp_sym_decrypt(answers_encrypted, key) para leer
  answers_encrypted BYTEA NOT NULL,
  
  -- Estado del test
  status VARCHAR(50) DEFAULT 'in_progress',
  
  -- Timestamps de sesión
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  
  -- Metadatos de auditoría (GDPR)
  ip_address INET,
  user_agent TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_response_status CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  CONSTRAINT completed_has_timestamp CHECK (
    status != 'completed' OR completed_at IS NOT NULL
  )
);

-- Comentarios
COMMENT ON TABLE public.responses IS 'Respuestas a tests - datos sensibles encriptados con pgcrypto';
COMMENT ON COLUMN public.responses.answers_encrypted IS 'Respuestas encriptadas con pgp_sym_encrypt. NUNCA almacenar en texto plano.';

-- Tabla de scores (resultados calculados - NO encriptados para análisis)
CREATE TABLE public.scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id UUID UNIQUE NOT NULL REFERENCES public.responses(id) ON DELETE CASCADE,
  test_id UUID NOT NULL REFERENCES public.test_definitions(id) ON DELETE RESTRICT,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  
  -- Resultados calculados
  scores_data JSONB NOT NULL,  -- {"total": 15, "domains": {"cognition": 3, ...}}
  
  -- Interpretación
  interpretation JSONB,  -- {"level": "moderate", "label": "...", "color": "#FFC107"}
  percentile INTEGER,
  risk_flags TEXT[],  -- ["suicidal_ideation", "severe_depression"]
  
  -- Validación clínica (opcional)
  validated_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  clinical_notes TEXT,
  
  -- Timestamp
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraint: percentil válido
  CONSTRAINT valid_percentile CHECK (percentile IS NULL OR (percentile >= 0 AND percentile <= 100))
);

-- Comentarios
COMMENT ON TABLE public.scores IS 'Scores calculados a partir de respuestas. No contiene datos identificables.';
COMMENT ON COLUMN public.scores.scores_data IS 'Resultado del motor de scoring: total, por dominio, etc.';
COMMENT ON COLUMN public.scores.risk_flags IS 'Alertas de seguridad detectadas (ej: ideación suicida)';

-- Habilitar RLS
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scores ENABLE ROW LEVEL SECURITY;

-- RLS Policies para responses
CREATE POLICY "Usuario ve sus propias respuestas"
  ON public.responses FOR SELECT
  USING (
    -- Es el dueño de la respuesta
    user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    OR
    -- Es clinician/admin de la organización
    organization_id IN (
      SELECT organization_id FROM public.users 
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

CREATE POLICY "Usuario puede crear respuestas"
  ON public.responses FOR INSERT
  WITH CHECK (
    user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
  );

CREATE POLICY "Usuario puede actualizar sus respuestas en progreso"
  ON public.responses FOR UPDATE
  USING (
    user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    AND status = 'in_progress'
  );

-- RLS Policies para scores
CREATE POLICY "Usuario ve sus propios scores"
  ON public.scores FOR SELECT
  USING (
    -- Es el dueño (via response)
    response_id IN (
      SELECT id FROM public.responses 
      WHERE user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    )
    OR
    -- Es clinician/admin de la organización
    organization_id IN (
      SELECT organization_id FROM public.users 
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

-- Scores solo se insertan/actualizan via service role (sistema)
CREATE POLICY "Solo sistema puede insertar scores"
  ON public.scores FOR INSERT
  WITH CHECK (false);  -- Solo service role puede saltarse RLS

CREATE POLICY "Solo sistema puede actualizar scores"
  ON public.scores FOR UPDATE
  USING (false);  -- Solo service role puede saltarse RLS

-- Índices
CREATE INDEX idx_responses_user_id ON public.responses(user_id);
CREATE INDEX idx_responses_test_id ON public.responses(test_id);
CREATE INDEX idx_responses_org_id ON public.responses(organization_id);
CREATE INDEX idx_responses_status ON public.responses(status);
CREATE INDEX idx_responses_completed_at ON public.responses(completed_at);
CREATE INDEX idx_scores_response_id ON public.scores(response_id);
CREATE INDEX idx_scores_org_id ON public.scores(organization_id);
CREATE INDEX idx_scores_test_id ON public.scores(test_id);;
