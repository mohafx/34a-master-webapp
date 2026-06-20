-- Add marketing unsubscribe field to user_profiles
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS unsubscribed_from_marketing BOOLEAN DEFAULT false;

-- Index for querying unsubscribed users quickly during email campaigns
CREATE INDEX IF NOT EXISTS user_profiles_unsubscribed_idx ON public.user_profiles (unsubscribed_from_marketing);
