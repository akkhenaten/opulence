-- The password an officer sets on the staff form, kept only as a hash until the office makes them live
ALTER TABLE staff_setup_submissions ADD COLUMN IF NOT EXISTS password_hash text;
