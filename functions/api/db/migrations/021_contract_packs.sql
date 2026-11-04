-- Contracts module: contract packs and a versioned clause library with content states, drafts built with the AI workspace,
-- uploaded contracts, outside signers by email link, variations, and the engagement type on officer profiles

-- Clause library. A clause is a stable identity; its wording lives in versions per jurisdiction ('all' = shared wording)
CREATE TABLE IF NOT EXISTS clauses (
  id text PRIMARY KEY,
  subject text NOT NULL DEFAULT '',
  title text NOT NULL,
  group_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS legal_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reviewer_name text NOT NULL,
  firm text NOT NULL DEFAULT '',
  reviewed_on date NOT NULL,
  jurisdiction text NOT NULL CHECK (jurisdiction IN ('ew','sc','ni','all')),
  scope_note text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  letter_document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS clause_versions (
  clause_id text NOT NULL REFERENCES clauses(id) ON DELETE CASCADE,
  jurisdiction text NOT NULL CHECK (jurisdiction IN ('all','ew','sc','ni')),
  version int NOT NULL,
  body text NOT NULL,
  origin text NOT NULL DEFAULT 'seed' CHECK (origin IN ('seed','company','ai')),
  bespoke boolean NOT NULL DEFAULT false,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','company','legal')),
  sources jsonb NOT NULL DEFAULT '[]',
  checked_on date,
  seed_hash text,
  approved_by uuid REFERENCES users(id) ON DELETE SET NULL,
  approved_by_name text,
  approved_at timestamptz,
  legal_review_id uuid REFERENCES legal_reviews(id) ON DELETE SET NULL,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clause_id, jurisdiction, version)
);

-- The version new drafts use; a changed seed adds a version and the company chooses whether to adopt it
CREATE TABLE IF NOT EXISTS clause_current (
  clause_id text NOT NULL REFERENCES clauses(id) ON DELETE CASCADE,
  jurisdiction text NOT NULL,
  version int NOT NULL,
  PRIMARY KEY (clause_id, jurisdiction)
);

CREATE TABLE IF NOT EXISTS legal_review_items (
  review_id uuid NOT NULL REFERENCES legal_reviews(id) ON DELETE CASCADE,
  clause_id text NOT NULL,
  jurisdiction text NOT NULL,
  version int NOT NULL,
  PRIMARY KEY (review_id, clause_id, jurisdiction, version)
);

CREATE TABLE IF NOT EXISTS law_items (
  id text PRIMARY KEY,
  jurisdictions text[] NOT NULL DEFAULT '{ew,sc,ni}',
  title text NOT NULL,
  url text NOT NULL DEFAULT '',
  status text NOT NULL CHECK (status IN ('in_force','announced','not_commenced')),
  effective_date date,
  checked_on date,
  summary text NOT NULL DEFAULT '',
  seed_hash text
);

-- Businesses that sign agreements without a login: labour providers, subcontractors, agencies, personal service companies
CREATE TABLE IF NOT EXISTS organisations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'other' CHECK (kind IN ('labour_provider','subcontractor','agency','psc','other')),
  name text NOT NULL,
  company_number text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  signatory_name text NOT NULL DEFAULT '',
  signatory_title text NOT NULL DEFAULT '',
  signatory_email text NOT NULL DEFAULT '',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contract_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pack_id text NOT NULL,
  jurisdiction text NOT NULL CHECK (jurisdiction IN ('ew','sc','ni')),
  pack_version int NOT NULL DEFAULT 1,
  officer_id uuid REFERENCES officers(id) ON DELETE CASCADE,
  organisation_id uuid REFERENCES organisations(id) ON DELETE CASCADE,
  title text NOT NULL,
  effective_date date,
  answers jsonb NOT NULL DEFAULT '{}',
  assessment jsonb NOT NULL DEFAULT '{}',
  selections jsonb NOT NULL DEFAULT '{}',
  bespoke jsonb NOT NULL DEFAULT '{}',
  acks jsonb NOT NULL DEFAULT '{}',
  chat jsonb NOT NULL DEFAULT '[]',
  amends_contract_id uuid,
  amend_kind text CHECK (amend_kind IN ('variation','replacement','extension')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent')),
  contract_id uuid,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((officer_id IS NULL) <> (organisation_id IS NULL))
);

