-- Verknüpfung Zeiterfassung ↔ Termine
-- Beim Einstempeln wird automatisch geprüft ob gerade ein Termin läuft
-- und der Eintrag daran gehängt (nullable — ältere Einträge bleiben unverändert)
ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS termin_id UUID REFERENCES termine(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_time_entries_termin ON time_entries(termin_id) WHERE termin_id IS NOT NULL;
