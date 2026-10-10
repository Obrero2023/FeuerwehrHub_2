-- Lehrgangsverwaltung: Haupttabelle Lehrgänge
CREATE TABLE IF NOT EXISTS lehrgaenge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titel TEXT NOT NULL,
    beschreibung TEXT,
    ort TEXT,
    start_datum DATE NOT NULL,
    end_datum DATE NOT NULL,
    anmeldeschluss DATE,
    max_teilnehmer INTEGER CHECK (max_teilnehmer > 0),
    status TEXT DEFAULT 'geplant'
        CHECK (status IN ('geplant', 'offen', 'voll', 'abgesagt', 'abgeschlossen')),
    kosten NUMERIC(10,2),
    kosten_uebernommen_durch TEXT CHECK (kosten_uebernommen_durch IN ('feuerwehr', 'teilnehmer', 'teilweise')),
    lehrgangsart_id UUID,
    voraussetzung TEXT,
    voraussetzungen_erfuellt BOOLEAN DEFAULT FALSE,
    erstellt_von UUID REFERENCES users(id) ON DELETE SET NULL,
    erstellt_von_name TEXT,
    erstellt_am TIMESTAMPTZ DEFAULT NOW(),
    aktualisiert_am TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lehrgaenge_start_datum ON lehrgaenge(start_datum);
CREATE INDEX idx_lehrgaenge_status ON lehrgaenge(status);
CREATE INDEX idx_lehrgaenge_art ON lehrgaenge(lehrgangsart_id);