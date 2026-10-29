-- Migration 103: member_details um Einheit, Gruppe und Dienstgrad erweitern
--
-- einheit: Auswahlliste aus gruppen (Name)
-- gruppe_id: FK auf gruppen
-- dienstgrad_id: FK auf roles (type = 'dienstgrad')

ALTER TABLE member_details ADD COLUMN IF NOT EXISTS einheit TEXT;
ALTER TABLE member_details ADD COLUMN IF NOT EXISTS gruppe_id UUID REFERENCES gruppen(id) ON DELETE SET NULL;
ALTER TABLE member_details ADD COLUMN IF NOT EXISTS dienstgrad_id UUID REFERENCES roles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_member_details_gruppe ON member_details(gruppe_id);
CREATE INDEX IF NOT EXISTS idx_member_details_dienstgrad ON member_details(dienstgrad_id);