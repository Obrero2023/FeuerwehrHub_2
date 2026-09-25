-- Migration 072: Modul-Aktivierungsstatus für Lehrgangsverwaltung (Standard: aus)

INSERT INTO settings (key, value) VALUES ('module_lehrgangsverwaltung', 'false') ON CONFLICT (key) DO NOTHING;