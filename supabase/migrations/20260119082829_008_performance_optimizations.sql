-- Migration: 008_performance_optimizations
-- Optimiza RLS policies usando (select auth.uid()) para mejor rendimiento

-- ===========================================
-- INDICES FALTANTES EN FOREIGN KEYS
-- ===========================================

CREATE INDEX IF NOT EXISTS idx_consents_organization_id ON consents(organization_id);
CREATE INDEX IF NOT EXISTS idx_data_retention_logs_deleted_by ON data_retention_logs(deleted_by);
CREATE INDEX IF NOT EXISTS idx_data_retention_logs_organization_id ON data_retention_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_scores_validated_by ON scores(validated_by);
CREATE INDEX IF NOT EXISTS idx_test_definitions_creator_id ON test_definitions(creator_id);
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);

-- ===========================================
-- ORGANIZATIONS
-- ===========================================
DROP POLICY IF EXISTS "Usuarios ven su propia organización" ON organizations;
CREATE POLICY "Usuarios ven su propia organización" ON organizations
  FOR SELECT USING (
    id IN (SELECT organization_id FROM users WHERE auth_user_id = (SELECT auth.uid()))
  );

-- ===========================================
-- USERS
-- ===========================================
DROP POLICY IF EXISTS "Usuarios ven miembros de su organización" ON users;
CREATE POLICY "Usuarios ven miembros de su organización" ON users
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM users WHERE auth_user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Usuarios pueden actualizar su propio perfil" ON users;
CREATE POLICY "Usuarios pueden actualizar su propio perfil" ON users
  FOR UPDATE USING (auth_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Admins pueden insertar usuarios en su organización" ON users;
CREATE POLICY "Admins pueden insertar usuarios en su organización" ON users
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT u.organization_id FROM users u 
      WHERE u.auth_user_id = (SELECT auth.uid()) AND u.role = 'admin'
    )
  );

-- ===========================================
-- TEST_DEFINITIONS
-- ===========================================
DROP POLICY IF EXISTS "Tests activos son visibles para usuarios de la org" ON test_definitions;
CREATE POLICY "Tests activos son visibles para usuarios de la org" ON test_definitions
  FOR SELECT USING (
    organization_id IN (SELECT organization_id FROM users WHERE auth_user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Clinicians y admins pueden crear tests" ON test_definitions;
CREATE POLICY "Clinicians y admins pueden crear tests" ON test_definitions
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT u.organization_id FROM users u 
      WHERE u.auth_user_id = (SELECT auth.uid()) AND u.role IN ('admin', 'clinician')
    )
  );

DROP POLICY IF EXISTS "Creador o admin puede actualizar tests" ON test_definitions;
CREATE POLICY "Creador o admin puede actualizar tests" ON test_definitions
  FOR UPDATE USING (
    creator_id IN (SELECT id FROM users WHERE auth_user_id = (SELECT auth.uid()))
    OR organization_id IN (
      SELECT u.organization_id FROM users u 
      WHERE u.auth_user_id = (SELECT auth.uid()) AND u.role = 'admin'
    )
  );

-- ===========================================
-- RESPONSES
-- ===========================================
DROP POLICY IF EXISTS "Usuario puede crear respuestas" ON responses;
CREATE POLICY "Usuario puede crear respuestas" ON responses
  FOR INSERT WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Usuario ve sus propias respuestas" ON responses;
CREATE POLICY "Usuario ve sus propias respuestas" ON responses
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE auth_user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Usuario puede actualizar sus respuestas en progreso" ON responses;
CREATE POLICY "Usuario puede actualizar sus respuestas en progreso" ON responses
  FOR UPDATE USING (
    user_id IN (SELECT id FROM users WHERE auth_user_id = (SELECT auth.uid()))
    AND status = 'in_progress'
  );

-- ===========================================
-- SCORES (via response_id)
-- ===========================================
DROP POLICY IF EXISTS "Usuario ve sus propios scores" ON scores;
CREATE POLICY "Usuario ve sus propios scores" ON scores
  FOR SELECT USING (
    response_id IN (
      SELECT r.id FROM responses r 
      WHERE r.user_id IN (SELECT id FROM users WHERE auth_user_id = (SELECT auth.uid()))
    )
  );

-- ===========================================
-- CONSENTS
-- ===========================================
DROP POLICY IF EXISTS "Usuario puede dar consentimiento" ON consents;
CREATE POLICY "Usuario puede dar consentimiento" ON consents
  FOR INSERT WITH CHECK (
    user_id IN (SELECT id FROM users WHERE auth_user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Usuario ve sus propios consentimientos" ON consents;
CREATE POLICY "Usuario ve sus propios consentimientos" ON consents
  FOR SELECT USING (
    user_id IN (SELECT id FROM users WHERE auth_user_id = (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "Usuario puede revocar su consentimiento" ON consents;
CREATE POLICY "Usuario puede revocar su consentimiento" ON consents
  FOR UPDATE USING (
    user_id IN (SELECT id FROM users WHERE auth_user_id = (SELECT auth.uid()))
  );

-- ===========================================
-- AUDIT_LOGS
-- ===========================================
DROP POLICY IF EXISTS "Admins ven logs de su organización" ON audit_logs;
CREATE POLICY "Admins ven logs de su organización" ON audit_logs
  FOR SELECT USING (
    organization_id IN (
      SELECT u.organization_id FROM users u 
      WHERE u.auth_user_id = (SELECT auth.uid()) AND u.role = 'admin'
    )
  );

-- ===========================================
-- DATA_RETENTION_LOGS
-- ===========================================
DROP POLICY IF EXISTS "Admins ven logs de retención de su organización" ON data_retention_logs;
CREATE POLICY "Admins ven logs de retención de su organización" ON data_retention_logs
  FOR SELECT USING (
    organization_id IN (
      SELECT u.organization_id FROM users u 
      WHERE u.auth_user_id = (SELECT auth.uid()) AND u.role = 'admin'
    )
  );

-- ===========================================
-- REPORTS (via response_id)
-- ===========================================
DROP POLICY IF EXISTS "Usuario ve sus propios reportes" ON reports;
CREATE POLICY "Usuario ve sus propios reportes" ON reports
  FOR SELECT USING (
    response_id IN (
      SELECT r.id FROM responses r 
      WHERE r.user_id IN (SELECT id FROM users WHERE auth_user_id = (SELECT auth.uid()))
    )
  );

-- ===========================================
-- ORGANIZATION_SETTINGS
-- ===========================================
DROP POLICY IF EXISTS "Admins ven config de su organización" ON organization_settings;
CREATE POLICY "Admins ven config de su organización" ON organization_settings
  FOR SELECT USING (
    organization_id IN (
      SELECT u.organization_id FROM users u 
      WHERE u.auth_user_id = (SELECT auth.uid()) AND u.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "Solo admins pueden actualizar config" ON organization_settings;
CREATE POLICY "Solo admins pueden actualizar config" ON organization_settings
  FOR UPDATE USING (
    organization_id IN (
      SELECT u.organization_id FROM users u 
      WHERE u.auth_user_id = (SELECT auth.uid()) AND u.role = 'admin'
    )
  );;
