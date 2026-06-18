-- Onboarding-Status serverseitig persistieren.
-- Bisher lag "Onboarding erledigt" nur in localStorage → bei Login auf neuem
-- Gerät / im Inkognito / nach Cache-Löschung erschien das Onboarding erneut.
-- Diese Spalte macht den Status geräteübergreifend dauerhaft.

ALTER TABLE public.user_profiles
    ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT false;

-- Backfill: alle BESTEHENDEN Profile haben sich bereits registriert → als erledigt
-- markieren, damit sie das Onboarding nicht erneut sehen. Nur nach dieser Migration
-- neu angelegte Profile starten mit false und durchlaufen das Onboarding einmalig.
UPDATE public.user_profiles
    SET onboarding_completed = true
    WHERE onboarding_completed = false;
