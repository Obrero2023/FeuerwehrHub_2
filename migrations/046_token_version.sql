-- Token-Versionierung für JWT-Revocation (Logout, Passwortänderung)
ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version INT NOT NULL DEFAULT 0;
