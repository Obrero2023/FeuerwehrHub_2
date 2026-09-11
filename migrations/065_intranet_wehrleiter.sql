-- Wehrleiter (Wehrführer) bekommt die Intranet-Berechtigung,
-- damit er Einträge veröffentlichten kann (neben Admins).
UPDATE roles SET permissions = ARRAY['lager', 'intranet'] WHERE name = 'Wehrleiter';