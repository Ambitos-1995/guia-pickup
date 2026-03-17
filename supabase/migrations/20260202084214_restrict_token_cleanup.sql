-- =============================================
-- FIX: Restrict cleanup_expired_tokens execution
-- Issue: authenticated users can execute SECURITY DEFINER cleanup
-- Solution: Restrict to service_role only
-- =============================================

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_tokens() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_tokens() FROM public;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_tokens() TO service_role;;
