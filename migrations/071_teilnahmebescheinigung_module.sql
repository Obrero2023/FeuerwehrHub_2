-- Participation Certificates Table
CREATE TABLE IF NOT EXISTS participation_certificates (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_date              DATE NOT NULL,
    end_date                DATE NOT NULL,
    alarm_time              TIME NOT NULL,
    end_time                TIME NOT NULL,
    unit_leader_id          UUID REFERENCES users(id),
    status                  TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','signed')),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved_at             TIMESTAMPTZ,
    signed_at               TIMESTAMPTZ,
    template_path           TEXT
);

-- Indexes for common queries
CREATE INDEX idx_participation_certificates_user_id ON participation_certificates(user_id);
CREATE INDEX idx_participation_certificates_status ON participation_certificates(status);
CREATE INDEX idx_participation_certificates_unit_leader ON participation_certificates(unit_leader_id);

-- Three new roles for Teilnahmebescheinigung-Feuerwehreinsatz
-- Rolle 1: Admin (volle Rechte: Template hochladen, alle Aktionen)
INSERT INTO roles (name, permissions, type, level) VALUES
    ('Teilnahmebescheinigung-Feuerwehreinsatz (Admin)',           ARRAY['teilnahmebescheinigung.admin'],              'dienstgrad',  NULL),
-- Rolle 2: Schreiben (berechtigt zum Freigeben und Unterschreiben)
INSERT INTO roles (name, permissions, type, level) VALUES
    ('Teilnahmebescheinigung-Feuerwehreinsatz (Schreiben)',        ARRAY['teilnahmebescheinigung.schreiben'],         'funktion',    NULL),
-- Rolle 3: Lesen (berechtigt, eigene Bescheinigungen zu erstellen)
INSERT INTO roles (name, permissions, type, level) VALUES
    ('Teilnahmebescheinigung-Feuerwehreinsatz (Lesen)',            ARRAY['teilnahmebescheinigung.lesen'],              'dienstgrad',  NULL)
ON CONFLICT (name) DO NOTHING;