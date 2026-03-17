-- Crear tabla de invitaciones
CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'respondent' CHECK (role IN ('admin', 'clinician', 'respondent')),
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '7 days',
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices (sin predicados con NOW() que no es IMMUTABLE)
CREATE INDEX idx_invitations_pending_email_org
  ON invitations(email, organization_id)
  WHERE accepted_at IS NULL;

CREATE INDEX idx_invitations_token ON invitations(token) WHERE accepted_at IS NULL;
CREATE INDEX idx_invitations_email ON invitations(email);
CREATE INDEX idx_invitations_org ON invitations(organization_id);
CREATE INDEX idx_invitations_expires ON invitations(expires_at) WHERE accepted_at IS NULL;

-- Habilitar RLS
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

-- Comentarios
COMMENT ON TABLE invitations IS 'Invitaciones para registro de usuarios. Solo admins pueden crear invitaciones.';
COMMENT ON COLUMN invitations.token IS 'Token único de 32 bytes hex para validar la invitación';
COMMENT ON COLUMN invitations.expires_at IS 'Fecha de expiración (7 días por defecto)';
COMMENT ON COLUMN invitations.accepted_at IS 'Timestamp cuando se aceptó la invitación (null si pendiente)';;
