-- Migration 086: Add bestaetigt_von_name column to lehrgang_anmeldungen
ALTER TABLE lehrgang_anmeldungen
ADD COLUMN IF NOT EXISTS bestaetigt_von_name TEXT;