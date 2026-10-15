-- Lehrgangsverwaltung: Lehrgangsverwaltung (Lesen) Rolle zusammenfügen
-- Es gab zwei 'Lehrgangsverwaltung (Lesen)' Rollen, nun werden sie zu einer zusammengefasst.
-- Die neue Rolle hat die Permission 'lehrgangsverwaltung.lesen'
-- Bestehende Users mit der alten Rolle werden auf die neue Permission aktualisiert

-- Neue 'Lehrgangsverwaltung (Lesen)' Rolle hinzufügen (falls noch nicht vorhanden)
INSERT INTO roles (name, permissions, type, level) VALUES
    ('Lehrgangsverwaltung (Lesen)', ARRAY['lehrgangsverwaltung.lesen'], 'dienstgrad', 1)
ON CONFLICT (name) DO NOTHING;

-- Bestehende Users, die die alte 'Lehrgangsverwaltung (Lesen)' Rolle hatten,
-- auf die neue Permission 'lehrgangsverwaltung.lesen' aktualisieren
UPDATE users
SET role_id = (
    SELECT id FROM roles WHERE name = 'Lehrgangsverwaltung (Lesen)'
)
WHERE role_id = (
    SELECT id FROM roles WHERE name = 'Lehrgangsverwaltung (Lesen)'
);

-- Optional: Wenn es noch eine zweite 'Lehrgangsverwaltung (Lesen)' Rolle gab,
-- diese nun deaktivieren/entfernen
-- (Dies setzt voraus, dass die alte Rolle exakt diesen Namen hatte)
DELETE FROM roles WHERE name = 'Lehrgangsverwaltung (Lesen) Old';