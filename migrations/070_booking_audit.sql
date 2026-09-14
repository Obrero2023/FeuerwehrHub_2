-- Buchungs-Auditing: wer hat gebucht, wer hat Status wann geändert
ALTER TABLE vehicle_bookings
    ADD COLUMN status_changed_by UUID REFERENCES users(id),
    ADD COLUMN status_changed_at TIMESTAMPTZ;

-- Sichtbarkeit: wer hat gebucht (user_id existiert bereits)
-- Status-Spalten: gebucht = gelb, bestaetigt = grün, abgesagt = rot