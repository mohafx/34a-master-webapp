ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS current_period_start timestamptz;

CREATE INDEX IF NOT EXISTS subscriptions_user_period_idx
    ON public.subscriptions (user_id, current_period_start, current_period_end);
