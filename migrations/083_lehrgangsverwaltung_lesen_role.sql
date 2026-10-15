-- Lehrgangsverwaltung: Füge die 'Lesen'-Rolle hinzu
-- Diese Rolle erlaubt es Benutzern, Lehrgänge zu sehen aber nicht zu verwalten
INSERT INTO roles (name, permissions, type, level) VALUES
    ('Lehrgangsverwaltung (Lesen)', ARRAY['lehrgangsverwaltung'], 'dienstgrad', 1)
ON CONFLICT (name) DO NOTHING;
