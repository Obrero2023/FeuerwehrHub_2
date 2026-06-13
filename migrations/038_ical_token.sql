-- iCal-Feed-Token: Ermöglicht Kalender-Apps den Zugriff auf Termine ohne Login
ALTER TABLE users ADD COLUMN IF NOT EXISTS ical_token UUID UNIQUE;
