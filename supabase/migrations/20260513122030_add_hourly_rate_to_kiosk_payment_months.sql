-- Añadir columna hourly_rate a kiosk_payment_months.
-- Tarifa fija decidida por el admin al guardar el mes (Opción 4 del plan de pagos TMG).
-- NULL = mes calculado con el algoritmo legacy (tarifa dinámica derivada de horas
-- asignadas). Obligatoria para meses nuevos a partir de mayo 2026.
ALTER TABLE public.kiosk_payment_months
  ADD COLUMN hourly_rate NUMERIC(10,4) NULL;

COMMENT ON COLUMN public.kiosk_payment_months.hourly_rate IS
  'Tarifa €/h decidida por el admin al guardar el mes. NULL = mes calculado con el algoritmo legacy (tarifa dinámica derivada de horas asignadas). Obligatoria para meses nuevos a partir de mayo 2026.';
