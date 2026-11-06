-- Managers send instructions to the team on a shift; each officer taps Got it, which is recorded as a read
ALTER TABLE shift_log_entries DROP CONSTRAINT IF EXISTS shift_log_entries_kind_check;
ALTER TABLE shift_log_entries ADD CONSTRAINT shift_log_entries_kind_check
  CHECK (kind IN ('note','handover','incident','ban','ejection','instruction'));
-- Null means the whole team on the shift
ALTER TABLE shift_log_entries ADD COLUMN IF NOT EXISTS to_user_id uuid REFERENCES users(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS shift_instruction_reads (
  entry_id uuid NOT NULL REFERENCES shift_log_entries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entry_id, user_id)
);
-- When the shift notes last changed after the shift started (shown on the officer's card)
ALTER TABLE shifts ADD COLUMN IF NOT EXISTS notes_updated_at timestamptz;
