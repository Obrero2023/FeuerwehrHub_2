-- Lehrgangsarten: Spalte veranstaltungsort hinzufügen
ALTER TABLE lehrgangsarten
ADD COLUMN veranstaltungsort TEXT;

-- Default-Lehrgangsarten entfernen (es sollen keine Defaults mehr existieren)
DELETE FROM lehrgangsarten WHERE name IN (
    'grundlehrgang', 'aufbaulehrgang', 'speciallehrgang', 'furthereducation'
);