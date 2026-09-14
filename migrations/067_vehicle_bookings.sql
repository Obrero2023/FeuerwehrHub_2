-- Vehicle booking table
CREATE TABLE vehicle_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    booking_date DATE NOT NULL,
    time_from TIME NOT NULL,
    time_to TIME NOT NULL,
    reason TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'buchung' CHECK (status IN ('buchung','bestaetigt','abgesagt')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_vehicle_bookings_vehicle_date ON vehicle_bookings(vehicle_id, booking_date);
CREATE INDEX idx_vehicle_bookings_user_date ON vehicle_bookings(user_id, booking_date);
CREATE INDEX idx_vehicle_bookings_status ON vehicle_bookings(status);