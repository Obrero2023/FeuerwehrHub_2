-- Migration 052: Konfigurierbare Artikel-Kategorien
--
-- Admins können Kategorien voranlegen; das Feld articles.category bleibt
-- ein Freitext-Snapshot (kein FK) für Rückwärtskompatibilität.
-- Beim Umbenennen einer Kategorie werden bestehende Artikel kaskadierend
-- mitgeändert (via Backend-Handler).

CREATE TABLE IF NOT EXISTS article_categories (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    label      TEXT        NOT NULL UNIQUE,
    sort_order INTEGER     NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_article_categories_sort ON article_categories(sort_order, label);

-- Bestehende Kategorien aus Artikeln übernehmen
INSERT INTO article_categories (label, sort_order)
SELECT DISTINCT category, 0
FROM articles
WHERE category IS NOT NULL AND category <> ''
ON CONFLICT (label) DO NOTHING;
