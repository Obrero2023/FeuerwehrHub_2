-- Jugendfeuerwehr: Mitgliedschaftsvorgänge und Archivierung

-- ── Archiviert-Spalte zu Mitgliedern ─────────────────────────────────────────

ALTER TABLE jugendfeuerwehr_mitglieder
    ADD COLUMN IF NOT EXISTS archiviert BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_jugendfeuerwehr_mitglieder_archiviert ON jugendfeuerwehr_mitglieder(archiviert);

-- ── Mitgliedschaftsvorgänge ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jugendfeuerwehr_mitgliedschaftsvorgaenge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mitglied_id UUID NOT NULL REFERENCES jugendfeuerwehr_mitglieder(id) ON DELETE CASCADE,
    typ TEXT NOT NULL CHECK (typ IN ('anmeldung', 'abmeldung', 'ummeldung')),
    datum DATE NOT NULL DEFAULT CURRENT_DATE,
    vorheriger_name TEXT,
    neuer_name TEXT,
    grund TEXT,
    bemerkung TEXT,
    erstellt_von UUID REFERENCES users(id) ON DELETE SET NULL,
    erstellt_von_name TEXT,
    erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jugendfeuerwehr_mitgliedschaftsvorgaenge_mitglied ON jugendfeuerwehr_mitgliedschaftsvorgaenge(mitglied_id);
CREATE INDEX IF NOT EXISTS idx_jugendfeuerwehr_mitgliedschaftsvorgaenge_typ ON jugendfeuerwehr_mitgliedschaftsvorgaenge(typ);
CREATE INDEX IF NOT EXISTS idx_jugendfeuerwehr_mitgliedschaftsvorgaenge_datum ON jugendfeuerwehr_mitgliedschaftsvorgaenge(datum);