-- Jugendfeuerwehr: Kleiderartikel – Größenvarianten und Bestand pro Größe

-- ── Größen-Spalte (JSON-Array von Size-Strings) ───────────────────────────────

ALTER TABLE jugendfeuerwehr_lagerartikel
    ADD COLUMN IF NOT EXISTS groessen JSONB DEFAULT '[]'::jsonb;

-- ── Bestand pro Größe (JSON-Object: {"XS": 5, "S": 10, ...}) ───────────────────

ALTER TABLE jugendfeuerwehr_lagerartikel
    ADD COLUMN IF NOT EXISTS menge_per_groesse JSONB DEFAULT '{}'::jsonb;

-- ── Trigger: menge automatisch aus menge_per_groesse berechnen ─────────────────

CREATE OR REPLACE FUNCTION jugendfeuerwehr_lagerartikel_menge_trigger()
RETURNS TRIGGER AS $$
BEGIN
    -- Gesamtmenge = Summe aller Größen-Bestände
    NEW.menge := COALESCE(
        (SELECT SUM((v)::integer)
         FROM jsonb_each_text(NEW.menge_per_groesse)
         WHERE (v)::text ~ '^[0-9]+$'),
        0
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_jugendfeuerwehr_lagerartikel_menge ON jugendfeuerwehr_lagerartikel;
CREATE TRIGGER trigger_jugendfeuerwehr_lagerartikel_menge
BEFORE INSERT OR UPDATE ON jugendfeuerwehr_lagerartikel
FOR EACH ROW EXECUTE FUNCTION jugendfeuerwehr_lagerartikel_menge_trigger();

-- ── Trigger: menge_per_groesse automatisch auf leere Strings/null prüfen ──────

CREATE OR REPLACE FUNCTION jugendfeuerwehr_lagerartikel_groessen_trigger()
RETURNS TRIGGER AS $$
BEGIN
    -- Leere Werte in menge_per_groesse auf 0 setzen
    IF NEW.menge_per_groesse IS NOT NULL THEN
        NEW.menge_per_groesse := (
            SELECT jsonb_object_agg(k, COALESCE(v::integer, 0))
            FROM jsonb_each(NEW.menge_per_groesse) AS t(k, v)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_jugendfeuerwehr_lagerartikel_groessen ON jugendfeuerwehr_lagerartikel;
CREATE TRIGGER trigger_jugendfeuerwehr_lagerartikel_groessen
BEFORE INSERT OR UPDATE ON jugendfeuerwehr_lagerartikel
FOR EACH ROW EXECUTE FUNCTION jugendfeuerwehr_lagerartikel_groessen_trigger();

-- ── Standard-Größen für typische Kleidungsstücke ───────────────────────────────

-- Die Standard-Größen werden beim Anlegen eines Artikels über die API gesetzt
-- Hier lediglich Dokumentation der empfohlenen Größen-Sets:

-- Kinder/Jugend: 128, 140, 152, 164, 176
-- Erwachsene: XS, S, M, L, XL, XXL, XXXL

COMMENT ON COLUMN jugendfeuerwehr_lagerartikel.groessen IS 'JSON-Array von verfügbaren Größen, z.B. ["XS","S","M","L","XL"]';
COMMENT ON COLUMN jugendfeuerwehr_lagerartikel.menge_per_groesse IS 'JSON-Object mit Bestand pro Größe, z.B. {"XS":5,"S":10,"M":8,"L":6,"XL":4}';