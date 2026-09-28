-- Migration 071: Lehrgangsverwaltung (Lehrgänge)
-- Erstellt Tabellen für Feuerwehr-Lehrgänge und -Registrierungen

-- Haupt-Tabelle für Lehrgänge
CREATE TABLE lehrgaenge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titel VARCHAR(200) NOT NULL,
    description TEXT,
    veranstaltungsort VARCHAR(200),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    registration_deadline DATE NOT NULL,
    max_places INTEGER NOT NULL CHECK (max_places >= 0),
    -- Voraussetzungen als JSONB Array von Qualifikations-IDs oder Freitext
    prerequisites JSONB NOT NULL DEFAULT '[]',
    -- Status: Entwurf / Veröffentlicht / Abgeschlossen / Archiviert
    status VARCHAR(20) NOT NULL CHECK (status IN ('entwurf', 'veröffentlicht', 'abgeschlossen', 'archiviert')),
    -- Foreign key zum Ersteller (User ID)
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraint: Startdatum muss vor Enddatum liegen
    CONSTRAINT chk_datum_zeitraum CHECK (start_date < end_date),
    -- Constraint: Anmeldefrist muss in der Zukunft liegen für veröffentlichte Lehrgänge
    CONSTRAINT chk_anmeldefrist_zukunft CHECK (status != 'veröffentlicht' OR registration_deadline > NOW()::DATE)
);

-- Trigger: updated_at automatisch setzen
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS lehrgaenge_updated_at ON lehrgaenge;
CREATE TRIGGER lehrgaenge_updated_at
    BEFORE UPDATE ON lehrgaenge
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Tabelle für Lehrgang-Registrierungen (Anmeldungen)
CREATE TABLE lehrgang_registrierungen (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lehrgang_id UUID NOT NULL REFERENCES lehrgaenge(id) ON DELETE CASCADE,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Status: angemeldet / beworben / platz_zugewiesen / warteliste / abgelehnt / storniert
    status VARCHAR(20) NOT NULL CHECK (status IN ('angemeldet', 'bewerbt', 'platz_zugewiesen', 'warteliste', 'abgelehnt', 'storniert')),

    -- UNIQUE: ein Benutzer kann sich nur einmal pro Lehrgang registrieren
    CONSTRAINT uq_benutzer_lehrgang UNIQUE (user_id, lehrgang_id)
);

-- Indexe für häufige Abfragen
CREATE INDEX idx_lehrgaenge_status ON lehrgaenge(status);
CREATE INDEX idx_lehrgaenge_start_date ON lehrgaenge(start_date);
CREATE INDEX idx_lehrgaenge_registrierung ON lehrgang_registrierungen(lehrgang_id, status);
CREATE INDEX idx_lehrgaenge_registrierung_benutzer ON lehrgang_registrierungen(user_id);

-- Audit-Trigger für lehrgaenge-Tabelle
CREATE OR REPLACE FUNCTION audit_lehrgaenge_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log (user_id, username, action, entity, entity_id, details)
        VALUES (NEW.creator_id, (SELECT username FROM users WHERE id = NEW.creator_id), 'lehrgang_created', 'lehrgaenge', NEW.id, jsonb_build_object('titel', NEW.titel, 'status', NEW.status));
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_log (user_id, username, action, entity, entity_id, details)
        VALUES (NEW.creator_id, (SELECT username FROM users WHERE id = NEW.creator_id), 'lehrgang_updated', 'lehrgaenge', NEW.id, jsonb_build_object('titel', NEW.titel, 'status', NEW.status));
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (user_id, username, action, entity, entity_id, details)
        VALUES (OLD.creator_id, (SELECT username FROM users WHERE id = OLD.creator_id), 'lehrgang_deleted', 'lehrgaenge', OLD.id, jsonb_build_object('titel', OLD.titel, 'status', OLD.status));
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_lehrgaenge_trigger ON lehrgaenge;
CREATE TRIGGER audit_lehrgaenge_trigger
    AFTER INSERT OR UPDATE OR DELETE ON lehrgaenge
    FOR EACH ROW EXECUTE FUNCTION audit_lehrgaenge_trigger();

-- Audit-Trigger für lehrgang_registrierungen-Tabelle
CREATE OR REPLACE FUNCTION audit_lehrgang_registrierungen_trigger()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_log (user_id, username, action, entity, entity_id, details)
        VALUES (NEW.user_id, (SELECT username FROM users WHERE id = NEW.user_id), 'lehrgang_registration_created', 'lehrgang_registrierungen', NEW.id, jsonb_build_object('lehrgang_id', NEW.lehrgang_id, 'status', NEW.status));
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_log (user_id, username, action, entity, entity_id, details)
        VALUES (NEW.user_id, (SELECT username FROM users WHERE id = NEW.user_id), 'lehrgang_registration_updated', 'lehrgang_registrierungen', NEW.id, jsonb_build_object('lehrgang_id', NEW.lehrgang_id, 'status', NEW.status));
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_log (user_id, username, action, entity, entity_id, details)
        VALUES (OLD.user_id, (SELECT username FROM users WHERE id = OLD.user_id), 'lehrgang_registration_deleted', 'lehrgang_registrierungen', OLD.id, jsonb_build_object('lehrgang_id', OLD.lehrgang_id, 'status', OLD.status));
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_lehrgang_registrierungen_trigger ON lehrgang_registrierungen;
CREATE TRIGGER audit_lehrgang_registrierungen_trigger
    AFTER INSERT OR UPDATE OR DELETE ON lehrgang_registrierungen
    FOR EACH ROW EXECUTE FUNCTION audit_lehrgang_registrierungen_trigger();

-- Bestätigung: Einträge in die settings-Tabelle für Modulintegration einfügen
INSERT INTO settings (key, value) VALUES ('module_lehrgaenge', 'false') ON CONFLICT (key) DO NOTHING;

-- Standard-Rollen für Lehrgangsverwaltung (werden später überarbeitet, da weißer)
-- Diese werden später von Admin-Panel konfiguriert, aber eine grundlegende Rolle bereitstellen
INSERT INTO roles (name, permissions, type, level) VALUES
    ('Lehrgangsverwaltung Leser', ARRAY['lehrgangsverwaltung.lesen'], 'dienstgrad', 80),
    ('Lehrgangsverwaltung Admin', ARRAY['lehrgangsverwaltung.lesen', 'lehrgangsverwaltung.verwalten'], 'funktion', NULL)
ON CONFLICT (name) DO NOTHING;

-- Standard-Berechtigung Token: fahrzeugbuchung: Verwalter dürfen auch Buchungen erstellen/einsehen
INSERT INTO functions (name, permissions) VALUES
    ('lehrgangsverwaltung', ARRAY['lehrgangsverwaltung.lesen']),
    ('lehrgangsverwaltung_admin', ARRAY['lehrgangsverwaltung.verwalten'])
ON CONFLICT (name) DO NOTHING;