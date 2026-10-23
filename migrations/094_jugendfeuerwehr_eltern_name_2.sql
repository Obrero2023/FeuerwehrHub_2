-- Jugendfeuerwehr: Zweiter Erziehungsberechtigter Name für Mitglieder

ALTER TABLE jugendfeuerwehr_mitglieder
    ADD COLUMN IF NOT EXISTS eltern_name_2 TEXT;

COMMENT ON COLUMN jugendfeuerwehr_mitglieder.eltern_name_2 IS 'Name des 2. Erziehungsberechtigten';