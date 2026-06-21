CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Repo-seitig absichern: Die Tabelle existiert in Produktion bereits, fehlte aber
-- bisher in den lokalen Migrationen.
CREATE TABLE IF NOT EXISTS public.processed_stripe_events (
    event_id TEXT PRIMARY KEY,
    event_type TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.processed_stripe_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.processed_stripe_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.processed_stripe_events TO service_role;

DROP POLICY IF EXISTS "Service role only" ON public.processed_stripe_events;
CREATE POLICY "Service role only"
ON public.processed_stripe_events
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.payment_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    checkout_session_id TEXT,
    stripe_event_id TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    source TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'error', 'critical')),
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'ignored')),
    finalized_at TIMESTAMPTZ,
    details JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_audit_events_user_id_idx
    ON public.payment_audit_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS payment_audit_events_checkout_session_idx
    ON public.payment_audit_events(checkout_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS payment_audit_events_severity_status_idx
    ON public.payment_audit_events(severity, status, created_at DESC);

ALTER TABLE public.payment_audit_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.payment_audit_events FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_audit_events TO service_role;

DROP POLICY IF EXISTS "Service role can manage payment audit events" ON public.payment_audit_events;
CREATE POLICY "Service role can manage payment audit events"
ON public.payment_audit_events
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
