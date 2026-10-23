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

-- name als generierte Spalte aus vorname + nachname (bleibt konsistent)
ALTER TABLE jugendfeuerwehr_mitglieder
    ALTER COLUMN name DROP DEFAULT;

ALTER TABLE jugendfeuerwehr_mitglieder
    ALTER COLUMN name GENERATED ALWAYS AS (trim(coalesce(vorname, '') || ' ' || coalesce(nachname, ''))) STORED;

COMMENT ON COLUMN jugendfeuerwehr_mitglieder.vorname IS 'Vorname des Jugendmitglieds';
COMMENT ON COLUMN jugendfeuerwehr_mitglieder.nachname IS 'Nachname des Jugendmitglieds';
COMMENT ON COLUMN jugendfeuerwehr_mitglieder.name IS 'Generierter Vollname (Vorname + Nachname)';
