-- Zusätzliche mündliche Prüfungstickets pro Nutzer.
-- Verbrauch wird weiterhin ausschließlich über oral_exam_sessions.connected_at gezählt;
-- diese Tabelle erhöht nur das serverseitige Limit im aktiven Zeitraum.

CREATE TABLE IF NOT EXISTS public.oral_exam_ticket_grants (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    mode text NOT NULL DEFAULT 'full_simulation',
    bonus_tickets integer NOT NULL CHECK (bonus_tickets > 0),
    status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    reason text,
    starts_at timestamptz NOT NULL DEFAULT now(),
    ends_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oral_exam_ticket_grants_user_status_idx
    ON public.oral_exam_ticket_grants(user_id, status, mode);

CREATE OR REPLACE FUNCTION public.touch_oral_exam_ticket_grants_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS oral_exam_ticket_grants_touch_updated_at ON public.oral_exam_ticket_grants;
CREATE TRIGGER oral_exam_ticket_grants_touch_updated_at
BEFORE UPDATE ON public.oral_exam_ticket_grants
FOR EACH ROW
EXECUTE FUNCTION public.touch_oral_exam_ticket_grants_updated_at();

ALTER TABLE public.oral_exam_ticket_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS oral_exam_ticket_grants_select_own ON public.oral_exam_ticket_grants;
CREATE POLICY oral_exam_ticket_grants_select_own ON public.oral_exam_ticket_grants
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS oral_exam_ticket_grants_service_all ON public.oral_exam_ticket_grants;
CREATE POLICY oral_exam_ticket_grants_service_all ON public.oral_exam_ticket_grants
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

GRANT SELECT ON public.oral_exam_ticket_grants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oral_exam_ticket_grants TO service_role;
