-- Standard-Feuerwehrrollen als Vorlagen (können im Admin Panel angepasst werden)
INSERT INTO roles (name, permissions) VALUES
    ('Wehrleiter',          ARRAY['lager', 'lehrgangsverwaltung.verwalten']),
    ('Zugführer',           ARRAY['lehrgangsverwaltung.lesen']),
    ('Gruppenführer',       ARRAY['lehrgangsverwaltung.lesen']),
    ('Truppführer',         ARRAY['lehrgangsverwaltung.lesen']),
    ('Truppmann',           ARRAY['lehrgangsverwaltung.lesen']),
    ('Gerätewart',          ARRAY['lager']),
    ('Jugendfeuerwehrwart', ARRAY['lehrgangsverwaltung.lesen'])
ON CONFLICT (name) DO NOTHING;
