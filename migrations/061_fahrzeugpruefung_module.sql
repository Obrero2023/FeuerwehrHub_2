-- Modul-Aktivierungsstatus für Fahrzeugprüfung (Standard: aus)
INSERT INTO settings (key, value) VALUES ('module_fahrzeugpruefung', 'false') ON CONFLICT (key) DO NOTHING;