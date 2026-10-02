-- Lehrgangsverwaltung: Tabelle für konfigurierbare Lehrgangsarten
CREATE TABLE lehrgangsarten (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    farbe TEXT DEFAULT '#6b7280',
    beschreibung TEXT,
    aktiv BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_lehrgangsarten_aktiv ON lehrgangsarten(aktiv);
