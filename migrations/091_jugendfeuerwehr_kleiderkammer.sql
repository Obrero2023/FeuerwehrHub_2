-- Jugendfeuerwehr: Kleiderkammer – Lagerartikel und Ausleihen

-- ── Lagerartikel ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jugendfeuerwehr_lagerartikel (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    beschreibung TEXT,
    menge INTEGER NOT NULL DEFAULT 0 CHECK (menge >= 0),
    einheit TEXT NOT NULL DEFAULT 'Stück',
    erstellt_von UUID REFERENCES users(id) ON DELETE SET NULL,
    erstellt_von_name TEXT,
    erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    aktualisiert_am TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jugendfeuerwehr_lagerartikel_name ON jugendfeuerwehr_lagerartikel(name);

-- ── Ausleihen / Zuweisungen ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jugendfeuerwehr_kleiderausgaben (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mitglied_id UUID NOT NULL REFERENCES jugendfeuerwehr_mitglieder(id) ON DELETE CASCADE,
    lagerartikel_id UUID NOT NULL REFERENCES jugendfeuerwehr_lagerartikel(id) ON DELETE RESTRICT,
    menge INTEGER NOT NULL CHECK (menge > 0),
    ausgabedatum DATE NOT NULL DEFAULT CURRENT_DATE,
    rueckgabedatum DATE,
    rueckgabe_menge INTEGER,
    rueckgabe_bemerkung TEXT,
    bemerkung TEXT,
    erstellt_von UUID REFERENCES users(id) ON DELETE SET NULL,
    erstellt_von_name TEXT,
    erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    aktualisiert_am TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jugendfeuerwehr_kleiderausgaben_mitglied ON jugendfeuerwehr_kleiderausgaben(mitglied_id);
CREATE INDEX IF NOT EXISTS idx_jugendfeuerwehr_kleiderausgaben_artikel ON jugendfeuerwehr_kleiderausgaben(lagerartikel_id);
CREATE INDEX IF NOT EXISTS idx_jugendfeuerwehr_kleiderausgaben_ausgabe ON jugendfeuerwehr_kleiderausgaben(ausgabedatum);