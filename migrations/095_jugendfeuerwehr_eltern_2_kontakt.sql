-- Jugendfeuerwehr: zweiter Erziehungsberechtigter Telefon & E-Mail

ALTER TABLE jugendfeuerwehr_mitglieder
    ADD COLUMN IF NOT EXISTS eltern_telefon_2 TEXT;

ALTER TABLE jugendfeuerwehr_mitglieder
    ADD COLUMN IF NOT EXISTS eltern_email_2 TEXT;

COMMENT ON COLUMN jugendfeuerwehr_mitglieder.eltern_telefon_2 IS 'Telefonnummer des 2. Erziehungsberechtigten';
COMMENT ON COLUMN jugendfeuerwehr_mitglieder.eltern_email_2 IS 'E-Mail-Adresse des 2. Erziehungsberechtigten';
