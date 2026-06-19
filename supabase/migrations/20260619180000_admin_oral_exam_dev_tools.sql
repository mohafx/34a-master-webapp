-- Admin-Dev-Tools für die mündliche Prüfung (Test-Komfort).
-- Zwei SECURITY-DEFINER-RPCs, die NUR vom Admin-Konto und NUR auf das eigene
-- Konto (auth.uid()) wirken. Vorbild: mark_access_grant_notice (SECURITY DEFINER + auth.jwt()).
--   1) admin_reset_oral_exam_tickets() — löscht eigene oral_exam_sessions → Tickets wieder voll.
--   2) admin_set_premium(boolean)      — schaltet das eigene Konto app-weit Premium/Free
--                                        über public.subscriptions (reversibel, löscht nichts).
-- Admin-Allowlist muss mit ADMIN_EMAILS in src/utils/userRoles.ts übereinstimmen.

CREATE OR REPLACE FUNCTION public.admin_is_caller()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
    SELECT lower(coalesce(auth.jwt() ->> 'email', '')) = ANY (ARRAY['m.almajzoub1@gmail.com']);
$$;

-- 1) Tickets zurücksetzen / aufladen
CREATE OR REPLACE FUNCTION public.admin_reset_oral_exam_tickets()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count integer;
BEGIN
    IF NOT public.admin_is_caller() THEN
        RAISE EXCEPTION 'not authorized';
    END IF;

    DELETE FROM public.oral_exam_sessions
    WHERE user_id = auth.uid();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- 2) Premium/Free umschalten (app-weit, über subscriptions)
CREATE OR REPLACE FUNCTION public.admin_set_premium(p_premium boolean)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NOT public.admin_is_caller() THEN
        RAISE EXCEPTION 'not authorized';
    END IF;

    IF p_premium THEN
        INSERT INTO public.subscriptions (
            user_id, status, plan, provider,
            current_period_start, current_period_end, user_email, updated_at
        )
        VALUES (
            auth.uid(), 'active', '6months', 'stripe',
            now(), now() + interval '365 days', auth.jwt() ->> 'email', now()
        )
        ON CONFLICT (user_id) DO UPDATE SET
            status = excluded.status,
            plan = excluded.plan,
            provider = excluded.provider,
            current_period_start = excluded.current_period_start,
            current_period_end = excluded.current_period_end,
            updated_at = now();
        RETURN 'active';
    ELSE
        -- Nicht löschen → reversibel; status='free' wird von hasPremiumAccess/pickPremiumSubscription ignoriert.
        UPDATE public.subscriptions
        SET status = 'free', plan = 'free', updated_at = now()
        WHERE user_id = auth.uid();
        RETURN 'free';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_reset_oral_exam_tickets() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_premium(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_reset_oral_exam_tickets() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_premium(boolean) TO authenticated;
