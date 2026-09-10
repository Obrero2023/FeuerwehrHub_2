-- Verknüpfung von Geräten mit Inspektionsprotokoll-Items
ALTER TABLE vehicle_inspection_protocol_items
ADD COLUMN IF NOT EXISTS equipment_id UUID REFERENCES vehicle_equipment(id) ON DELETE SET NULL;