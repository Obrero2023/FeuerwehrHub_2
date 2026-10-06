-- Lehrgangsverwaltung: Tabelle für konfigurierbare Lehrgangsarten
CREATE TABLE lehrgangsarten (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    farbe TEXT DEFAULT '#6b7280',
    beschreibung TEXT,
    aktiv BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_lehrgangsarten_aktiv ON lehrgangsarten(aktiv);

-- Fremdschlüssel aus 071_lehrgaenge.sql nachziehen
ALTER TABLE lehrgaenge
    ADD CONSTRAINT lehrgaenge_lehrgangsart_id_fkey
    FOREIGN KEY (lehrgangsart_id) REFERENCES lehrgangsarten(id) ON DELETE SET NULL;
