-- Add slug column to organizations if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'organizations'
    AND column_name = 'slug'
  ) THEN
    ALTER TABLE public.organizations ADD COLUMN slug TEXT UNIQUE;
    
    -- Generate slugs for existing organizations
    UPDATE public.organizations
    SET slug = LOWER(REGEXP_REPLACE(name, '[^a-zA-Z0-9]+', '-', 'g'))
    WHERE slug IS NULL;
    
    -- Create index
    CREATE INDEX idx_organizations_slug ON public.organizations(slug);
  END IF;
END $$;;
