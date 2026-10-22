-- Outside training certificates (first aid, CCTV, other courses) carry a provider and an issue date
ALTER TABLE documents ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS issued_on date;
CREATE INDEX IF NOT EXISTS documents_expiry_idx ON documents (expiry) WHERE owner_type = 'officer' AND expiry IS NOT NULL;
