-- The Emergency flowchart is live for everyone on every shift card (owner's decision, 6 Nov 2026); the platform admin can take it back offline
ALTER TABLE settings ADD COLUMN IF NOT EXISTS flow_live boolean NOT NULL DEFAULT true;
