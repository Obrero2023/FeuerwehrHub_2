-- Migration 055: Einsatzzeiten pro Kraft (Personalwechsel bei längeren Einsätzen)

ALTER TABLE incident_personnel
    ADD COLUMN entry_time TIME,
    ADD COLUMN exit_time  TIME;
