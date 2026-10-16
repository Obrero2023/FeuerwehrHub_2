-- Lehrgänge: Spalte kosten entfernen (Kosten-Konzept vollständig entfernt)
ALTER TABLE lehrgaenge
DROP COLUMN IF EXISTS kosten;
