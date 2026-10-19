-- ===== Incident evidence (attachments + AI) and AI compliance runs =====
ALTER TABLE incident_attachments
  ADD COLUMN size_bytes int,
  ADD COLUMN removed_at timestamptz,
  ADD COLUMN removed_by uuid REFERENCES users(id);

ALTER TABLE incidents
  ADD COLUMN ai_assisted boolean NOT NULL DEFAULT false,
  ADD COLUMN ai_summary jsonb,            -- { captions:[{attachment_id,text}], summary, mismatches:[], missing:[] }
  ADD COLUMN ai_summary_sig text,         -- what the summary was built from; stale when it differs
  ADD COLUMN ai_summary_at timestamptz;

ALTER TABLE roles
  ADD COLUMN accepted_licences text[] NOT NULL DEFAULT '{}',
  ADD COLUMN required_docs text[] NOT NULL DEFAULT '{}';
UPDATE roles SET accepted_licences = '{"Door Supervisor"}' WHERE code = 'door';
UPDATE roles SET accepted_licences = '{"Security Guarding","Door Supervisor"}' WHERE code IN ('guard','supervisor');
UPDATE roles SET accepted_licences = '{"CCTV (Public Space Surveillance)"}' WHERE code = 'cctv';
UPDATE roles SET accepted_licences = '{"Close Protection"}' WHERE code = 'close';

ALTER TABLE documents
  ADD COLUMN ai_read jsonb,               -- { name, number, licence_type, expiry, readable, concerns[] }
  ADD COLUMN ai_read_key text,            -- s3_key that was read; re-read when the file changes
  ADD COLUMN ai_read_at timestamptz;

CREATE TABLE compliance_dismissals (
  officer_id uuid NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  issue_key text NOT NULL,
  sig text NOT NULL,                      -- the data the issue was raised on; a change re-raises it
  reason text DEFAULT '',
  dismissed_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (officer_id, issue_key)
);

ALTER TABLE ops_items DROP CONSTRAINT ops_items_kind_check;
ALTER TABLE ops_items ADD CONSTRAINT ops_items_kind_check CHECK (kind IN ('cover','venue_request','reconcile','feedback','compliance'));
CREATE INDEX ON ops_items (kind, officer_id) WHERE status = 'pending';

ALTER TABLE settings ADD COLUMN ops_compliance_dow int NOT NULL DEFAULT 1;
