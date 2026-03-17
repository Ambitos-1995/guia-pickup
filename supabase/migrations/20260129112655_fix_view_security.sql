-- Fix security definer on view by recreating with SECURITY INVOKER
DROP VIEW IF EXISTS public.monthly_attendance_summary;

CREATE VIEW public.monthly_attendance_summary 
WITH (security_invoker = true)
AS
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
GRANT SELECT ON public.monthly_attendance_summary TO service_role;;
