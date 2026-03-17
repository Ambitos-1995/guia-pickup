-- FIX: RLS INVITATIONS - Comparación Correcta
-- Issue: Las políticas RLS comparan users.id = auth.uid() pero debe ser auth_user_id = auth.uid()

-- Recrear políticas con comparación correcta: auth_user_id = auth.uid()

-- Policy: Admins de la organización pueden ver todas las invitaciones de su org
CREATE POLICY "Admins can view org invitations" ON invitations
  FOR SELECT USING (
    organization_id IN (
      SELECT organization_id FROM users
      WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Admins pueden crear invitaciones para su org
CREATE POLICY "Admins can create invitations" ON invitations
  FOR INSERT WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM users
      WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
    AND invited_by IN (
      SELECT id FROM users WHERE auth_user_id = auth.uid()
    )
  );

-- Policy: Admins pueden actualizar invitaciones de su org
CREATE POLICY "Admins can update invitations" ON invitations
  FOR UPDATE USING (
    organization_id IN (
      SELECT organization_id FROM users
      WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  );

-- Policy: Admins pueden revocar invitaciones de su org
CREATE POLICY "Admins can delete invitations" ON invitations
  FOR DELETE USING (
    organization_id IN (
      SELECT organization_id FROM users
      WHERE auth_user_id = auth.uid() AND role = 'admin'
    )
  );

-- Policy adicional: Usuarios pueden ver invitaciones pendientes por su email
CREATE POLICY "Users can view their own pending invitations" ON invitations
  FOR SELECT USING (
    email = (
      SELECT email FROM auth.users WHERE id = auth.uid()
    )
    AND accepted_at IS NULL
    AND expires_at > NOW()
  );

-- Comentario de documentación
COMMENT ON POLICY "Admins can view org invitations" ON invitations IS
'FIX: Usa auth_user_id = auth.uid() en lugar de id = auth.uid()';;
