-- The right to work check itself: when it was done on GOV.UK (or by hand), by whom, and the saved check page
ALTER TABLE officers ADD COLUMN IF NOT EXISTS rtw_checked_at timestamptz;
ALTER TABLE officers ADD COLUMN IF NOT EXISTS rtw_checked_by uuid REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE officers ADD COLUMN IF NOT EXISTS rtw_method text NOT NULL DEFAULT '';
ALTER TABLE officers ADD COLUMN IF NOT EXISTS rtw_check_doc uuid REFERENCES documents(id) ON DELETE SET NULL;
