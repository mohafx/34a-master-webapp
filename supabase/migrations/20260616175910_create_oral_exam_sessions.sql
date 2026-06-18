-- Mündliche Prüfungssimulation (KI): Session-Tabelle.
-- Diese Migration bildet den bereits LIVE angewandten Stand idempotent ab
-- (Repo-Hygiene; gleicher Timestamp wie in der remote Migrationshistorie, daher
-- führt `supabase db push` sie nicht erneut aus).
-- Vertrag/Doku: docs/produkt/ki-muendliche-pruefungssimulation-umsetzung.md

CREATE TABLE IF NOT EXISTS public.oral_exam_sessions (
    id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    mode               text NOT NULL,                 -- 'free_test_3q' | 'full_5min'
    focus_topic        text,
    status             text NOT NULL DEFAULT 'running',-- 'running' | 'done' | 'aborted'
    started_at         timestamptz NOT NULL DEFAULT now(),
    ended_at           timestamptz,
    duration_s         integer,
    transcript         jsonb,
    overall_score_pct  integer,
    passed             boolean,
    topic_scores       jsonb,
    feedback           jsonb,
    created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS oral_exam_sessions_user_created_idx
    ON public.oral_exam_sessions (user_id, created_at DESC);

ALTER TABLE public.oral_exam_sessions ENABLE ROW LEVEL SECURITY;

-- RLS: jeder Nutzer sieht/ändert nur seine eigenen Zeilen.
DROP POLICY IF EXISTS oral_exam_sessions_select_own ON public.oral_exam_sessions;
CREATE POLICY oral_exam_sessions_select_own ON public.oral_exam_sessions
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS oral_exam_sessions_insert_own ON public.oral_exam_sessions;
CREATE POLICY oral_exam_sessions_insert_own ON public.oral_exam_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS oral_exam_sessions_update_own ON public.oral_exam_sessions;
CREATE POLICY oral_exam_sessions_update_own ON public.oral_exam_sessions
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
