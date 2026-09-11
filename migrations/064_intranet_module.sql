-- Modul-Aktivierungsstatus für Intranet (Standard: aus)
INSERT INTO settings (key, value) VALUES ('module_intranet', 'false') ON CONFLICT (key) DO NOTHING;