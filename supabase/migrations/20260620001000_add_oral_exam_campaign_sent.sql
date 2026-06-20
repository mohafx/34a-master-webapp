-- Add campaign tracking field to user_profiles
ALTER TABLE public.user_profiles
ADD COLUMN IF NOT EXISTS oral_exam_campaign_sent BOOLEAN DEFAULT false;

-- Index for querying campaign status quickly during script execution
CREATE INDEX IF NOT EXISTS user_profiles_campaign_sent_idx ON public.user_profiles (oral_exam_campaign_sent);
