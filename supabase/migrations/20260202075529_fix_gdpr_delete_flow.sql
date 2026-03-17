-- FIX: GDPR DELETE FLOW - Estado 'anonymized'
-- Issue: El flujo de derecho al olvido usa 'inactive' en lugar de 'anonymized'

-- Verificar y actualizar constraint de estado para incluir 'anonymized'
ALTER TABLE public.users
DROP CONSTRAINT IF EXISTS users_estado_check;

ALTER TABLE public.users
ADD CONSTRAINT users_estado_check
CHECK (estado IN ('active', 'inactive', 'suspended', 'anonymized'));

-- Índice parcial para búsqueda eficiente de usuarios anonimizados
CREATE INDEX IF NOT EXISTS idx_users_estado_anonymized
ON public.users(id) WHERE estado = 'anonymized';

-- Índice para búsqueda de usuarios por estado (general)
CREATE INDEX IF NOT EXISTS idx_users_estado
ON public.users(estado);

-- Comentario de documentación
COMMENT ON CONSTRAINT users_estado_check ON public.users IS
'Estados válidos: active (activo), inactive (inactivo temporal), suspended (suspendido por admin), anonymized (GDPR Art.17 eliminado)';;
