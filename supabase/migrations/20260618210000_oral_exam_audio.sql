-- Mündliche Prüfungssimulation: Audio-Speicherung.
-- Fügt die Spalte audio_path hinzu und legt einen PRIVATEN Storage-Bucket an,
-- in dem das vollständige Gesprächs-Audio (von ElevenLabs, serverseitig geholt)
-- liegt. Pfadschema: {user_id}/{sessionId}.mp3
-- Doku: docs/produkt/ki-muendliche-pruefungssimulation-umsetzung.md

ALTER TABLE public.oral_exam_sessions
    ADD COLUMN IF NOT EXISTS audio_path text;

-- Privater Bucket (kein öffentlicher Zugriff; Wiedergabe nur über signierte URLs).
INSERT INTO storage.buckets (id, name, public)
VALUES ('oral-exam-audio', 'oral-exam-audio', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: Nutzer dürfen NUR ihren eigenen Ordner lesen (erster Pfadabschnitt = user_id).
-- Upload erfolgt über die Service-Role in der Edge Function und umgeht RLS,
-- daher ist keine Insert-Policy nötig.
DROP POLICY IF EXISTS oral_exam_audio_read_own ON storage.objects;
CREATE POLICY oral_exam_audio_read_own ON storage.objects
    FOR SELECT
    USING (
        bucket_id = 'oral-exam-audio'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );
