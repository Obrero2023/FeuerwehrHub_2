-- Jugendfeuerwehr: Kleiderausgaben – Größen-Spalte hinzufügen

ALTER TABLE jugendfeuerwehr_kleiderausgaben
    ADD COLUMN IF NOT EXISTS groesse TEXT;

CREATE INDEX IF NOT EXISTS idx_jugendfeuerwehr_kleiderausgaben_groesse ON jugendfeuerwehr_kleiderausgaben(groesse);

COMMENT ON COLUMN jugendfeuerwehr_kleiderausgaben.groesse IS 'Größe der ausgegebenen Kleidung (z.B. S, M, L, XL)';