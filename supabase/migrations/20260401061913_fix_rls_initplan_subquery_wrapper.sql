-- ============================================================
-- FIX auth_rls_initplan ROUND 2: wrap auth.uid() inside subqueries
-- Pattern: WHERE users.auth_user_id = auth.uid()
--       -> WHERE users.auth_user_id = (select auth.uid())
-- ============================================================

-- ============================================================
-- TABLE: gdpr_deletion_queue
-- ============================================================
ALTER POLICY "gdpr_deletion_queue_admin_select"
  ON public.gdpr_deletion_queue
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = 'admin'::text
    )
  );

ALTER POLICY "gdpr_deletion_queue_admin_update"
  ON public.gdpr_deletion_queue
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = 'admin'::text
    )
  );

ALTER POLICY "gdpr_deletion_queue_insert"
  ON public.gdpr_deletion_queue
  WITH CHECK (
    (user_id IN (
      SELECT users.id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
    ))
    OR
    (organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = 'admin'::text
    ))
  );

ALTER POLICY "gdpr_deletion_queue_user_cancel"
  ON public.gdpr_deletion_queue
  USING (
    user_id IN (
      SELECT users.id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
    )
    AND status = 'pending'::text
  );

ALTER POLICY "gdpr_deletion_queue_user_select"
  ON public.gdpr_deletion_queue
  USING (
    user_id IN (
      SELECT users.id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
    )
  );

-- ============================================================
-- TABLE: assessment_history
-- ============================================================
ALTER POLICY "users_view_own_assessment_history"
  ON public.assessment_history
  USING (
    user_id IN (
      SELECT users.id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
    )
  );

ALTER POLICY "staff_view_org_assessment_history"
  ON public.assessment_history
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  );

ALTER POLICY "staff_insert_org_assessment_history"
  ON public.assessment_history
  WITH CHECK (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  );

-- ============================================================
-- TABLE: assessment_sessions
-- ============================================================
ALTER POLICY "staff_view_org_assessment_sessions"
  ON public.assessment_sessions
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  );

ALTER POLICY "staff_insert_org_assessment_sessions"
  ON public.assessment_sessions
  WITH CHECK (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  );

ALTER POLICY "staff_update_org_assessment_sessions"
  ON public.assessment_sessions
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  );

-- ============================================================
-- TABLE: clinical_notes
-- ============================================================
ALTER POLICY "staff_view_org_clinical_notes"
  ON public.clinical_notes
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  );

ALTER POLICY "staff_insert_org_clinical_notes"
  ON public.clinical_notes
  WITH CHECK (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  );

ALTER POLICY "staff_update_own_clinical_notes"
  ON public.clinical_notes
  USING (
    clinician_id IN (
      SELECT users.id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    clinician_id IN (
      SELECT users.id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
    )
  );

ALTER POLICY "admins_delete_org_clinical_notes"
  ON public.clinical_notes
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = 'admin'::text
    )
  );

-- ============================================================
-- TABLE: test_statistics
-- ============================================================
ALTER POLICY "staff_view_org_test_statistics"
  ON public.test_statistics
  USING (
    organization_id IS NULL
    OR organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  );

-- ============================================================
-- TABLE: user_demographics
-- ============================================================
ALTER POLICY "users_view_own_demographics"
  ON public.user_demographics
  USING (
    user_id IN (
      SELECT users.id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
    )
  );

ALTER POLICY "users_insert_own_demographics"
  ON public.user_demographics
  WITH CHECK (
    user_id IN (
      SELECT users.id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
    )
  );

ALTER POLICY "users_update_own_demographics"
  ON public.user_demographics
  USING (
    user_id IN (
      SELECT users.id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    user_id IN (
      SELECT users.id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
    )
  );

ALTER POLICY "staff_view_org_demographics"
  ON public.user_demographics
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  );

ALTER POLICY "admins_manage_org_demographics"
  ON public.user_demographics
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = 'admin'::text
    )
  );

-- ============================================================
-- TABLE: test_catalog_requests
-- ============================================================
ALTER POLICY "users_view_test_catalog_requests_in_org"
  ON public.test_catalog_requests
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
    )
  );

ALTER POLICY "clinicians_create_test_catalog_requests"
  ON public.test_catalog_requests
  WITH CHECK (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['clinician'::text, 'admin'::text])
    )
  );

ALTER POLICY "admins_update_test_catalog_requests"
  ON public.test_catalog_requests
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = 'admin'::text
    )
  );

-- ============================================================
-- TABLE: projects
-- ============================================================
ALTER POLICY "staff_view_org_projects"
  ON public.projects
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  );

ALTER POLICY "staff_insert_org_projects"
  ON public.projects
  WITH CHECK (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  );

ALTER POLICY "staff_update_org_projects"
  ON public.projects
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  );

-- ============================================================
-- TABLE: project_subjects
-- ============================================================
ALTER POLICY "staff_view_org_project_subjects"
  ON public.project_subjects
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  );

ALTER POLICY "staff_insert_org_project_subjects"
  ON public.project_subjects
  WITH CHECK (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  );

ALTER POLICY "staff_update_org_project_subjects"
  ON public.project_subjects
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  );

-- ============================================================
-- TABLE: project_tests
-- ============================================================
ALTER POLICY "staff_view_org_project_tests"
  ON public.project_tests
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  );

ALTER POLICY "staff_insert_org_project_tests"
  ON public.project_tests
  WITH CHECK (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  );

ALTER POLICY "staff_update_org_project_tests"
  ON public.project_tests
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  );

-- ============================================================
-- TABLE: project_subject_test_plans
-- ============================================================
ALTER POLICY "staff_view_org_project_subject_test_plans"
  ON public.project_subject_test_plans
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  );

ALTER POLICY "staff_insert_org_project_subject_test_plans"
  ON public.project_subject_test_plans
  WITH CHECK (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  );

ALTER POLICY "staff_update_org_project_subject_test_plans"
  ON public.project_subject_test_plans
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  );

-- ============================================================
-- TABLE: user_test_assignments
-- ============================================================
ALTER POLICY "respondents_view_own_assignments"
  ON public.user_test_assignments
  USING (
    user_id IN (
      SELECT users.id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
    )
  );

ALTER POLICY "staff_view_org_assignments"
  ON public.user_test_assignments
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  );

ALTER POLICY "staff_insert_org_assignments"
  ON public.user_test_assignments
  WITH CHECK (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  );

ALTER POLICY "staff_update_org_assignments"
  ON public.user_test_assignments
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  );

ALTER POLICY "staff_delete_org_assignments"
  ON public.user_test_assignments
  USING (
    organization_id IN (
      SELECT users.organization_id
      FROM users
      WHERE users.auth_user_id = (select auth.uid())
        AND users.role::text = ANY (ARRAY['admin'::text, 'clinician'::text])
    )
  );;
