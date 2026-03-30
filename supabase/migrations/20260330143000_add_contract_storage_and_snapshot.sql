ALTER TABLE public.kiosk_contracts
    ADD COLUMN IF NOT EXISTS document_storage_path TEXT,
    ADD COLUMN IF NOT EXISTS document_snapshot_json JSONB;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'contract-signatures',
    'contract-signatures',
    false,
    524288,
    ARRAY['image/png']
)
ON CONFLICT (id) DO UPDATE
SET
    name = EXCLUDED.name,
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'contract-documents',
    'contract-documents',
    false,
    1048576,
    ARRAY['application/json']
)
ON CONFLICT (id) DO UPDATE
SET
    name = EXCLUDED.name,
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;
