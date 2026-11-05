-- A venue or security manager can be a client's contact; praise feedback remembers the website review made from it
ALTER TABLE users ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES clients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS users_client_idx ON users (client_id);
ALTER TABLE venue_comments ADD COLUMN IF NOT EXISTS review_id uuid REFERENCES reviews(id) ON DELETE SET NULL;
