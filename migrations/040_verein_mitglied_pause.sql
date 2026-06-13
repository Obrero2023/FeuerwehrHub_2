-- Jubiläums-Pause (z.B. mehrjährige Unterbrechung der Mitgliedschaft)
-- Wird bei der Dienstjahre-Berechnung abgezogen.
ALTER TABLE verein_mitglieder
    ADD COLUMN IF NOT EXISTS pause_von DATE,
    ADD COLUMN IF NOT EXISTS pause_bis DATE;
