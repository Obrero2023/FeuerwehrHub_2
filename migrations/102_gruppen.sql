-- Migration 102: Gruppen-Tabelle
--
-- Gruppen für die Gliederung der Feuerwehr (z.B. 1. Gruppe, 2. Gruppe, etc.)

CREATE TABLE IF NOT EXISTS gruppen (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    fahrzeug        TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gruppen_name ON gruppen(name);