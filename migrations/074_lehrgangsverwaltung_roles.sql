-- Standard-Lehrgangsverwaltungs-Rollen als Vorlagen
INSERT INTO roles (name, permissions, type, level) VALUES
    ('Lehrgangsleser',           ARRAY['lehrgangsverwaltung'],              'funktion', NULL),
    ('Lehrgangsverwalter',       ARRAY['lehrgangsverwaltung.verwalten'],   'funktion', NULL)
ON CONFLICT (name) DO NOTHING;
