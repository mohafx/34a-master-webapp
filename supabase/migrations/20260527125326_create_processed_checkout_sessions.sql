CREATE TABLE IF NOT EXISTS public.processed_checkout_sessions (
  checkout_session_id text PRIMARY KEY,
  user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  checkout_mode text NOT NULL DEFAULT 'authenticated',
  session_status text NULL,
  payment_status text NULL,
  plan text NULL,
  amount_total integer NULL,
  currency text NULL,
  guest_email text NULL,
  posthog_captured_at timestamptz NULL,
  guest_email_sent_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.processed_checkout_sessions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_checkout_session_side_effect(
  p_checkout_session_id text,
  p_effect text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_rows integer;
BEGIN
  IF p_effect = 'posthog' THEN
    UPDATE public.processed_checkout_sessions
    SET posthog_captured_at = now(),
        updated_at = now()
    WHERE checkout_session_id = p_checkout_session_id
      AND posthog_captured_at IS NULL;
  ELSIF p_effect = 'guest_email' THEN
    UPDATE public.processed_checkout_sessions
    SET guest_email_sent_at = now(),
        updated_at = now()
    WHERE checkout_session_id = p_checkout_session_id
      AND guest_email_sent_at IS NULL;
  ELSE
    RAISE EXCEPTION 'Unknown checkout side effect: %', p_effect;
  END IF;

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_checkout_session_side_effect(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_checkout_session_side_effect(text, text) TO service_role;
