-- Jugendfeuerwehr: Standard-Rollen mit Jugendfeuerwehr-Berechtigungen
INSERT INTO roles (name, permissions, type, level) VALUES
    ('Jugendfeuerwehrwart',    ARRAY['jugendfeuerwehr', 'jugendfeuerwehr.lesen']),
    ('Jugendbetreuer',         ARRAY['jugendfeuerwehr.lesen'])
ON CONFLICT (name) DO NOTHING;