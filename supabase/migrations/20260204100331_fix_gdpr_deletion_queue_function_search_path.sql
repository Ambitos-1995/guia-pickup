-- Fix search_path security for update_gdpr_deletion_queue_updated_at function
CREATE OR REPLACE FUNCTION public.update_gdpr_deletion_queue_updated_at()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;;
