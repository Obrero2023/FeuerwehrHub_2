-- Lehrgangsverwaltung: Rollen aktualisieren (nachträglich hinzugefügt)
-- Lehrgangsverwaltung Leser und Admin als Vorlagen (können im Admin Panel angepasst werden)
INSERT INTO roles (name, permissions, type, level) VALUES
    ('Lehrgangsverwaltung Leser',    ARRAY['lehrgangsverwaltung.lesen'],    'funktion', NULL),
    ('Lehrgangsverwaltung Admin',    ARRAY['lehrgangsverwaltung.verwalten'], 'funktion', NULL)
ON CONFLICT (name) DO NOTHING;