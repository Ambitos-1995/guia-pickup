-- Migración: Alinear tabla consents con servicios GDPR
-- Agrega soporte para consentimiento por tipo (data_processing, test_participation, etc.)

-- Agregar columna consent_type si no existe
ALTER TABLE public.consents 
ADD COLUMN IF NOT EXISTS consent_type VARCHAR(50);

-- Agregar columna consent_text si no existe  
ALTER TABLE public.consents 
ADD COLUMN IF NOT EXISTS consent_text TEXT;

-- Agregar columna version si no existe (renombrar consent_text_version)
ALTER TABLE public.consents 
ADD COLUMN IF NOT EXISTS version VARCHAR(20);

-- Migrar datos existentes: copiar consent_text_version a version
UPDATE public.consents 
SET version = consent_text_version 
WHERE version IS NULL AND consent_text_version IS NOT NULL;

-- Si test_id era usado como proxy de consent_type, migrar a consent_type 'test_participation'
UPDATE public.consents 
SET consent_type = 'test_participation' 
WHERE consent_type IS NULL AND test_id IS NOT NULL;

-- Hacer test_id nullable (ya no es el identificador principal)
ALTER TABLE public.consents 
ALTER COLUMN test_id DROP NOT NULL;

-- Agregar índice para búsquedas por tipo de consentimiento
CREATE INDEX IF NOT EXISTS idx_consents_user_type 
ON public.consents(user_id, consent_type);

-- Agregar índice para búsquedas de consentimientos activos
CREATE INDEX IF NOT EXISTS idx_consents_active 
ON public.consents(user_id, consent_type, accepted) 
WHERE revoked_at IS NULL;

-- Comentario para documentación
COMMENT ON COLUMN public.consents.consent_type IS 'Tipo de consentimiento: data_processing, test_participation, data_retention, marketing';
COMMENT ON COLUMN public.consents.version IS 'Versión del texto de consentimiento aceptado';
COMMENT ON COLUMN public.consents.consent_text IS 'Texto completo del consentimiento presentado al usuario';;
