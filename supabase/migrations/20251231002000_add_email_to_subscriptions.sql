
ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS user_email TEXT;

-- Backfill emails from auth.users (requires permissions, usually db push runs as postgres/admin)
DO $$
BEGIN
    UPDATE public.subscriptions s
    SET user_email = u.email
    FROM auth.users u
    WHERE s.user_id = u.id
    AND s.user_email IS NULL;
END $$;
