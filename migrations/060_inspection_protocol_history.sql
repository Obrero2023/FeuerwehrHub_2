-- Tabelle für Inspektionsprotokolle (jede abgeschlossene Prüfung)
CREATE TABLE IF NOT EXISTS vehicle_inspection_protocols (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id      UUID        NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    protocol_number TEXT        NOT NULL,                           -- z.B. "2026-001"
    inspected_by    UUID        REFERENCES users(id) ON DELETE SET NULL,
    inspected_by_name TEXT,                                         -- Name des Prüfers
    inspection_date DATE        NOT NULL DEFAULT CURRENT_DATE,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Tabelle für einzelne Prüfungsergebnisse innerhalb eines Protokolls
CREATE TABLE IF NOT EXISTS vehicle_inspection_protocol_items (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    protocol_id         UUID        NOT NULL REFERENCES vehicle_inspection_protocols(id) ON DELETE CASCADE,
    inspection_object_id UUID       NOT NULL REFERENCES vehicle_inspection_objects(id) ON DELETE SET NULL,
    status              TEXT        NOT NULL DEFAULT 'fehlt',    -- 'geprüft', 'mangelhaft', 'fehlt'
    defect_text         TEXT,                                   -- Freitext für Mangel
    notes               TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indizes für Performance
CREATE INDEX idx_inspection_protocols_vehicle ON vehicle_inspection_protocols(vehicle_id);
CREATE INDEX idx_inspection_protocol_items_protocol ON vehicle_inspection_protocol_items(protocol_id);
CREATE INDEX idx_inspection_protocol_items_object ON vehicle_inspection_protocol_items(inspection_object_id);