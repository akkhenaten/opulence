-- E-signature documents: template categories and versions, company countersignature, sealing, signing timeline

ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'contract';
DO $$ BEGIN
  ALTER TABLE contract_templates ADD CONSTRAINT contract_templates_category_check CHECK (category IN ('contract','policy','pay_rise'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS version int NOT NULL DEFAULT 1;
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS system boolean NOT NULL DEFAULT false;
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS updated_by uuid REFERENCES users(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS contract_template_versions (
  template_id uuid NOT NULL REFERENCES contract_templates(id) ON DELETE CASCADE,
  version int NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (template_id, version)
);

-- The pay-rise wording, editable but never deleted
INSERT INTO contract_templates (title, body, category, system)
SELECT 'Pay rise agreement',
'{{company}} agrees to pay {{officer}} {{rate}} per hour for {{role}} work at {{venue}} from {{start_date}}{{conditions}}.

The new rate replaces the current rate of {{current_rate}} per hour for this work. All other terms of the existing agreement stay the same.', 'pay_rise', true
WHERE NOT EXISTS (SELECT 1 FROM contract_templates WHERE category = 'pay_rise');

INSERT INTO contract_template_versions (template_id, version, title, body, created_at)
SELECT id, version, title, body, created_at FROM contract_templates ON CONFLICT DO NOTHING;

-- Shared signing columns
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS reference text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'contract';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS template_version int;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS superseded_by uuid REFERENCES contracts(id) ON DELETE SET NULL;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS superseded_at timestamptz;
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_status_check;
ALTER TABLE contracts ADD CONSTRAINT contracts_status_check CHECK (status IN ('sent','signed','void','superseded'));

DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['contracts','pay_agreements'] LOOP
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS reference text', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS signatory_user_id uuid REFERENCES users(id) ON DELETE SET NULL', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS company_name_signed text', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS company_title_signed text', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS company_signature text', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS company_signed_at timestamptz', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS signed_ua text', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS opened_at timestamptz', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS fingerprint text', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS pdf_sha256 text', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS pdf_document_id uuid REFERENCES documents(id) ON DELETE SET NULL', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS sealed_at timestamptz', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS reminders int NOT NULL DEFAULT 0', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz', t);
    EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS sent_at timestamptz', t);
  END LOOP;
END $$;

-- Pay rises keep the wording they were sent with
ALTER TABLE pay_agreements ADD COLUMN IF NOT EXISTS body text;
ALTER TABLE pay_agreements ADD COLUMN IF NOT EXISTS template_version int;

UPDATE contracts SET sent_at = created_at WHERE sent_at IS NULL;
UPDATE pay_agreements SET sent_at = updated_at WHERE sent_at IS NULL AND status <> 'draft';

-- Reference numbers: ORB-C (contract), ORB-P (policy), ORB-R (pay rise), year, running number
CREATE SEQUENCE IF NOT EXISTS esign_ref_seq;
UPDATE contracts SET reference = 'ORB-C-' || to_char(created_at, 'YYYY') || '-' || lpad(nextval('esign_ref_seq')::text, 4, '0') WHERE reference IS NULL;
UPDATE pay_agreements SET reference = 'ORB-R-' || to_char(created_at, 'YYYY') || '-' || lpad(nextval('esign_ref_seq')::text, 4, '0') WHERE reference IS NULL AND status <> 'draft';
CREATE UNIQUE INDEX IF NOT EXISTS contracts_reference_idx ON contracts (reference);
CREATE UNIQUE INDEX IF NOT EXISTS pay_agreements_reference_idx ON pay_agreements (reference);

-- The signing timeline shown on the certificate
CREATE TABLE IF NOT EXISTS sign_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type text NOT NULL CHECK (doc_type IN ('contract','pay_agreement')),
  doc_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('sent','emailed','opened','signed','sealed','reminded','voided','superseded')),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_name text,
  ip text,
  ua text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sign_events_doc_idx ON sign_events (doc_type, doc_id, at);

INSERT INTO sign_events (doc_type, doc_id, kind, at) SELECT 'contract', id, 'sent', created_at FROM contracts;
INSERT INTO sign_events (doc_type, doc_id, kind, actor_name, ip, at)
  SELECT 'contract', id, 'signed', signed_name, signed_ip, signed_at FROM contracts WHERE signed_at IS NOT NULL;
INSERT INTO sign_events (doc_type, doc_id, kind, at) SELECT 'pay_agreement', id, 'sent', sent_at FROM pay_agreements WHERE sent_at IS NOT NULL;
INSERT INTO sign_events (doc_type, doc_id, kind, actor_name, ip, at)
  SELECT 'pay_agreement', id, 'signed', signed_name, signed_ip, signed_at FROM pay_agreements WHERE signed_at IS NOT NULL;

-- A manager's saved signature, applied for the company when documents are sent
CREATE TABLE IF NOT EXISTS user_signatures (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  title text NOT NULL DEFAULT '',
  png text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE settings ADD COLUMN IF NOT EXISTS default_signatory_id uuid REFERENCES users(id) ON DELETE SET NULL;
