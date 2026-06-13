CREATE TABLE article_components (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_article_id UUID         NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    child_article_id  UUID         NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    quantity          INT          NOT NULL DEFAULT 1 CHECK (quantity > 0),
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (parent_article_id, child_article_id),
    CHECK  (parent_article_id != child_article_id)
);

CREATE INDEX idx_article_components_parent ON article_components(parent_article_id);
CREATE INDEX idx_article_components_child  ON article_components(child_article_id);
