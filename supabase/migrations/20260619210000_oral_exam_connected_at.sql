-- Ticket-Verbrauch connect-basiert machen + Status-Constraint korrigieren.
-- Hintergrund: Tickets gingen verloren, weil sie beim Start (status=running) verbraucht wurden,
-- obwohl Mic/Verbindung/Reload erst danach scheitern können. Künftig zählt ein Ticket nur, wenn
-- die Session real verbunden hat (connected_at IS NOT NULL).
-- Außerdem: Der bisherige status-CHECK verbot 'evaluation_failed' (das die Evaluation schreibt)
-- und 'pending' (neuer Reserviert-Status) → beide werden jetzt erlaubt.

-- 1) Neue Spalte: Zeitpunkt der echten Verbindung zum Prüfer (ElevenLabs onConnect).
ALTER TABLE public.oral_exam_sessions
    ADD COLUMN IF NOT EXISTS connected_at timestamptz;

-- 2) Status-Constraint erweitern: 'pending' (reserviert, noch nicht verbunden) + 'evaluation_failed'.
ALTER TABLE public.oral_exam_sessions
    DROP CONSTRAINT IF EXISTS oral_exam_sessions_status_check;
ALTER TABLE public.oral_exam_sessions
    ADD CONSTRAINT oral_exam_sessions_status_check
    CHECK (status IN ('pending', 'running', 'done', 'aborted', 'evaluation_failed'));

-- 3) Backfill: bestehende echte Sessions haben verbunden → connected_at setzen, damit ihr
--    Verbrauch weiterhin gegen das Limit zählt. (Neue Sessions starten mit connected_at = NULL.)
UPDATE public.oral_exam_sessions
SET connected_at = COALESCE(started_at, created_at)
WHERE connected_at IS NULL
  AND status IN ('done', 'evaluation_failed', 'running', 'aborted');

-- 4) Index für die Ticket-Zählung (user_id + connected_at).
CREATE INDEX IF NOT EXISTS oral_exam_sessions_user_connected_idx
    ON public.oral_exam_sessions (user_id, connected_at);
