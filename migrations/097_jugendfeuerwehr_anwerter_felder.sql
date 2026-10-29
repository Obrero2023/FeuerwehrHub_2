-- Jugendfeuerwehr: Anwärter - erweiterte Felder für detaillierte Daten

-- ── Vor- und Nachname (wie bei Jugendmitgliedern) ──────────────────────────────

ALTER TABLE jugendfeuerwehr_anwerter
    ADD COLUMN IF NOT EXISTS vorname TEXT;

ALTER TABLE jugendfeuerwehr_anwerter
    ADD COLUMN IF NOT EXISTS nachname TEXT;

-- Bestehende Datensätze rückfüllen (erstes Wort = Vorname, Rest = Nachname)
UPDATE jugendfeuerwehr_anwerter
SET vorname = split_part(name, ' ', 1),
    nachname = CASE
        WHEN position(' ' in name) > 0 THEN substring(name from position(' ' in name) + 1)
        ELSE ''
    END;

-- name-Spalte bleibt erhalten, Trigger hält sie konsistent zu vorname/nachname
CREATE OR REPLACE FUNCTION jugendfeuerwehr_anwerter_update_name()
RETURNS TRIGGER AS $$
BEGIN
    NEW.name := trim(coalesce(NEW.vorname, '') || ' ' || coalesce(NEW.nachname, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_jugendfeuerwehr_anwerter_update_name ON jugendfeuerwehr_anwerter;
CREATE TRIGGER trigger_jugendfeuerwehr_anwerter_update_name
BEFORE INSERT OR UPDATE ON jugendfeuerwehr_anwerter
FOR EACH ROW EXECUTE FUNCTION jugendfeuerwehr_anwerter_update_name();

-- ── Adress-Zusatzfelder ────────────────────────────────────────────────────────

ALTER TABLE jugendfeuerwehr_anwerter
    ADD COLUMN IF NOT EXISTS plz TEXT;

ALTER TABLE jugendfeuerwehr_anwerter
    ADD COLUMN IF NOT EXISTS ort TEXT;

ALTER TABLE jugendfeuerwehr_anwerter
    ADD COLUMN IF NOT EXISTS ortsteil TEXT;

-- ── Eltern-Berichtigte: Separate Vor- und Nachname ─────────────────────────────

ALTER TABLE jugendfeuerwehr_anwerter
    ADD COLUMN IF NOT EXISTS eltern_vorname TEXT;

ALTER TABLE jugendfeuerwehr_anwerter
    ADD COLUMN IF NOT EXISTS eltern_nachname TEXT;

-- Telefonnummer des Erziehungsberechtigten (separat von eltern_name)
ALTER TABLE jugendfeuerwehr_anwerter
    ADD COLUMN IF NOT EXISTS eltern_telefonnummer TEXT;

-- ── Erstkontakt-Datum ──────────────────────────────────────────────────────────┣

ALTER TABLE jugendfeuerwehr_anwerter
    ADD COLUMN IF NOT EXISTS erstkontakt DATE DEFAULT CURRENT_DATE;

-- Kommentare für Debug-Zwecke ──────────────────────────────────────────────────

COMMENT ON COLUMN jugendfeuerwehr_anwerter.vorname IS 'Vorname des Anwärters';
COMMENT ON COLUMN jugendfeuerwehr_anwerter.nachname IS 'Nachname des Anwärters';
COMMENT ON COLUMN jugendfeuerwehr_anwerter.plz IS 'Postleitzahl';
COMMENT ON COLUMN jugendfeuerwehr_anwerter.ort IS 'Ort';
COMMENT ON COLUMN jugendfeuerwehr_anwerter.ortsteil IS 'Ortsteil (z.B. Stadtmitte)';
COMMENT ON COLUMN jugendfeuerwehr_anwerter.eltern_vorname IS 'Vorname des Erziehungsberechtigten';
COMMENT ON COLUMN jugendfeuerwehr_anwerter.eltern_nachname IS 'Nachname des Erziehungsberechtigten';
COMMENT ON COLUMN jugendfeuerwehr_anwerter.erstkontakt IS 'Datum des Erstkontakts (Standard: heute)';