-- ============================================================
-- MIGRACIÓN 002: TABLA DE DEFINICIONES DE TESTS
-- Tests como configuración (YAML/JSON), no como código
-- ============================================================

-- Tabla de definiciones de tests
CREATE TABLE public.test_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  creator_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  
  -- Identificación y versionado
  slug VARCHAR(100) NOT NULL,
  version VARCHAR(20) DEFAULT '1.0.0',
  status VARCHAR(20) DEFAULT 'draft',
  
  -- Metadatos multiidioma
  titulo JSONB NOT NULL,  -- {"es": "...", "en": "..."}
  descripcion JSONB,
  instrucciones JSONB,
  
  -- Clasificación
  tipo VARCHAR(100) NOT NULL,  -- 'WHODAS', 'PHQ-9', 'COPM', etc.
  domain VARCHAR(100),  -- 'mental_health', 'disability', etc.
  purpose VARCHAR(50),  -- 'screening', 'diagnostic', 'monitoring'
  
  -- Definición completa del test (estructura YAML/JSON)
  definition JSONB NOT NULL,
  
  -- Configuración de scoring
  scoring_config JSONB NOT NULL,
  
  -- Códigos estándar (LOINC, SNOMED)
  codes JSONB,  -- {"loinc": "44249-1", "snomed": "..."}
  
  -- Configuración de entrega
  delivery_config JSONB DEFAULT '{
    "randomize_items": false,
    "allow_skip": false,
    "allow_back_navigation": true,
    "show_progress": true,
    "auto_save": true,
    "auto_save_interval_seconds": 30
  }',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT valid_status CHECK (status IN ('draft', 'active', 'retired')),
  CONSTRAINT valid_purpose CHECK (purpose IS NULL OR purpose IN ('screening', 'diagnostic', 'monitoring', 'outcome')),
  CONSTRAINT unique_test_version UNIQUE (organization_id, slug, version)
);

-- Comentarios
COMMENT ON TABLE public.test_definitions IS 'Definiciones de tests psicométricos en formato JSON/YAML';
COMMENT ON COLUMN public.test_definitions.definition IS 'Estructura completa: items, escalas de respuesta, skip logic';
COMMENT ON COLUMN public.test_definitions.scoring_config IS 'Reglas de scoring: método (sum, IRT), interpretaciones, alertas';
COMMENT ON COLUMN public.test_definitions.codes IS 'Códigos estándar para interoperabilidad (LOINC, SNOMED, FHIR)';

-- Trigger updated_at
CREATE TRIGGER update_test_definitions_updated_at
  BEFORE UPDATE ON public.test_definitions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar RLS
ALTER TABLE public.test_definitions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Tests activos son visibles para usuarios de la org"
  ON public.test_definitions FOR SELECT
  USING (
    -- Tests activos de la misma organización
    (status = 'active' AND organization_id IN (
      SELECT organization_id FROM public.users 
      WHERE auth_user_id = auth.uid()
    ))
    OR
    -- Drafts solo para clinicians/admins de la org
    (status IN ('draft', 'retired') AND organization_id IN (
      SELECT organization_id FROM public.users 
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    ))
  );

CREATE POLICY "Clinicians y admins pueden crear tests"
  ON public.test_definitions FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM public.users 
      WHERE auth_user_id = auth.uid() AND role IN ('admin', 'clinician')
    )
  );

CREATE POLICY "Creador o admin puede actualizar tests"
  ON public.test_definitions FOR UPDATE
  USING (
    -- Es el creador
    creator_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
    OR
    -- Es admin de la organización
    organization_id IN (
      SELECT organization_id FROM public.users 
      WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  );

-- Índices
CREATE INDEX idx_test_definitions_org_id ON public.test_definitions(organization_id);
CREATE INDEX idx_test_definitions_status ON public.test_definitions(status);
CREATE INDEX idx_test_definitions_tipo ON public.test_definitions(tipo);
CREATE INDEX idx_test_definitions_slug ON public.test_definitions(slug);;
