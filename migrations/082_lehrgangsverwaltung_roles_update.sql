-- Lehrgangsverwaltung: Rollen aktualisieren (nachträglich hinzugefügt)
-- Lehrgangsverwaltung Admin und Verwalter als Dienstgrade (keine Zusatzfunktionen)
-- Die Hierarchie: Admin > Verwalter > Leser
INSERT INTO roles (name, permissions, type, level) VALUES
    ('Lehrgangsverwaltung Leser',     ARRAY['lehrgangsverwaltung.lesen'],    'dienstgrad', 1),
    ('Lehrgangsverwaltung Verwalter', ARRAY['lehrgangsverwaltung.verwalten'], 'dienstgrad', 2),
    ('Lehrgangsverwaltung Admin',     ARRAY['lehrgangsverwaltung.admin'],   'dienstgrad', 3)
ON CONFLICT (name) DO NOTHING;