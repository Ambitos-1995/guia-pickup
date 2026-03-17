-- Add status column with default 'active' for backward compatibility
ALTER TABLE public.organizations
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

-- Add constraint for valid status values
ALTER TABLE public.organizations
ADD CONSTRAINT organizations_status_check
CHECK (status IN ('active', 'inactive', 'suspended'));

-- Create index for efficient queries (used in kiosk lookups)
CREATE INDEX IF NOT EXISTS idx_organizations_status
ON public.organizations(status);

-- Add comment for documentation
COMMENT ON COLUMN public.organizations.status IS
  'Organization status: active (operational), inactive (paused), suspended (blocked). Default: active';;
