-- Venue packs: assignment instructions and procedures that officers read and sign before working a venue

CREATE TABLE IF NOT EXISTS procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'procedure' CHECK (kind IN ('instructions','procedure')),
  scope text NOT NULL DEFAULT 'general' CHECK (scope IN ('general','venue')),
  venue_id uuid REFERENCES venues(id) ON DELETE CASCADE,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  applies_all boolean NOT NULL DEFAULT true,     -- general only: every venue, unless switched off there
  current_version int NOT NULL DEFAULT 0,        -- 0 = never published
  draft_body text,                               -- unpublished wording; null when nothing is waiting
  ai_drafted boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((scope = 'venue') = (venue_id IS NOT NULL)),
  CHECK (kind = 'procedure' OR scope = 'venue')
);
CREATE UNIQUE INDEX IF NOT EXISTS procedures_one_instructions ON procedures (venue_id) WHERE kind = 'instructions';
CREATE INDEX IF NOT EXISTS procedures_venue_idx ON procedures (venue_id);

-- Every published wording is kept, exactly as officers signed it
CREATE TABLE IF NOT EXISTS procedure_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id uuid NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
  version int NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  requires_resign boolean NOT NULL DEFAULT true,
  note text DEFAULT '',
  published_by uuid REFERENCES users(id) ON DELETE SET NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (procedure_id, version)
);

-- Per venue: order in the pack, a general procedure added to a chosen venue, or switched off at one
CREATE TABLE IF NOT EXISTS procedure_venues (
  procedure_id uuid NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  excluded boolean NOT NULL DEFAULT false,
  position int NOT NULL DEFAULT 1000,
  PRIMARY KEY (procedure_id, venue_id)
);
CREATE INDEX IF NOT EXISTS procedure_venues_venue_idx ON procedure_venues (venue_id);

-- One row per signing: the documents and versions in the pack at that moment
CREATE TABLE IF NOT EXISTS pack_signings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  items jsonb NOT NULL DEFAULT '[]',             -- [{procedure_id, version, title, read_at, reread}]
  signature text NOT NULL,
  signed_name text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  signed_ip text,
  signed_ua text,
  reference text UNIQUE,
  status text NOT NULL DEFAULT 'signed',
  fingerprint text,
  pdf_sha256 text,
  pdf_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  sealed_at timestamptz
);
CREATE INDEX IF NOT EXISTS pack_signings_officer_venue_idx ON pack_signings (officer_id, venue_id, signed_at DESC);
CREATE INDEX IF NOT EXISTS pack_signings_venue_idx ON pack_signings (venue_id, signed_at DESC);

-- Reading progress, so an officer can stop and carry on later
CREATE TABLE IF NOT EXISTS pack_reads (
  officer_id uuid NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  procedure_id uuid NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
  version int NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (officer_id, procedure_id, version)
);

-- Client (and manager) suggestions on a document
CREATE TABLE IF NOT EXISTS procedure_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  procedure_id uuid NOT NULL REFERENCES procedures(id) ON DELETE CASCADE,
  venue_id uuid REFERENCES venues(id) ON DELETE CASCADE,
  section text DEFAULT '',
  body text NOT NULL,
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','accepted','dismissed')),
  reply text DEFAULT '',
  resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS procedure_suggestions_proc_idx ON procedure_suggestions (procedure_id, status);

-- Each pack reminder goes once per booking
CREATE TABLE IF NOT EXISTS pack_reminders (
  assignment_id uuid NOT NULL REFERENCES shift_assignments(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('booked','day','2h')),
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (assignment_id, kind)
);

-- The signing timeline now covers venue packs
ALTER TABLE sign_events DROP CONSTRAINT IF EXISTS sign_events_doc_type_check;
ALTER TABLE sign_events ADD CONSTRAINT sign_events_doc_type_check CHECK (doc_type IN ('contract','pay_agreement','venue_pack'));

-- AI drafting has its own monthly cap (about 40 venue drafts)
UPDATE settings SET ai_module_caps = COALESCE(ai_module_caps, '{}'::jsonb) || '{"venue_packs": 400000}'::jsonb
 WHERE id = 1 AND NOT (COALESCE(ai_module_caps, '{}'::jsonb) ? 'venue_packs');

-- Existing free-text instructions become each venue's starting draft
INSERT INTO procedures (kind, scope, venue_id, title, status, draft_body)
SELECT 'instructions', 'venue', v.id, 'Assignment instructions', 'draft',
       '# Assignment instructions' || E'\n\n' || trim(v.instructions)
  FROM venues v
 WHERE trim(COALESCE(v.instructions, '')) <> ''
ON CONFLICT DO NOTHING;
