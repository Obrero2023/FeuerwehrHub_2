-- Add signature column to users table for scanned signatures
ALTER TABLE users ADD COLUMN IF NOT EXISTS signature TEXT;

-- Index for finding certificates by unit leader
CREATE INDEX IF NOT EXISTS idx_participation_unit_leader ON participation_certificates(unit_leader_id);