-- ============================================================================
-- VIEW: monthly_attendance_summary
-- ============================================================================
CREATE OR REPLACE VIEW public.monthly_attendance_summary AS
WITH daily_hours AS (
  SELECT
    a.employee_profile_id,
    a.organization_id,
    a.work_date,
    EXTRACT(YEAR FROM a.work_date)::INTEGER AS year,
    EXTRACT(MONTH FROM a.work_date)::INTEGER AS month,
    MIN(CASE WHEN a.type = 'check_in' THEN a.timestamp END) AS first_check_in,
    MAX(CASE WHEN a.type = 'check_out' THEN a.timestamp END) AS last_check_out
  FROM public.attendances a
  GROUP BY a.employee_profile_id, a.organization_id, a.work_date
),
monthly_totals AS (
  SELECT
    dh.employee_profile_id,
    dh.organization_id,
    dh.year,
    dh.month,
    COUNT(DISTINCT dh.work_date) AS days_worked,
    SUM(
      CASE
        WHEN dh.first_check_in IS NOT NULL AND dh.last_check_out IS NOT NULL
        THEN EXTRACT(EPOCH FROM (dh.last_check_out - dh.first_check_in)) / 3600.0
        ELSE 0
      END
    ) AS total_hours
  FROM daily_hours dh
  GROUP BY dh.employee_profile_id, dh.organization_id, dh.year, dh.month
)
SELECT
  mt.employee_profile_id,
  mt.organization_id,
  ep.user_id,
  u.nombre AS employee_name,
  ep.employee_code,
  ep.photo_url,
  mt.year,
  mt.month,
  mt.days_worked,
  ROUND(mt.total_hours::NUMERIC, 2) AS total_hours,
  COALESCE(pd.packages_count, 0) AS packages_delivered,
  COALESCE(pd.package_value, 0) AS package_value,
  ROUND((COALESCE(mt.total_hours, 0) * COALESCE(pd.packages_count, 0) * COALESCE(pd.package_value, 0))::NUMERIC, 2) AS gratification
FROM monthly_totals mt
JOIN public.employee_profiles ep ON ep.id = mt.employee_profile_id
JOIN public.users u ON u.id = ep.user_id
LEFT JOIN public.package_deliveries pd ON
  pd.employee_profile_id = mt.employee_profile_id
  AND pd.year = mt.year
  AND pd.month = mt.month;

GRANT SELECT ON public.monthly_attendance_summary TO authenticated;
GRANT SELECT ON public.monthly_attendance_summary TO service_role;

-- ============================================================================
-- FUNCTION: verify_employee_pin
-- ============================================================================
CREATE OR REPLACE FUNCTION public.verify_employee_pin(
  p_organization_id UUID,
  p_pin TEXT
)
RETURNS TABLE (
  employee_profile_id UUID,
  user_id UUID,
  employee_code TEXT,
  employee_name TEXT,
  photo_url TEXT,
  current_status TEXT,
  last_attendance_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_employee RECORD;
  v_last_attendance RECORD;
BEGIN
  SELECT ep.id, ep.user_id, ep.employee_code, ep.photo_url, u.nombre
  INTO v_employee
  FROM employee_profiles ep
  JOIN users u ON u.id = ep.user_id
  WHERE ep.organization_id = p_organization_id
    AND ep.attendance_enabled = true
    AND ep.pin_hash = crypt(p_pin, ep.pin_hash);

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT a.type, a.timestamp
  INTO v_last_attendance
  FROM attendances a
  WHERE a.employee_profile_id = v_employee.id
    AND a.work_date = CURRENT_DATE
  ORDER BY a.timestamp DESC
  LIMIT 1;

  RETURN QUERY SELECT
    v_employee.id,
    v_employee.user_id,
    v_employee.employee_code,
    v_employee.nombre,
    v_employee.photo_url,
    CASE
      WHEN v_last_attendance.type IS NULL THEN 'not_checked_in'
      WHEN v_last_attendance.type = 'check_in' THEN 'checked_in'
      ELSE 'checked_out'
    END,
    v_last_attendance.timestamp;
END;
$$;

REVOKE ALL ON FUNCTION public.verify_employee_pin FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_employee_pin TO service_role;

-- ============================================================================
-- FUNCTION: get_organization_id_by_slug
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_organization_id_by_slug(p_slug TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT id INTO v_org_id
  FROM organizations
  WHERE slug = p_slug
    AND status = 'active';
  RETURN v_org_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_organization_id_by_slug TO service_role;;
