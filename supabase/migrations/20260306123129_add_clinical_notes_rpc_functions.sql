
-- RPC function to get a clinical note with decrypted content
-- Decryption happens server-side in SQL so BYTEA never leaves the DB as base64
CREATE OR REPLACE FUNCTION get_decrypted_clinical_note(
  p_note_id UUID,
  p_organization_id UUID,
  p_encryption_key TEXT
)
RETURNS TABLE(
  id UUID,
  user_id UUID,
  organization_id UUID,
  response_id UUID,
  clinician_id UUID,
  note_type TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  content TEXT,
  clinician_email TEXT,
  patient_email TEXT
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  SELECT
    cn.id,
    cn.user_id,
    cn.organization_id,
    cn.response_id,
    cn.clinician_id,
    cn.note_type,
    cn.created_at,
    cn.updated_at,
    extensions.pgp_sym_decrypt(cn.note_encrypted, p_encryption_key)::TEXT AS content,
    clinician.email AS clinician_email,
    patient.email AS patient_email
  FROM clinical_notes cn
  LEFT JOIN users clinician ON clinician.id = cn.clinician_id
  LEFT JOIN users patient ON patient.id = cn.user_id
  WHERE cn.id = p_note_id
    AND cn.organization_id = p_organization_id;
$$;

-- RPC function to insert a clinical note with encrypted content
-- Encryption happens server-side so plaintext never touches the JS layer as BYTEA
CREATE OR REPLACE FUNCTION insert_encrypted_clinical_note(
  p_user_id UUID,
  p_organization_id UUID,
  p_clinician_id UUID,
  p_response_id UUID,
  p_note_type TEXT,
  p_content TEXT,
  p_encryption_key TEXT
)
RETURNS TABLE(
  id UUID,
  user_id UUID,
  organization_id UUID,
  response_id UUID,
  clinician_id UUID,
  note_type TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE sql
VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
  INSERT INTO clinical_notes (user_id, organization_id, clinician_id, response_id, note_type, note_encrypted)
  VALUES (
    p_user_id,
    p_organization_id,
    p_clinician_id,
    p_response_id,
    p_note_type,
    extensions.pgp_sym_encrypt(p_content, p_encryption_key, 'compress-algo=2, cipher-algo=aes256')
  )
  RETURNING
    id, user_id, organization_id, response_id, clinician_id, note_type, created_at, updated_at;
$$;

-- RPC function to update a clinical note with re-encrypted content
CREATE OR REPLACE FUNCTION update_encrypted_clinical_note(
  p_note_id UUID,
  p_organization_id UUID,
  p_clinician_id UUID,
  p_note_type TEXT,
  p_content TEXT,
  p_encryption_key TEXT
)
RETURNS TABLE(
  id UUID,
  user_id UUID,
  organization_id UUID,
  response_id UUID,
  clinician_id UUID,
  note_type TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
VOLATILE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  RETURN QUERY
  UPDATE clinical_notes cn
  SET
    note_type = COALESCE(p_note_type, cn.note_type),
    note_encrypted = CASE
      WHEN p_content IS NOT NULL THEN
        extensions.pgp_sym_encrypt(p_content, p_encryption_key, 'compress-algo=2, cipher-algo=aes256')
      ELSE cn.note_encrypted
    END,
    updated_at = NOW()
  WHERE cn.id = p_note_id
    AND cn.organization_id = p_organization_id
    AND cn.clinician_id = p_clinician_id
  RETURNING
    cn.id, cn.user_id, cn.organization_id, cn.response_id, cn.clinician_id, cn.note_type, cn.created_at, cn.updated_at;
END;
$$;

-- Restrict execute to service_role only (same pattern as other encryption functions)
REVOKE EXECUTE ON FUNCTION get_decrypted_clinical_note(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION insert_encrypted_clinical_note(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION update_encrypted_clinical_note(UUID, UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
;
