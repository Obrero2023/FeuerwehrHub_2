-- Modul: Fahrzeugreservierung

CREATE TABLE IF NOT EXISTS vehicle_reservations (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id      UUID        NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    user_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
    reason          TEXT        NOT NULL,
    start_date      DATE        NOT NULL,
    end_date        DATE        NOT NULL,
    start_time      TIME        NOT NULL DEFAULT '08:00',
    end_time        TIME        NOT NULL DEFAULT '18:00',
    status          TEXT        NOT NULL DEFAULT 'gebucht'
                                    CHECK (status IN ('gebucht', 'storniert', 'abgeschlossen')),
    created_by      UUID        NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vehicle_reservations_vehicle ON vehicle_reservations(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_reservations_user ON vehicle_reservations(user_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_reservations_date ON vehicle_reservations(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_vehicle_reservations_status ON vehicle_reservations(status);

-- Trigger für updated_at
DROP TRIGGER IF EXISTS vehicle_reservations_updated_at ON vehicle_reservations;
CREATE TRIGGER vehicle_reservations_updated_at
    BEFORE UPDATE ON vehicle_reservations
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Modul-Berechtigung: in settings als Option registrieren
-- (wird in settings.rs KNOWN_MODULES hinzugefügt)
