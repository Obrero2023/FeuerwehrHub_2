-- Migration 057: Ausrüstungszuordnung — Status (ausgegeben / zurückgegeben)

ALTER TABLE member_equipment
    ADD COLUMN IF NOT EXISTS status      TEXT NOT NULL DEFAULT 'ausgegeben',
    ADD COLUMN IF NOT EXISTS returned_at DATE;
