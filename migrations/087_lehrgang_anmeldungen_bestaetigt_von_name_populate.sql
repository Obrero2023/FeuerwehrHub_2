-- Migration 087: Populate bestaetigt_von_name for existing records based on bestaetigt_von
UPDATE lehrgang_anmeldungen
SET bestaetigt_von_name = COALESCE(
    (SELECT display_name FROM users WHERE id = lehrgang_anmeldungen.bestaetigt_von),
    (SELECT username FROM users WHERE id = lehrgang_anmeldungen.bestaetigt_von)
)
WHERE bestaetigt_von IS NOT NULL AND bestaetigt_von_name IS NULL;