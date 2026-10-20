-- Company defaults for optional alerts; a person's own choice in users.notify_prefs wins
ALTER TABLE settings ADD COLUMN IF NOT EXISTS notify_defaults jsonb NOT NULL DEFAULT '{}';
