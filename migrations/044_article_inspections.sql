-- Prüf- und Wartungsfristen pro Lagerartikel (analog vehicle_inspections)
CREATE TABLE IF NOT EXISTS article_inspections (
    id              UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_id      UUID        NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    name            TEXT        NOT NULL,
    last_date       DATE,
    next_date       DATE,
    interval_months INTEGER,
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_article_inspections_article ON article_inspections(article_id);
CREATE INDEX IF NOT EXISTS idx_article_inspections_next    ON article_inspections(next_date);
