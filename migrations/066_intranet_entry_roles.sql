-- Rollenbasierte Sichtbarkeit für Intranet-Einträge
CREATE TABLE intranet_entry_roles (
    entry_id UUID NOT NULL REFERENCES intranet_entries(id) ON DELETE CASCADE,
    role_id  UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (entry_id, role_id)
);

CREATE INDEX idx_intranet_entry_roles_role ON intranet_entry_roles(role_id);
