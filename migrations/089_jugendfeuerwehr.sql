-- Jugendfeuerwehr: Tabelle für Jugendmitglieder
CREATE TABLE IF NOT EXISTS jugendfeuerwehr_mitglieder (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    geburtsdatum DATE NOT NULL,
    eintrittsdatum DATE NOT NULL,
    austrittsdatum DATE,
    geschlecht TEXT NOT NULL CHECK (geschlecht IN ('männlich', 'weiblich', 'divers')),
    adresse TEXT,
    telefon TEXT,
    email TEXT,
    eltern_name TEXT,
    eltern_telefon TEXT,
    eltern_email TEXT,
    juleica BOOLEAN DEFAULT FALSE,
    juleica_ablauf DATE,
    bemerkung TEXT,
    erstellt_von UUID REFERENCES users(id) ON DELETE SET NULL,
    erstellt_von_name TEXT,
    erstellt_am TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    aktualisiert_am TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indizes für häufige Abfragen
CREATE INDEX IF NOT EXISTS idx_jugendfeuerwehr_mitglieder_name ON jugendfeuerwehr_mitglieder(name);
CREATE INDEX IF NOT EXISTS idx_jugendfeuerwehr_mitglieder_gsh ON jugendfeuerwehr_mitglieder(geburtsdatum);
CREATE INDEX IF NOT EXISTS idx_jugendfeuerwehr_mitglieder_eintritt ON jugendfeuerwehr_mitglieder(eintrittsdatum);
CREATE INDEX IF NOT EXISTS idx_jugendfeuerwehr_mitglieder_austritt ON jugendfeuerwehr_mitglieder(austrittsdatum);
CREATE INDEX IF NOT EXISTS idx_jugendfeuerwehr_mitglieder_juleica ON jugendfeuerwehr_mitglieder(juleica);

-- Modul-Aktivierungsstatus für Jugendfeuerwehr (Standard: aus)
INSERT INTO settings (key, value) VALUES ('module_jugendfeuerwehr', 'false')
ON CONFLICT (key) DO NOTHING;