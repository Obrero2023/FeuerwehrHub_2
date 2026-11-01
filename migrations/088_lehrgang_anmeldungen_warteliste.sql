-- Migration 088: Allow 'warteliste' status in lehrgang_anmeldungen (waitlist when full)
-- The CHECK constraint needs to be recreated since it's an enum-like check
ALTER TABLE lehrgang_anmeldungen
DROP CONSTRAINT IF EXISTS lehrgang_anmeldungen_status_check;

ALTER TABLE lehrgang_anmeldungen
ADD CONSTRAINT lehrgang_anmeldungen_status_check
CHECK (status IN ('angemeldet', 'bestaetigt', 'abgelehnt', 'abgemeldet', 'teilgenommen', 'nicht_erschienen', 'warteliste'));