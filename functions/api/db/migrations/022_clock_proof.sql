-- Stronger clock-in proof: a registered phone (passkey), secure NFC tags at venues, selfies with an optional face check

-- One active phone per officer; a later phone waits for a manager
CREATE TABLE IF NOT EXISTS officer_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  credential_id text UNIQUE NOT NULL,
  public_key bytea NOT NULL,
  alg integer NOT NULL,
  sign_count bigint NOT NULL DEFAULT 0,
  label text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending','rejected','revoked','replaced')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  decided_by uuid REFERENCES users(id) ON DELETE SET NULL,
  decided_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS officer_devices_one_active ON officer_devices (officer_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS officer_devices_pending ON officer_devices (status) WHERE status = 'pending';

-- Single-use WebAuthn challenges
CREATE TABLE IF NOT EXISTS passkey_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN ('register','clock')),
  challenge text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);

-- Secure NFC tags (NTAG 424 DNA, a fresh code on every tap)
CREATE TABLE IF NOT EXISTS venue_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  uid text UNIQUE NOT NULL,
  label text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused')),
  last_counter integer NOT NULL DEFAULT -1,
  last_tap_at timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS venue_tags_venue ON venue_tags (venue_id);
ALTER TABLE venues ADD COLUMN IF NOT EXISTS tag_pairing_until timestamptz;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS tag_pairing_by uuid REFERENCES users(id) ON DELETE SET NULL;

-- A verified tap, spent by one clock-in within 10 minutes
CREATE TABLE IF NOT EXISTS tag_taps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id uuid NOT NULL REFERENCES venue_tags(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  counter integer NOT NULL,
  tapped_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_by_event uuid
);

ALTER TABLE venues ADD COLUMN IF NOT EXISTS proof_rule text NOT NULL DEFAULT 'two_of_three'
  CHECK (proof_rule IN ('any_one','two_of_three','all_three'));

ALTER TABLE officers ADD COLUMN IF NOT EXISTS face_consent text CHECK (face_consent IN ('given','declined'));
ALTER TABLE officers ADD COLUMN IF NOT EXISTS face_consent_at timestamptz;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS face_match_enabled boolean NOT NULL DEFAULT true;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS nfc_meta_key text;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS nfc_file_key text;
UPDATE settings SET ai_module_caps = COALESCE(ai_module_caps, '{}'::jsonb) || '{"clock_face": 100000}'::jsonb
 WHERE id = 1 AND NOT (COALESCE(ai_module_caps, '{}'::jsonb) ? 'clock_face');

ALTER TABLE clock_events ADD COLUMN IF NOT EXISTS device_ok boolean;
ALTER TABLE clock_events ADD COLUMN IF NOT EXISTS device_id uuid REFERENCES officer_devices(id) ON DELETE SET NULL;
ALTER TABLE clock_events ADD COLUMN IF NOT EXISTS venue_code text CHECK (venue_code IN ('qr','nfc'));
ALTER TABLE clock_events ADD COLUMN IF NOT EXISTS tag_id uuid REFERENCES venue_tags(id) ON DELETE SET NULL;
ALTER TABLE clock_events ADD COLUMN IF NOT EXISTS selfie_key text;
ALTER TABLE clock_events ADD COLUMN IF NOT EXISTS selfie_deleted_at timestamptz;
ALTER TABLE clock_events ADD COLUMN IF NOT EXISTS face_result text CHECK (face_result IN ('match','unsure','no_match','unscored'));
ALTER TABLE clock_events ADD COLUMN IF NOT EXISTS face_note text;
ALTER TABLE clock_events ADD COLUMN IF NOT EXISTS proof_rule text;
ALTER TABLE clock_events ADD COLUMN IF NOT EXISTS flags text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS clock_events_selfie ON clock_events (ts) WHERE selfie_key IS NOT NULL;
