-- Migration 014: Modul-Aktivierungsstatus (Standard: alle aus)
INSERT INTO settings (key, value) VALUES ('module_lager', 'false') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('module_fahrzeugbuchung', 'false') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('module_fahrzeugpruefung', 'false') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('module_einsatzberichte', 'false') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('module_personal', 'false') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('module_verein', 'false') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('module_intranet', 'false') ON CONFLICT (key) DO NOTHING;
INSERT INTO settings (key, value) VALUES ('module_lehrgaenge', 'false') ON CONFLICT (key) DO NOTHING;