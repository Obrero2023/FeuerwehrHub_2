-- Lehrgangsarten-Tabelle
CREATE TABLE IF NOT EXISTS lehrgangsarten (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    beschreibung TEXT,
    erstellt_am TIMESTAMPTZ DEFAULT NOW(),
    aktualisiert_am TIMESTAMPTZ DEFAULT NOW()
);

-- Standard-Lehrgangsarten einfügen
INSERT INTO lehrgangsarten (name, beschreibung) VALUES
    ('grundlehrgang', 'Grundlegender Lehrgang für Grundkenntnisse'),
    ('aufbaulehrgang', 'Aufbaulehrgang für vertiefte Kenntnisse'),
    ('speciallehrgang', 'Spezialisierter Lehrgang für spezifische Aufgaben'),
    ('furthereducation', 'Weiterbildung und Fortbildung')
ON CONFLICT (name) DO NOTHING;