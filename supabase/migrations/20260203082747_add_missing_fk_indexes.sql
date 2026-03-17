-- Migration: Add missing indexes for foreign keys
-- Issue: Foreign key constraints without covering indexes impact join performance
-- Reference: https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

-- Index for attendances.created_by FK
CREATE INDEX IF NOT EXISTS idx_attendances_created_by_fk
  ON public.attendances(created_by);

-- Index for invitations.invited_by FK
CREATE INDEX IF NOT EXISTS idx_invitations_invited_by_fk
  ON public.invitations(invited_by);

-- Index for package_deliveries.created_by FK
CREATE INDEX IF NOT EXISTS idx_package_deliveries_created_by_fk
  ON public.package_deliveries(created_by);;
