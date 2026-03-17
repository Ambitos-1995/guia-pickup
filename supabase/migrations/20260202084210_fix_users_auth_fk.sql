-- =============================================
-- FIX: Preserve public.users on auth user deletion
-- Issue: auth_user_id FK uses ON DELETE CASCADE, which removes public.users
-- Solution: Allow auth_user_id NULL and set FK to ON DELETE SET NULL
-- =============================================

-- Drop existing FK (if any)
ALTER TABLE public.users
DROP CONSTRAINT IF EXISTS users_auth_user_id_fkey;

-- Allow NULLs for GDPR-anonymized users
ALTER TABLE public.users
ALTER COLUMN auth_user_id DROP NOT NULL;

-- Recreate FK with SET NULL on delete
ALTER TABLE public.users
ADD CONSTRAINT users_auth_user_id_fkey
FOREIGN KEY (auth_user_id)
REFERENCES auth.users(id)
ON DELETE SET NULL;

COMMENT ON COLUMN public.users.auth_user_id IS
'References auth.users.id. Nullable for GDPR anonymized users.';;
