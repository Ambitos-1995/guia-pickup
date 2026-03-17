
-- Fix advisor finding: function_search_path_mutable
-- Set search_path to prevent search_path hijacking attacks
CREATE OR REPLACE FUNCTION public.update_dashboard_quick_notes_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;
;
