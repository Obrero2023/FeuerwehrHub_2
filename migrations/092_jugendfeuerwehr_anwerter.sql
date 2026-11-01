-- Jugendfeuerwehr: Anwerter und Dienstteilnahmen

-- ── Anwerter ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jugendfeuerwehr_anwerter (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    geburtsdatum DATE NOT NULL,
    eintrittsdatum DATE NOT NULL DEFAULT CURRENT_DATE,
    geschlecht TEXT NOT NULL CHECK (geschlecht IN ('männlich', 'weiblich', 'divers')),
    adresse TEXT,
    telefon TEXT,
    email TEXT,
    eltern_name TEXT,
    eltern_telefon TEXT,
    eltern_email TEXT,
    bemerkung TEXT,
    status TEXT NOT NULL DEFAULT 'aktiv' CHECK (status IN ('aktiv', 'aufgenommen', 'abgemeldet', 'archiviert')),
    erstellt_von UUID REFERENCES users(id) ON DELETE SET NULL,
    erstellt_von_name TEXT,
    erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    aktualisiert_am TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jugendfeuerwehr_anwerter_name ON jugendfeuerwehr_anwerter(name);
CREATE INDEX IF NOT EXISTS idx_jugendfeuerwehr_anwerter_status ON jugendfeuerwehr_anwerter(status);
CREATE INDEX IF NOT EXISTS idx_jugendfeuerwehr_anwerter_eintritt ON jugendfeuerwehr_anwerter(eintrittsdatum);

-- ── Dienstteilnahmen ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS jugendfeuerwehr_dienstteilnahmen (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    anwerter_id UUID NOT NULL REFERENCES jugendfeuerwehr_anwerter(id) ON DELETE CASCADE,
    termin_bezeichnung TEXT NOT NULL,
    datum DATE NOT NULL DEFAULT CURRENT_DATE,
    zeit_von TIME,
    zeit_bis TIME,
    bemerkung TEXT,
    bestaetigt_von UUID REFERENCES users(id) ON DELETE SET NULL,
    bestaetigt_von_name TEXT,
    bestaetigt_am TIMESTAMP WITH TIME ZONE,
    status TEXT NOT NULL DEFAULT 'bestätigt' CHECK (status IN ('bestätigt', 'abwesend', 'abgemeldet')),
    erstellt_von UUID REFERENCES users(id) ON DELETE SET NULL,
    erstellt_von_name TEXT,
    erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    aktualisiert_am TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_jugendfeuerwehr_dienstteilnahmen_anwerter ON jugendfeuerwehr_dienstteilnahmen(anwerter_id);
CREATE INDEX IF NOT EXISTS idx_jugendfeuerwehr_dienstteilnahmen_datum ON jugendfeuerwehr_dienstteilnahmen(datum);