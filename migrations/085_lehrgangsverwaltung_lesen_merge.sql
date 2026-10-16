-- Lehrgangsverwaltung: Lehrgangsverwaltung (Lesen) Rolle zusammenfügen
-- Es gab zwei 'Lehrgangsverwaltung (Lesen)' Rollen, nun werden sie zu einer zusammengefasst.
-- Die neue Rolle hat die Permission 'lehrgangsverwaltung.lesen'
-- Bestehende Users mit der alten Rolle werden auf die neue Permission aktualisiert

-- Bestehende 'Lehrgangsverwaltung (Lesen)' Rolle auf die korrekte Permission updaten
INSERT INTO roles (name, permissions, type, level) VALUES
    ('Lehrgangsverwaltung (Lesen)', ARRAY['lehrgangsverwaltung.lesen'], 'dienstgrad', 1)
ON CONFLICT (name) DO UPDATE SET
    permissions = EXCLUDED.permissions,
    type = EXCLUDED.type,
    level = EXCLUDED.level;

-- Optional: Falls die alte Rolle mit Permission 'lehrgangsverwaltung' existierte,
-- diese durch die neue Rolle mit Permission 'lehrgangsverwaltung.lesen' ersetzen
UPDATE users
SET role_id = (
    SELECT id FROM roles WHERE name = 'Lehrgangsverwaltung (Lesen)'
)
WHERE role_id = (
    SELECT id FROM roles WHERE name = 'Lehrgangsverwaltung (Lesen)'
    AND permissions @> ARRAY['lehrgangsverwaltung']
);