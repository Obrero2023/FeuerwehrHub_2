-- Lehrgangsverwaltung: Rollen aktualisieren (nachträglich hinzugefügt)
-- Lehrgangsverwaltung Verwalter und Admin als Dienstgrade (keine Zusatzfunktionen)
-- Die Hierarchie: Admin > Verwalter (Leser wird nicht mehr als separate Rolle angeboten)
INSERT INTO roles (name, permissions, type, level) VALUES
    ('Lehrgangsverwaltung Verwalter', ARRAY['lehrgangsverwaltung.verwalten'], 'dienstgrad', 2),
    ('Lehrgangsverwaltung Admin',     ARRAY['lehrgangsverwaltung.admin'],   'dienstgrad', 3)
ON CONFLICT (name) DO NOTHING;