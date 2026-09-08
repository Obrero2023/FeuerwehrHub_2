-- Migration 059: Fahrzeugprüfung – Inspektionsobjekte & Ergebnisse

-- ── Objekte, die in einer Fahrzeugprüfung geprüft werden (z.B. PA, TS) ────────
CREATE TABLE IF NOT EXISTS vehicle_inspection_objects (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_type    TEXT        NOT NULL DEFAULT 'hlf1',           -- hlf1 | hlf2 | mtf
    key             TEXT        NOT NULL,                          -- PA, TS, ...
    label           TEXT        NOT NULL,                          -- "Pumpenprüfung"
    sort_order      INTEGER     NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (vehicle_type, key)
);

-- ── Ergebnisse einer abgeschlossenen Fahrzeugprüfung ───────────────────────────
CREATE TABLE IF NOT EXISTS vehicle_inspection_results (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id      UUID        NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    inspection_object_id UUID  NOT NULL REFERENCES vehicle_inspection_objects(id) ON DELETE SET NULL,
    checked         BOOLEAN     NOT NULL DEFAULT TRUE,     -- wurde geprüft?
    defect          BOOLEAN     NOT NULL DEFAULT FALSE,   -- war ein Mangel dabei?
    defect_text     TEXT,                                 -- Freitext für Mangel
    checked_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
    checked_by_name TEXT,                                 -- Name des Prüfers
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_inspection_results_vehicle ON vehicle_inspection_results(vehicle_id);
CREATE INDEX idx_inspection_results_object  ON vehicle_inspection_results(inspection_object_id);
CREATE INDEX idx_inspection_results_by      ON vehicle_inspection_results(checked_by);
