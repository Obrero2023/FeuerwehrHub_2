-- Migration 056: Schnittstellen-Integration (DIVERA / Alamos)

-- Einsatzquelle + externe ID
ALTER TABLE incident_reports
    ADD COLUMN IF NOT EXISTS source      TEXT NOT NULL DEFAULT 'manual',
    ADD COLUMN IF NOT EXISTS external_id TEXT UNIQUE;

-- Integrations-Einstellungen in bestehender Key-Value settings-Tabelle
INSERT INTO settings (key, value) VALUES
    ('divera_api_key',          ''),
    ('divera_webhook_secret',   ''),
    ('alamos_webhook_secret',   '')
ON CONFLICT (key) DO NOTHING;
