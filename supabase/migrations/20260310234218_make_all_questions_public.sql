
-- Drop old premium/free SELECT policies on questions
DROP POLICY IF EXISTS "Premium View All Questions" ON questions;
DROP POLICY IF EXISTS "Public View Free Questions" ON questions;

-- Create a single public read policy for all questions
CREATE POLICY "Public read access" ON questions
  FOR SELECT
  USING (true);
;
