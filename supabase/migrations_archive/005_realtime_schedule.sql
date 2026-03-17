-- Añadir tabla a la publicación Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE kiosk_schedule_slots;

-- Permitir SELECT al rol anon (necesario para recibir eventos Realtime)
GRANT SELECT ON kiosk_schedule_slots TO anon;

-- Política RLS permisiva para SELECT público (coherente con list sin auth)
CREATE POLICY "Allow public read access to schedule slots"
    ON kiosk_schedule_slots
    FOR SELECT
    TO anon
    USING (true);
