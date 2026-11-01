-- Lehrgangsverwaltung: Status-Erweiterung
-- Fügt die Statuswerte 'entwurf', 'veröffentlicht' und 'archiviert' hinzu
-- Damit Leser nur veröffentlichte Lehrgänge sehen können

DO $$
BEGIN
    -- Prüfen ob die Constraint bereits erweiterte Werte hat, falls nicht, erweitern
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'lehrgaenge_status_check'
    ) THEN
        -- Falls Constraint noch nicht existiert (unlikely), erstellen wir es
        EXECUTE 'ALTER TABLE lehrgaenge ADD CONSTRAINT lehrgaenge_status_check CHECK (status IN (''geplant'', ''offen'', ''voll'', ''abgesagt'', ''abgeschlossen'', ''entwurf'', ''veröffentlicht'', ''archiviert'') )';
    ELSE
        -- Bestehendes Constraint entfernen und erweitern
        EXECUTE 'ALTER TABLE lehrgaenge DROP CONSTRAINT lehrgaenge_status_check';
        EXECUTE 'ALTER TABLE lehrgaenge ADD CONSTRAINT lehrgaenge_status_check CHECK (status IN (''geplant'', ''offen'', ''voll'', ''abgesagt'', ''abgeschlossen'', ''entwurf'', ''veröffentlicht'', ''archiviert'') )';
    END IF;
END
$$;

-- Beispiel-Datensätze mit neuen Status-Werten (kommentiert, da existierende Daten nicht überschrieben werden sollen)
-- UPDATE lehrgaenge SET status = 'veröffentlicht' WHERE status = 'offen' AND ...
-- UPDATE lehrgaenge SET status = 'entwurf' WHERE status = 'geplant' AND ...
-- UPDATE lehrgaenge SET status = 'archiviert' WHERE status = 'abgeschlossen' AND ...