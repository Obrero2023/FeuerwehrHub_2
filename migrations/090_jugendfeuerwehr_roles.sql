-- Jugendfeuerwehr: Standard-Rollen mit Jugendfeuerwehr-Berechtigungen
INSERT INTO roles (name, permissions, type, level) VALUES
    ('Jugendfeuerwehrwart',    ARRAY['jugendfeuerwehr', 'jugendfeuerwehr.lesen'], 'dienstgrad', 1),
    ('Jugendbetreuer',         ARRAY['jugendfeuerwehr.lesen'], 'dienstgrad', 1)
ON CONFLICT (name) DO NOTHING;