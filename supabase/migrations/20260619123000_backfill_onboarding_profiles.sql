-- Backfill: Für ALLE bereits existierenden Auth-Nutzer ohne Profilzeile eine
-- Profilzeile mit onboarding_completed = true anlegen.
-- Hintergrund: Nutzer, die sich nur per Google angemeldet, aber nie Prüfungsdatum/
-- Einstellungen gesetzt haben, besitzen keine user_profiles-Zeile und wären sonst
-- nicht von echten Neuregistrierungen unterscheidbar → sie würden das Onboarding
-- erneut sehen. Damit gilt: Onboarding erscheint NUR für ab jetzt neu registrierte/
-- erstmals angemeldete Konten.

INSERT INTO public.user_profiles (id, onboarding_completed)
SELECT u.id, true
FROM auth.users u
WHERE NOT EXISTS (
    SELECT 1 FROM public.user_profiles p WHERE p.id = u.id
);
