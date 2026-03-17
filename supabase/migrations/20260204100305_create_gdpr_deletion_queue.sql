-- GDPR Deletion Queue Table
-- Implements scheduled deletions for GDPR Art. 17 (Right to Erasure)

CREATE TABLE IF NOT EXISTS public.gdpr_deletion_queue (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    scheduled_for TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    error_message TEXT,
    completed_at TIMESTAMPTZ,
    requested_by UUID REFERENCES public.users(id),
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Comment on table
COMMENT ON TABLE public.gdpr_deletion_queue IS 'Cola de eliminaciones GDPR programadas (Art. 17 - Derecho al olvido). Permite período de gracia de 30 días.';

-- Comments on columns
COMMENT ON COLUMN public.gdpr_deletion_queue.status IS 'Estado: pending (esperando), processing (ejecutando), completed (eliminado), failed (error), cancelled (cancelado por usuario)';
COMMENT ON COLUMN public.gdpr_deletion_queue.scheduled_for IS 'Fecha programada para ejecutar la eliminación (default: 30 días desde solicitud)';
COMMENT ON COLUMN public.gdpr_deletion_queue.error_message IS 'Mensaje de error si status = failed';

-- Partial unique index to ensure only one pending/processing deletion per user per org
CREATE UNIQUE INDEX IF NOT EXISTS idx_gdpr_deletion_queue_unique_pending 
    ON public.gdpr_deletion_queue(user_id, organization_id) 
    WHERE status IN ('pending', 'processing');

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_gdpr_deletion_queue_status ON public.gdpr_deletion_queue(status);
CREATE INDEX IF NOT EXISTS idx_gdpr_deletion_queue_scheduled ON public.gdpr_deletion_queue(scheduled_for) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_gdpr_deletion_queue_org ON public.gdpr_deletion_queue(organization_id);
CREATE INDEX IF NOT EXISTS idx_gdpr_deletion_queue_user ON public.gdpr_deletion_queue(user_id);

-- Enable RLS
ALTER TABLE public.gdpr_deletion_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Admins can view all deletions in their organization
CREATE POLICY "gdpr_deletion_queue_admin_select" ON public.gdpr_deletion_queue
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM public.users 
            WHERE auth_user_id = auth.uid() AND role = 'admin'
        )
    );

-- Users can view their own deletion requests
CREATE POLICY "gdpr_deletion_queue_user_select" ON public.gdpr_deletion_queue
    FOR SELECT
    USING (
        user_id IN (
            SELECT id FROM public.users WHERE auth_user_id = auth.uid()
        )
    );

-- Only admins or the user themselves can insert deletion requests
CREATE POLICY "gdpr_deletion_queue_insert" ON public.gdpr_deletion_queue
    FOR INSERT
    WITH CHECK (
        -- User requesting their own deletion
        user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        OR
        -- Admin in the same organization
        organization_id IN (
            SELECT organization_id FROM public.users 
            WHERE auth_user_id = auth.uid() AND role = 'admin'
        )
    );

-- Only admins can update (to process or cancel)
CREATE POLICY "gdpr_deletion_queue_admin_update" ON public.gdpr_deletion_queue
    FOR UPDATE
    USING (
        organization_id IN (
            SELECT organization_id FROM public.users 
            WHERE auth_user_id = auth.uid() AND role = 'admin'
        )
    );

-- Users can cancel their own pending deletions
CREATE POLICY "gdpr_deletion_queue_user_cancel" ON public.gdpr_deletion_queue
    FOR UPDATE
    USING (
        user_id IN (SELECT id FROM public.users WHERE auth_user_id = auth.uid())
        AND status = 'pending'
    );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_gdpr_deletion_queue_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_gdpr_deletion_queue_updated_at
    BEFORE UPDATE ON public.gdpr_deletion_queue
    FOR EACH ROW
    EXECUTE FUNCTION update_gdpr_deletion_queue_updated_at();;
