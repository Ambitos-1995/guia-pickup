CREATE TABLE IF NOT EXISTS public.dashboard_quick_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  completed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dashboard_quick_notes_user_id
  ON public.dashboard_quick_notes(user_id);

CREATE INDEX IF NOT EXISTS idx_dashboard_quick_notes_created_at
  ON public.dashboard_quick_notes(created_at DESC);

ALTER TABLE public.dashboard_quick_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own quick notes"
  ON public.dashboard_quick_notes
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own quick notes"
  ON public.dashboard_quick_notes
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own quick notes"
  ON public.dashboard_quick_notes
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own quick notes"
  ON public.dashboard_quick_notes
  FOR DELETE
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.update_dashboard_quick_notes_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_dashboard_quick_notes_timestamp
  BEFORE UPDATE ON public.dashboard_quick_notes
  FOR EACH ROW
  EXECUTE FUNCTION public.update_dashboard_quick_notes_updated_at();

COMMENT ON TABLE public.dashboard_quick_notes IS 'Notas rápidas personales del dashboard.';;
