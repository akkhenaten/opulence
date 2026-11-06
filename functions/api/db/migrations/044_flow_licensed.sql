-- The Emergency flowchart quotes ProtectUK and citizenAID word for word: until the platform admin records both permissions it stays platform admin only
ALTER TABLE settings ADD COLUMN IF NOT EXISTS flow_licensed boolean NOT NULL DEFAULT false;
