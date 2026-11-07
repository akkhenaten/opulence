-- When a login's invite was last emailed, and whether the mail service took it (null: never emailed, or before this was kept)
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_sent_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS invite_emailed boolean;
