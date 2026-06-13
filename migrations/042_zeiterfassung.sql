-- Badge-Code fuer Stempeluhr (QR/Barcode/RFID-Kennung pro Mitglied)
ALTER TABLE users ADD COLUMN IF NOT EXISTS badge_code VARCHAR(128);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_badge_code ON users(badge_code) WHERE badge_code IS NOT NULL;

-- Zeiterfassung: Ein-/Ausstempeln
CREATE TABLE IF NOT EXISTS time_entries (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    check_in    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    check_out   TIMESTAMPTZ,
    typ         VARCHAR(50) NOT NULL DEFAULT 'wachdienst',
    notes       TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_time_entries_user    ON time_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_checkin ON time_entries(check_in DESC);
