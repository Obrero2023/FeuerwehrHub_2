-- Lehrgangsverwaltung: Anmeldungen (N:M User ↔ Lehrgang)
CREATE TABLE lehrgang_anmeldungen (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lehrgang_id UUID NOT NULL REFERENCES lehrgaenge(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'angemeldet'
        CHECK (status IN ('angemeldet', 'bestaetigt', 'abgelehnt', 'abgemeldet', 'teilgenommen', 'nicht_erschienen')),
    anmeldedatum TIMESTAMPTZ DEFAULT NOW(),
    aktualisiert_am TIMESTAMPTZ DEFAULT NOW(),
    bemerkung TEXT,
    bestaetigt_von UUID REFERENCES users(id) ON DELETE SET NULL,
    bestaetigt_am TIMESTAMPTZ,
    UNIQUE (lehrgang_id, user_id)
);

CREATE INDEX idx_anmeldungen_lehrgang ON lehrgang_anmeldungen(lehrgang_id);
CREATE INDEX idx_anmeldungen_user ON lehrgang_anmeldungen(user_id);
CREATE INDEX idx_anmeldungen_status ON lehrgang_anmeldungen(status);
