-- Modul-Aktivierungsstatus für Fahrzeugbuchung (Standard: aus)
INSERT INTO settings (key, value) VALUES ('module_fahrzeugbuchung', 'false') ON CONFLICT (key) DO NOTHING;