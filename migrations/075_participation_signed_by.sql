-- Track which user signed a participation certificate
ALTER TABLE participation_certificates ADD COLUMN IF NOT EXISTS signed_by UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_participation_certificates_signed_by ON participation_certificates(signed_by);
