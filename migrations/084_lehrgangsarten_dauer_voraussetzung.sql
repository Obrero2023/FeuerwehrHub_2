-- Lehrgangsarten: Dauer-Spalte hinzufügen (Anzahl Tage)
ALTER TABLE lehrgangsarten
ADD COLUMN dauer INTEGER NOT NULL DEFAULT 0;

-- Lehrgangsarten: Voraussetzungen als Array von UUIDs hinzufügen
-- Speichert UUIDs der notwendigen vorherigen Lehrgangsarten
ALTER TABLE lehrgangsarten
ADD COLUMN voraussetzungen TEXT[] DEFAULT '{}';

-- Kommentar: Die Spalten dauer und Voraussetzungen ermöglichen es,
-- Lehrgangsarten zu kennzeichnen, wie lange ein Lehrgang dauert und
-- welche vorherigen Lehrgangsarten erforderlich sind.