-- Migration 058: Dienstberichte (Übungs-/Dienstbuch)

CREATE TABLE IF NOT EXISTS dienst_reports (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date     DATE        NOT NULL,
    title           TEXT        NOT NULL,
    category        TEXT        NOT NULL DEFAULT 'uebung', -- uebung | dienstabend | sonstiges
    duration_min    INTEGER,
    location        TEXT,
    notes           TEXT,
    leader_id       UUID        REFERENCES users(id) ON DELETE SET NULL,
    leader_name     TEXT,
    created_by      UUID        REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dienst_report_participants (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    report_id       UUID        NOT NULL REFERENCES dienst_reports(id) ON DELETE CASCADE,
    user_id         UUID        REFERENCES users(id) ON DELETE SET NULL,
    display_name    TEXT        NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS dienst_reports_updated_at ON dienst_reports;
CREATE TRIGGER dienst_reports_updated_at
    BEFORE UPDATE ON dienst_reports
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
