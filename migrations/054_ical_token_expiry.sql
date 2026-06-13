-- iCal-Token Erstellungszeitpunkt für automatische Jahres-Rotation
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS ical_token_created_at TIMESTAMPTZ;

COMMENT ON COLUMN users.ical_token_created_at IS
    'Zeitpunkt der letzten Token-Generierung. Feed gibt 410 zurück wenn älter als 1 Jahr.';
