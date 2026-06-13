-- DSGVO Stufe 2: Gesundheitsdaten-Kennzeichnung bei Qualifikationen
-- (Verschlüsselung von Kontaktdaten passiert auf Anwendungsebene — kein Schema-Change nötig)

ALTER TABLE qualifications
    ADD COLUMN IF NOT EXISTS is_health_data BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN qualifications.is_health_data IS
    'Art. 9 DSGVO: Gesundheitsdatum (z.B. Atemschutz G26/3 = ärztliche Tauglichkeit). '
    'Zugriff beschränkt auf Admin + betreffendes Mitglied.';
