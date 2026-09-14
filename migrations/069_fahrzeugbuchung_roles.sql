-- Standard-Fahrzeugbuchungs-Rollen als Vorlagen (können im Admin Panel angepasst werden)
INSERT INTO roles (name, permissions, type, level) VALUES
    ('Fahrzeugbucher',           ARRAY['fahrzeugbuchung'],              'dienstgrad',  NULL),
    ('Buchungsverwalter',        ARRAY['fahrzeugbuchung.verwalten'],     'funktion',    NULL)
ON CONFLICT (name) DO NOTHING;