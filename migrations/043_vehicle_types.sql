-- Dynamische Fahrzeugtypen (statt hardcoded)

CREATE TABLE vehicle_types (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    key         TEXT        NOT NULL UNIQUE,
    label       TEXT        NOT NULL,
    sort_order  INTEGER     NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Standard-Typen einfuegen
INSERT INTO vehicle_types (key, label, sort_order) VALUES
    ('lkw',        'LKW',        1),
    ('pkw',        'PKW',        2),
    ('anhaenger',  'Anhänger',   3),
    ('drohne',     'Drohne',     4),
    ('warnmittel', 'Warnmittel', 5),
    ('ktw',        'KTW',        6),
    ('mtf',        'MTF',        7),
    ('gw_san',     'GW-San',     8)
ON CONFLICT (key) DO NOTHING;

-- CHECK-Constraint auf vehicles.vehicle_type entfernen
ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS vehicles_vehicle_type_check;
