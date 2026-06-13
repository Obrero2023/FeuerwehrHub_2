-- Lagerort-Hierarchie: beliebig tiefe Baumstruktur via parent_id (self-reference)
CREATE TABLE storage_locations (
    id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        VARCHAR(128) NOT NULL,
    parent_id   UUID         REFERENCES storage_locations(id) ON DELETE RESTRICT,
    description TEXT,
    sort_order  INTEGER      NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_storage_locations_parent ON storage_locations(parent_id);

-- Artikel können einem Lagerort (beliebige Tiefe) zugewiesen werden
ALTER TABLE articles
    ADD COLUMN storage_location_id UUID REFERENCES storage_locations(id) ON DELETE SET NULL;

CREATE INDEX idx_articles_storage_location ON articles(storage_location_id);
