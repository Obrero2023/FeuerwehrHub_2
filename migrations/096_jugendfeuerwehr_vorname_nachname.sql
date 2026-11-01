-- Jugendfeuerwehr: Vor- und Nachname als eigene Spalten

ALTER TABLE jugendfeuerwehr_mitglieder
    ADD COLUMN IF NOT EXISTS vorname TEXT;

ALTER TABLE jugendfeuerwehr_mitglieder
    ADD COLUMN IF NOT EXISTS nachname TEXT;

-- Bestehende Datensätze rückfüllen (erstes Wort = Vorname, Rest = Nachname)
UPDATE jugendfeuerwehr_mitglieder
SET vorname = split_part(name, ' ', 1),
    nachname = CASE
        WHEN position(' ' in name) > 0 THEN substring(name from position(' ' in name) + 1)
        ELSE ''
    END;

-- name-Spalte bleibt erhalten, Trigger hält sie konsistent zu vorname/nachname
CREATE OR REPLACE FUNCTION jugendfeuerwehr_update_name()
RETURNS TRIGGER AS $$
BEGIN
    NEW.name := trim(coalesce(NEW.vorname, '') || ' ' || coalesce(NEW.nachname, ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_jugendfeuerwehr_update_name ON jugendfeuerwehr_mitglieder;
CREATE TRIGGER trigger_jugendfeuerwehr_update_name
BEFORE INSERT OR UPDATE ON jugendfeuerwehr_mitglieder
FOR EACH ROW EXECUTE FUNCTION jugendfeuerwehr_update_name();

COMMENT ON COLUMN jugendfeuerwehr_mitglieder.vorname IS 'Vorname des Jugendmitglieds';
COMMENT ON COLUMN jugendfeuerwehr_mitglieder.nachname IS 'Nachname des Jugendmitglieds';
COMMENT ON COLUMN jugendfeuerwehr_mitglieder.name IS 'Vollname (Trigger: vorname + nachname)';