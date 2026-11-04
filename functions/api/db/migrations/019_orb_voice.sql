-- Orb voice: messages that came from a spoken conversation (shown with a mic marker)

ALTER TABLE assistant_messages ADD COLUMN IF NOT EXISTS voice boolean NOT NULL DEFAULT false;
