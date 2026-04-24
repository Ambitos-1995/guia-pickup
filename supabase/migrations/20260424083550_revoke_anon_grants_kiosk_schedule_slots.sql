-- Defense in depth: revoke anon privileges on kiosk_schedule_slots.
-- RLS already blocks anon (no policy exists for anon after
-- 20260317132238_harden_kiosk_schedule_security.sql dropped the public
-- read policy), and the app no longer subscribes to Realtime as anon.
-- Removing the grants eliminates the fallback surface if RLS is ever
-- disabled or misconfigured.
REVOKE ALL ON public.kiosk_schedule_slots FROM anon;
-- Keep the table in supabase_realtime publication removal-safe: only
-- service_role writes trigger events, and no anon subscribers remain.
