-- Jugendfeuerwehr: Standard-Rollen mit Jugendfeuerwehr-Berechtigungen
-- Rollenmodell (zwei-Tier):
--   Jugendfeuerwehrwart  → volle Schreibrechte (Mitglieder anlegen, Anwerter bearbeiten/archivieren)
--   Jugendbetreuer       → Lessen + eingeschränktes Schreiben (Anwerter anlegen, Dienstteilnahmen ergänzen)
--   (unberechtigt)       → kein Zugriff auf geschützte Endpunkte
INSERT INTO roles (name, permissions, type, level) VALUES
    ('Jugendfeuerwehrwart', ARRAY['jugendfeuerwehr', 'jugendfeuerwehr.lesen',
                                  'jugendfeuerwehr.anwerter', 'jugendfeuerwehr.dienstteilnahmen',
                                  'jugendfeuerwehr.kleiderkammer', 'jugendfeuerwehr.mitglieder',
                                  'jugendfeuerwehr.mitgliedschaftsvorgaenge'], 'dienstgrad', 1),
    ('Jugendbetreuer',      ARRAY['jugendfeuerwehr.lesen',
                                  'jugendfeuerwehr.anwerter', 'jugendfeuerwehr.dienstteilnahme',
                                  'jugendfeuerwehr.kleiderkammer.lesen', 'jugendfeuerwehr.mitglieder.lesen'],
                            'dienstgrad', 1)
ON CONFLICT (name) DO NOTHING;
