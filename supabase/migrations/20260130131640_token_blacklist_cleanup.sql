-- Create cleanup function
CREATE OR REPLACE FUNCTION public.cleanup_expired_tokens()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM public.token_blacklist
    WHERE expires_at < now()
    RETURNING *
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  IF deleted_count > 0 THEN
    INSERT INTO public.audit_logs (
      action,
      resource_type,
      resource_id,
      new_values,
      result,
      created_at
    ) VALUES (
      'token_blacklist_cleanup',
      'system',
      'cron_job',
      jsonb_build_object('deleted_count', deleted_count, 'executed_at', now()),
      'success',
      now()
    );
  END IF;

  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cleanup_expired_tokens() TO authenticated;

COMMENT ON FUNCTION public.cleanup_expired_tokens() IS
  'Removes expired tokens from token_blacklist table. Can be scheduled via pg_cron or called manually.';;
