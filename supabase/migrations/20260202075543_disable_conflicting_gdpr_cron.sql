-- FIX: DESHABILITAR PG_CRON GDPR CONFLICTIVO
-- Issue: Hay dos mecanismos de retención GDPR (pg_cron + Edge Function) con políticas diferentes

-- Deshabilitar el job de pg_cron si existe
DO $$
BEGIN
  PERFORM cron.unschedule('gdpr-retention-daily');
  RAISE NOTICE 'pg_cron job gdpr-retention-daily deshabilitado exitosamente';
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'pg_cron no está instalado, saltando...';
  WHEN undefined_function THEN
    RAISE NOTICE 'pg_cron no está disponible, saltando...';
  WHEN OTHERS THEN
    RAISE NOTICE 'Job gdpr-retention-daily no encontrado o ya deshabilitado';
END;
$$;

-- Crear tabla de configuración de retención por organización si no existe
CREATE TABLE IF NOT EXISTS organization_retention_settings (
  organization_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  data_retention_days INTEGER NOT NULL DEFAULT 1825,
  anonymize_responses BOOLEAN NOT NULL DEFAULT true,
  delete_responses BOOLEAN NOT NULL DEFAULT false,
  notify_before_anonymization BOOLEAN NOT NULL DEFAULT true,
  notification_days_before INTEGER NOT NULL DEFAULT 30,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_retention_days CHECK (data_retention_days >= 365),
  CONSTRAINT valid_notification_days CHECK (notification_days_before >= 7 AND notification_days_before <= 90)
);

-- Índice para búsqueda eficiente
CREATE INDEX IF NOT EXISTS idx_org_retention_settings_org
ON organization_retention_settings(organization_id);

-- RLS para la tabla de configuración
ALTER TABLE organization_retention_settings ENABLE ROW LEVEL SECURITY;

-- Solo admins de la organización pueden ver/modificar sus configuraciones
DROP POLICY IF EXISTS "Admins can manage retention settings" ON organization_retention_settings;
CREATE POLICY "Admins can manage retention settings" ON organization_retention_settings
  FOR ALL USING (
    organization_id IN (
      SELECT organization_id FROM users
      WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  );

-- Comentario de documentación
COMMENT ON TABLE organization_retention_settings IS
'Configuración de retención de datos GDPR por organización. Default: 5 años con anonimización.';;
