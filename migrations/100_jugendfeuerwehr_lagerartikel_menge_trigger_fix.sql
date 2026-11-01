-- Jugendfeuerwehr: Lagerartikel menge_trigger Fix (Spaltennamen korrigiert)
-- jsonb_each_text gibt Spalten 'key' und 'value' zurück, nicht 'k' und 'v'
-- Wir nutzen expliziten Alias AS t(k, v) wie im groessen_trigger

CREATE OR REPLACE FUNCTION jugendfeuerwehr_lagerartikel_menge_trigger()
RETURNS TRIGGER AS $$
BEGIN
    NEW.menge := COALESCE(
        (SELECT SUM((t.v)::integer)
         FROM jsonb_each_text(NEW.menge_per_groesse) AS t(k, v)
         WHERE (t.v)::text ~ '^[0-9]+$'),
        0
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_jugendfeuerwehr_lagerartikel_menge ON jugendfeuerwehr_lagerartikel;
CREATE TRIGGER trigger_jugendfeuerwehr_lagerartikel_menge
BEFORE INSERT OR UPDATE ON jugendfeuerwehr_lagerartikel
FOR EACH ROW EXECUTE FUNCTION jugendfeuerwehr_lagerartikel_menge_trigger();