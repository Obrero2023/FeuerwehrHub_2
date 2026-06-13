-- Migration 051: Einsatzart-Kategorien dynamisieren
--
-- Entfernt den CHECK-Constraint auf incident_types.category und
-- aktualisiert bestehende Kategorie-Keys zu lesbaren Bezeichnungen.
-- Ab jetzt können Admins beliebige Kategorien vergeben (Freitext).

ALTER TABLE incident_types DROP CONSTRAINT IF EXISTS incident_types_category_check;

UPDATE incident_types SET category = 'Brand'     WHERE category = 'brand';
UPDATE incident_types SET category = 'THL'       WHERE category = 'thl';
UPDATE incident_types SET category = 'Gefahrgut' WHERE category = 'gefahrgut';
UPDATE incident_types SET category = 'Fehlalarm' WHERE category = 'fehlalarm';
UPDATE incident_types SET category = 'Sonstiges' WHERE category = 'sonstiges';
