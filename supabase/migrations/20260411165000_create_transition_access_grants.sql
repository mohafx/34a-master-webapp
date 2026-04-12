CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.access_grants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('premium_transition')),
    source TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ends_at TIMESTAMPTZ NOT NULL,
    first_seen_at TIMESTAMPTZ,
    last_notice_at TIMESTAMPTZ,
    last_notice_stage TEXT CHECK (
        last_notice_stage IS NULL
        OR last_notice_stage IN ('first', 'two_days', 'last_day', 'expired')
    ),
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT access_grants_unique_user_source UNIQUE (user_id, source)
);

CREATE INDEX IF NOT EXISTS access_grants_user_id_idx
    ON public.access_grants(user_id);

CREATE INDEX IF NOT EXISTS access_grants_source_status_idx
    ON public.access_grants(source, status);

CREATE INDEX IF NOT EXISTS access_grants_active_window_idx
    ON public.access_grants(starts_at, ends_at)
    WHERE status = 'active';

CREATE OR REPLACE FUNCTION public.touch_access_grants_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS access_grants_touch_updated_at ON public.access_grants;
CREATE TRIGGER access_grants_touch_updated_at
BEFORE UPDATE ON public.access_grants
FOR EACH ROW
EXECUTE FUNCTION public.touch_access_grants_updated_at();

ALTER TABLE public.access_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own access grants" ON public.access_grants;
CREATE POLICY "Users can read own access grants"
ON public.access_grants
FOR SELECT
USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.mark_access_grant_notice(
    p_grant_id UUID,
    p_stage TEXT
)
RETURNS public.access_grants
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    updated_grant public.access_grants;
BEGIN
    IF p_stage NOT IN ('first', 'two_days', 'last_day', 'expired') THEN
        RAISE EXCEPTION 'Invalid access grant notice stage: %', p_stage;
    END IF;

    UPDATE public.access_grants
    SET
        first_seen_at = COALESCE(first_seen_at, NOW()),
        last_notice_at = NOW(),
        last_notice_stage = p_stage
    WHERE id = p_grant_id
      AND user_id = auth.uid()
    RETURNING * INTO updated_grant;

    IF updated_grant.id IS NULL THEN
        RAISE EXCEPTION 'Access grant not found or not owned by current user';
    END IF;

    RETURN updated_grant;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_access_grant_notice(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_access_grant_notice(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_paywall_transition_candidates(
    p_cutoff_at TIMESTAMPTZ,
    p_source TEXT DEFAULT 'paywall_transition_2026_04',
    p_min_questions INTEGER DEFAULT 10,
    p_min_active_days INTEGER DEFAULT 5
)
RETURNS TABLE (
    user_id UUID,
    user_email TEXT,
    answered_questions BIGINT,
    active_days_7 BIGINT,
    last_activity_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
    WITH activity_events AS (
        SELECT up.user_id, up.answered_at AS activity_at
        FROM public.user_progress up
        WHERE up.answered_at IS NOT NULL
          AND up.answered_at <= p_cutoff_at

        UNION ALL

        SELECT ulp.user_id, ulp.completed_at AS activity_at
        FROM public.user_lesson_progress ulp
        WHERE ulp.completed_at IS NOT NULL
          AND ulp.completed_at <= p_cutoff_at

        UNION ALL

        SELECT wes.user_id, wes.started_at AS activity_at
        FROM public.written_exam_sessions wes
        WHERE wes.started_at IS NOT NULL
          AND wes.started_at <= p_cutoff_at

        UNION ALL

        SELECT wes.user_id, wes.completed_at AS activity_at
        FROM public.written_exam_sessions wes
        WHERE wes.completed_at IS NOT NULL
          AND wes.completed_at <= p_cutoff_at
    ),
    question_counts AS (
        SELECT up.user_id, COUNT(DISTINCT up.question_id) AS answered_questions
        FROM public.user_progress up
        WHERE up.answered_at IS NOT NULL
          AND up.answered_at <= p_cutoff_at
        GROUP BY up.user_id
    ),
    activity_summary AS (
        SELECT
            ae.user_id,
            COUNT(DISTINCT ((ae.activity_at AT TIME ZONE 'Europe/Berlin')::DATE)) FILTER (
                WHERE ae.activity_at >= p_cutoff_at - INTERVAL '7 days'
            ) AS active_days_7,
            MAX(ae.activity_at) AS last_activity_at
        FROM activity_events ae
        GROUP BY ae.user_id
    )
    SELECT
        au.id AS user_id,
        au.email::TEXT AS user_email,
        qc.answered_questions,
        COALESCE(acts.active_days_7, 0) AS active_days_7,
        acts.last_activity_at
    FROM auth.users au
    JOIN question_counts qc ON qc.user_id = au.id
    JOIN activity_summary acts ON acts.user_id = au.id
    WHERE au.created_at <= p_cutoff_at
      AND qc.answered_questions >= p_min_questions
      AND COALESCE(acts.active_days_7, 0) >= p_min_active_days
      AND acts.last_activity_at >= p_cutoff_at - INTERVAL '14 days'
      AND NOT EXISTS (
          SELECT 1
          FROM public.subscriptions s
          WHERE s.user_id = au.id
            AND (
                s.status IN ('active', 'trialing')
                OR (s.status = 'canceled' AND s.current_period_end > NOW())
            )
      )
      AND NOT EXISTS (
          SELECT 1
          FROM public.access_grants ag
          WHERE ag.user_id = au.id
            AND ag.source = p_source
      )
    ORDER BY acts.last_activity_at DESC;
$$;

REVOKE ALL ON FUNCTION public.get_paywall_transition_candidates(TIMESTAMPTZ, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_paywall_transition_candidates(TIMESTAMPTZ, TEXT, INTEGER, INTEGER) TO service_role;
