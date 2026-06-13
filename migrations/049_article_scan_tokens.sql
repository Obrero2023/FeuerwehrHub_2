ALTER TABLE article_instances
ADD COLUMN scan_token UUID NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX idx_article_instances_scan_token ON article_instances(scan_token);
