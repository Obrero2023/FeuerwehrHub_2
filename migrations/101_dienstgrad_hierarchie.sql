-- Migration 101: Dienstgrad-Hierarchie (Vorgänger + Mindesthaltezeit)
--
-- previous_role_id: Selbstreferenz auf roles für Vorgänger-Dienstgrad
-- min_duration_months: Mindesthaltezeit in Monaten vor Beförderung

ALTER TABLE roles ADD COLUMN IF NOT EXISTS previous_role_id UUID REFERENCES roles(id) ON DELETE SET NULL;
ALTER TABLE roles ADD COLUMN IF NOT EXISTS min_duration_months INTEGER NOT NULL DEFAULT 0;

-- Index für effiziente Abfragen der Vorgänger-Kette
CREATE INDEX IF NOT EXISTS idx_roles_previous_role ON roles(previous_role_id);