-- Contracts: other parties, where the wording came from, what went into it, and the engagement it records
ALTER TABLE contracts ALTER COLUMN officer_id DROP NOT NULL;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS organisation_id uuid REFERENCES organisations(id) ON DELETE CASCADE;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'template';
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS pack_id text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS jurisdiction text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS engagement_type text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS draft_id uuid REFERENCES contract_drafts(id) ON DELETE SET NULL;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS manifest jsonb;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS particulars jsonb;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS findings jsonb;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS supporting jsonb;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS changes jsonb;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS upload_key text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS upload_sha256 text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS upload_pages int;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS ai_check jsonb;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS amends_id uuid REFERENCES contracts(id) ON DELETE SET NULL;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS amend_kind text;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS start_date date;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS end_date date;
ALTER TABLE contracts ADD COLUMN IF NOT EXISTS signer_kind text NOT NULL DEFAULT 'officer';
DO $$ BEGIN
  ALTER TABLE contracts ADD CONSTRAINT contracts_party_check CHECK ((officer_id IS NULL) <> (organisation_id IS NULL));
  ALTER TABLE contracts ADD CONSTRAINT contracts_source_check CHECK (source IN ('template','pack','upload','paper'));
  ALTER TABLE contracts ADD CONSTRAINT contracts_signer_kind_check CHECK (signer_kind IN ('officer','outside'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE contracts DROP CONSTRAINT IF EXISTS contracts_status_check;
ALTER TABLE contracts ADD CONSTRAINT contracts_status_check CHECK (status IN ('sent','signed','void','superseded','signed_paper'));
ALTER TABLE contract_drafts ADD CONSTRAINT contract_drafts_contract_fk FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL;
ALTER TABLE contract_drafts ADD CONSTRAINT contract_drafts_amends_fk FOREIGN KEY (amends_contract_id) REFERENCES contracts(id) ON DELETE SET NULL;

-- Uploaded PDFs kept as reusable templates
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS upload_key text;
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS upload_sha256 text;
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS upload_pages int;
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS state text NOT NULL DEFAULT 'draft';
ALTER TABLE contract_templates ADD COLUMN IF NOT EXISTS pack_id text;

-- Signing links for people without a login
CREATE TABLE IF NOT EXISTS sign_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  contract_id uuid NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  email text NOT NULL,
  name text NOT NULL DEFAULT '',
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  download_until timestamptz,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sign_links_contract_idx ON sign_links (contract_id);

ALTER TABLE sign_events DROP CONSTRAINT IF EXISTS sign_events_kind_check;
ALTER TABLE sign_events ADD CONSTRAINT sign_events_kind_check
  CHECK (kind IN ('sent','emailed','opened','signed','sealed','reminded','voided','superseded','link','filed'));

-- Engagement recorded from the latest signed contract (record only: pay and tax are unchanged)
ALTER TABLE officers ADD COLUMN IF NOT EXISTS engagement_type text;
ALTER TABLE officers ADD COLUMN IF NOT EXISTS engagement_contract_id uuid REFERENCES contracts(id) ON DELETE SET NULL;
ALTER TABLE officers ADD COLUMN IF NOT EXISTS contract_start date;
ALTER TABLE officers ADD COLUMN IF NOT EXISTS contract_end date;
ALTER TABLE officers ADD COLUMN IF NOT EXISTS fixed_term_renewals int NOT NULL DEFAULT 0;
ALTER TABLE officers ADD COLUMN IF NOT EXISTS engagement_agency text;
