-- Erlaubt den neuen kanonischen Modus full_simulation und hält full_5min
-- als Legacy-Wert für bereits gespeicherte Sessions/alte Clients kompatibel.
ALTER TABLE public.oral_exam_sessions
    DROP CONSTRAINT IF EXISTS oral_exam_sessions_mode_check;

ALTER TABLE public.oral_exam_sessions
    ADD CONSTRAINT oral_exam_sessions_mode_check
    CHECK (mode IN ('free_test_3q', 'full_simulation', 'full_5min'));
