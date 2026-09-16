-- Teilnahmebescheinigung-Feuerwehreinsatz Rollen
-- Diese Migration fügt die drei Rollen hinzu (Migration 071 hat die Tabelle erstellt)

-- Lösche eventuell existierende Rollen und füge sie korrekt ein
DELETE FROM roles WHERE name IN (
    'Teilnahmebescheinigung-Feuerwehreinsatz (Admin)',
    'Teilnahmebescheinigung-Feuerwehreinsatz (Schreiben)',
    'Teilnahmebescheinigung-Feuerwehreinsatz (Lesen)'
);

-- Rolle 1: Admin (volle Rechte: Template hochladen, alle Aktionen)
INSERT INTO roles (name, permissions, type, level) VALUES
    ('Teilnahmebescheinigung-Feuerwehreinsatz (Admin)', ARRAY['teilnahmebescheinigung.admin'], 'dienstgrad', NULL);

-- Rolle 2: Schreiben (berechtigt zum Freigeben und Unterschreiben)
INSERT INTO roles (name, permissions, type, level) VALUES
    ('Teilnahmebescheinigung-Feuerwehreinsatz (Schreiben)', ARRAY['teilnahmebescheinigung.schreiben'], 'funktion', NULL);

-- Rolle 3: Lesen (berechtigt, eigene Bescheinigungen zu erstellen)
INSERT INTO roles (name, permissions, type, level) VALUES
    ('Teilnahmebescheinigung-Feuerwehreinsatz (Lesen)', ARRAY['teilnahmebescheinigung'], 'dienstgrad', NULL);