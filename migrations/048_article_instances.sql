-- Einzelobjekt-Tracking pro Artikel aktivierbar
ALTER TABLE articles ADD COLUMN instance_tracking BOOLEAN NOT NULL DEFAULT FALSE;

-- Einzelinstanzen mit Seriennummer und Zustandsampel
CREATE TABLE article_instances (
    id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_id          UUID         NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    serial_number       VARCHAR(128),
    label               VARCHAR(128),
    condition           VARCHAR(32)  NOT NULL DEFAULT 'gut'
                        CHECK (condition IN ('gut', 'in_wartung', 'defekt', 'ausgemustert')),
    storage_location_id UUID         REFERENCES storage_locations(id) ON DELETE SET NULL,
    notes               TEXT,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_article_instances_article   ON article_instances(article_id);
CREATE INDEX idx_article_instances_condition ON article_instances(condition);

CREATE TRIGGER article_instances_updated_at
    BEFORE UPDATE ON article_instances
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
