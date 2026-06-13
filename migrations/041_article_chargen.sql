-- EAN/Barcode-Feld am Artikel (Produkt-Ebene)
ALTER TABLE articles ADD COLUMN IF NOT EXISTS ean VARCHAR(64);

-- Chargen-Tabelle: pro Artikel mehrere Chargen mit MHD + Menge
CREATE TABLE IF NOT EXISTS article_charges (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    article_id  UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    charge_nr   VARCHAR(128) NOT NULL,
    mhd         DATE,
    menge       INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_article_charges_article ON article_charges(article_id);
CREATE INDEX IF NOT EXISTS idx_article_charges_mhd     ON article_charges(mhd);
