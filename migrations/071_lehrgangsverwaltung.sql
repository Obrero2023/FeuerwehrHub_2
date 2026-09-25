-- Migration 071: Lehrgangsverwaltung — Tabellen für Lehrgänge und Registrierungen

-- ── Tabelle: courses (Lehrgänge) ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS courses (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title                TEXT NOT NULL,
    description          TEXT,
    location             TEXT,
    start_date           DATE,
    end_date             DATE,
    registration_deadline DATE,
    max_participants     INTEGER,
    prerequisites        TEXT[] NOT NULL DEFAULT '{}',
    status               TEXT NOT NULL DEFAULT 'entwurf'
                           CHECK (status IN ('entwurf','veroeffentlicht','abgeschlossen','archiviert')),
    created_by           UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by_name      TEXT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by           UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by_name      TEXT
);

DROP TRIGGER IF EXISTS courses_updated_at ON courses;
CREATE TRIGGER courses_updated_at
    BEFORE UPDATE ON courses
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_courses_status ON courses(status);
CREATE INDEX IF NOT EXISTS idx_courses_start_date ON courses(start_date);
CREATE INDEX IF NOT EXISTS idx_courses_created_by ON courses(created_by);

-- ── Tabelle: course_registrations (Registrierungen) ──────────────────────────────

CREATE TABLE IF NOT EXISTS course_registrations (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id     UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    registered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status        TEXT NOT NULL DEFAULT 'angemeldet'
                    CHECK (status IN ('angemeldet','platzzugewiesen','warteliste','abgelehnt','storniert')),
    assigned_by   UUID REFERENCES users(id) ON DELETE SET NULL,
    assigned_at   TIMESTAMPTZ,
    notes         TEXT
);

-- Doppelte Registrierungen verhindern
ALTER TABLE course_registrations
    ADD CONSTRAINT IF NOT EXISTS uq_course_user UNIQUE (course_id, user_id);

CREATE INDEX IF NOT EXISTS idx_course_registrations_course_id ON course_registrations(course_id);
CREATE INDEX IF NOT EXISTS idx_course_registrations_user_id ON course_registrations(user_id);
CREATE INDEX IF NOT EXISTS idx_course_registrations_status ON course_registrations(status);

-- ── Standard-Rollen ─────────────────────────────────────────────────────────────

INSERT INTO roles (name, permissions, type) VALUES
    ('Lehrgangsverwaltung Leser',     ARRAY['lehrgangsverwaltung'],              'funktion'),
    ('Lehrgangsverwaltung Admin',     ARRAY['lehrgangsverwaltung.verwalten'],    'funktion')
ON CONFLICT (name) DO NOTHING;