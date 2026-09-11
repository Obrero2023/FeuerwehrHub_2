-- Intranet-Einträge für Links und Dateien
CREATE TABLE intranet_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    entry_type TEXT NOT NULL CHECK (entry_type IN ('link', 'file')),
    url TEXT,
    file_path TEXT,
    file_name TEXT,
    mime_type TEXT,
    file_size BIGINT,
    description TEXT,
    published_by UUID REFERENCES users(id) ON DELETE SET NULL,
    published_by_name TEXT,
    published_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_intranet_entries_published_at ON intranet_entries(published_at DESC);