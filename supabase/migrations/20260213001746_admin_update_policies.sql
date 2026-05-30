
-- Drop the overly permissive update policy on questions
DROP POLICY IF EXISTS "Allow public update for questions" ON questions;

-- Create admin-only update policy for questions
CREATE POLICY "Admin can update questions"
ON questions
FOR UPDATE
USING (
  auth.jwt() ->> 'email' = 'm.almajzoub1@gmail.com'
)
WITH CHECK (
  auth.jwt() ->> 'email' = 'm.almajzoub1@gmail.com'
);

-- Create admin-only update policy for written_exam_questions
CREATE POLICY "Admin can update written exam questions"
ON written_exam_questions
FOR UPDATE
USING (
  auth.jwt() ->> 'email' = 'm.almajzoub1@gmail.com'
)
WITH CHECK (
  auth.jwt() ->> 'email' = 'm.almajzoub1@gmail.com'
);
;
