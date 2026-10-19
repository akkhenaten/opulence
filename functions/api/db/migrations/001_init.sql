-- Orb Security — initial schema

CREATE TABLE settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  company_name text NOT NULL DEFAULT 'Orb Security Ltd',
  company_address text DEFAULT '',
  company_email text DEFAULT '',
  company_phone text DEFAULT '',
  vat_number text DEFAULT '',
  vat_rate numeric(5,2) NOT NULL DEFAULT 20,
  company_number text DEFAULT '',
  bank_name text DEFAULT '',
  bank_sort_code text DEFAULT '',
  bank_account text DEFAULT '',
  invoice_prefix text NOT NULL DEFAULT 'ORB-',
  invoice_seq int NOT NULL DEFAULT 1000,
  invoice_cycle text NOT NULL DEFAULT 'weekly',         -- weekly | monthly
  payment_terms_days int NOT NULL DEFAULT 14,
  pay_period text NOT NULL DEFAULT 'weekly',            -- weekly | fortnightly | monthly
  grace_minutes int NOT NULL DEFAULT 10,
  auto_signoff_days int NOT NULL DEFAULT 3,
  rounding_minutes int NOT NULL DEFAULT 15,
  night_start int NOT NULL DEFAULT 22,                  -- hour, Europe/London
  night_end int NOT NULL DEFAULT 6,
  pay_night_uplift numeric(6,2) NOT NULL DEFAULT 0,
  pay_weekend_uplift numeric(6,2) NOT NULL DEFAULT 0,
  pay_bh_uplift numeric(6,2) NOT NULL DEFAULT 50,
  gps_tolerance_m int NOT NULL DEFAULT 50,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO settings (id) VALUES (1);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  phone text DEFAULT '',
  role text NOT NULL CHECK (role IN ('company','security','venue','officer')),
  password_hash text,
  status text NOT NULL DEFAULT 'invited' CHECK (status IN ('invited','active','disabled')),
  invite_token text,
  reset_token text,
  reset_expires timestamptz,
  can_see_pay boolean NOT NULL DEFAULT false,
  last_login timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text,
  entity_id text,
  detail jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON audit_log (created_at DESC);

CREATE TABLE notifications (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text DEFAULT '',
  link text DEFAULT '',
  severity text NOT NULL DEFAULT 'info',
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON notifications (user_id, created_at DESC);
CREATE UNIQUE INDEX ON notifications (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE TABLE roles (
  code text PRIMARY KEY,
  name text NOT NULL,
  requires_sia boolean NOT NULL DEFAULT true
);
INSERT INTO roles VALUES
 ('door','Door Supervisor',true),
 ('guard','Security Guard',true),
 ('cctv','CCTV Operator',true),
 ('steward','Steward',false),
 ('supervisor','Site Supervisor',true),
 ('close','Close Protection',true);

-- ===== Venues =====
CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  billing_email text DEFAULT '',
  billing_address text DEFAULT '',
  vat_number text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  name text NOT NULL,
  address text DEFAULT '',
  postcode text DEFAULT '',
  lat double precision,
  lng double precision,
  radius_m int NOT NULL DEFAULT 150,
  qr_version int NOT NULL DEFAULT 1,
  phone text DEFAULT '',
  instructions text DEFAULT '',
  notes text DEFAULT '',
  photo_key text,
  invoice_cycle text,               -- override of settings
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE venue_contacts (
  venue_id uuid REFERENCES venues(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (venue_id, user_id)
);

CREATE TABLE security_venues (
  venue_id uuid REFERENCES venues(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (venue_id, user_id)
);

CREATE TABLE venue_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  role text NOT NULL REFERENCES roles(code),
  rate numeric(8,2) NOT NULL,
  night_uplift numeric(6,2) NOT NULL DEFAULT 0,
  weekend_uplift numeric(6,2) NOT NULL DEFAULT 0,
  bh_uplift numeric(6,2) NOT NULL DEFAULT 50,
  min_hours numeric(5,2) NOT NULL DEFAULT 4,
  effective_from date NOT NULL DEFAULT CURRENT_DATE
);
CREATE INDEX ON venue_rates (venue_id, role, effective_from DESC);

-- ===== Officers =====
CREATE TABLE officers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text DEFAULT '',
  phone text DEFAULT '',
  dob date,
  address text DEFAULT '',
  postcode text DEFAULT '',
  ni_number text DEFAULT '',
  utr text DEFAULT '',
  bank_name text DEFAULT '',
  bank_sort_code text DEFAULT '',
  bank_account text DEFAULT '',
  photo_key text,
  sia_number text DEFAULT '',
  sia_type text DEFAULT '',
  sia_expiry date,
  rtw_type text DEFAULT '',
  rtw_expiry date,                  -- null = indefinite (e.g. British citizen) when rtw_verified
  rtw_verified boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('applicant','onboarding','active','suspended','left')),
  roles text[] NOT NULL DEFAULT '{}',
  max_weekly_hours int NOT NULL DEFAULT 60,
  start_date date,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE emergency_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  name text NOT NULL,
  relationship text DEFAULT '',
  phone text DEFAULT ''
);

CREATE TABLE officer_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  role text NOT NULL REFERENCES roles(code),
  venue_id uuid REFERENCES venues(id) ON DELETE CASCADE,
  rate numeric(8,2) NOT NULL,
  effective_from date NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE venue_bans (
  officer_id uuid REFERENCES officers(id) ON DELETE CASCADE,
  venue_id uuid REFERENCES venues(id) ON DELETE CASCADE,
  reason text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (officer_id, venue_id)
);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text NOT NULL CHECK (owner_type IN ('officer','venue','company')),
  owner_id uuid,
  kind text NOT NULL,                -- sia | rtw | id | poa | training | first_aid | contract | assignment | risk | other
  title text NOT NULL,
  number text DEFAULT '',
  expiry date,
  s3_key text,
  mime text,
  verified_by uuid REFERENCES users(id),
  verified_at timestamptz,
  uploaded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON documents (owner_type, owner_id);

CREATE TABLE availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  weekday int NOT NULL CHECK (weekday BETWEEN 0 AND 6),   -- 0 = Monday
  available boolean NOT NULL DEFAULT true,
  from_time time,
  to_time time,
  UNIQUE (officer_id, weekday)
);

CREATE TABLE time_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('holiday','sick','unavailable','other')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','cancelled')),
  decided_by uuid REFERENCES users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE hr_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('note','commendation','warning','review','training','venue_feedback')),
  title text NOT NULL,
  body text DEFAULT '',
  level text DEFAULT '',           -- verbal | written | final (warnings), rating (reviews)
  visible_to_officer boolean NOT NULL DEFAULT false,
  author_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE onboarding_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  code text NOT NULL,
  title text NOT NULL,
  done boolean NOT NULL DEFAULT false,
  done_at timestamptz,
  sort int NOT NULL DEFAULT 0,
  UNIQUE (officer_id, code)
);

CREATE TABLE contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  template_id uuid REFERENCES contract_templates(id),
  title text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','signed','void')),
  signature text,                  -- data URL png
  signed_name text,
  signed_at timestamptz,
  signed_ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE offboarding (
  officer_id uuid PRIMARY KEY REFERENCES officers(id) ON DELETE CASCADE,
  leave_date date NOT NULL,
  reason text DEFAULT '',
  kit_returned boolean NOT NULL DEFAULT false,
  rehire_eligible boolean NOT NULL DEFAULT true,
  notes text DEFAULT '',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ===== Rota =====
CREATE TABLE bank_holidays (
  day date PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE cover_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  role text NOT NULL REFERENCES roles(code),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  headcount int NOT NULL DEFAULT 1,
  notes text DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  requested_by uuid REFERENCES users(id),
  decided_by uuid REFERENCES users(id),
  decline_reason text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  role text NOT NULL REFERENCES roles(code),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  break_minutes int NOT NULL DEFAULT 0,
  headcount int NOT NULL DEFAULT 1 CHECK (headcount > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','cancelled')),
  open boolean NOT NULL DEFAULT false,          -- officers may request
  cover_request_id uuid REFERENCES cover_requests(id) ON DELETE SET NULL,
  notes text DEFAULT '',
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_at > starts_at)
);
CREATE INDEX ON shifts (starts_at);
CREATE INDEX ON shifts (venue_id, starts_at);

CREATE TABLE shift_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shift_id uuid NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  officer_id uuid NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','accepted','declined','requested','rejected','cancelled')),
  responded_at timestamptz,
  late_alerted boolean NOT NULL DEFAULT false,
  reminded boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shift_id, officer_id)
);
CREATE INDEX ON shift_assignments (officer_id);

-- ===== Time =====
CREATE TABLE clock_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES shift_assignments(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('in','out','break_start','break_end')),
  ts timestamptz NOT NULL DEFAULT now(),
  lat double precision,
  lng double precision,
  accuracy double precision,
  distance_m double precision,
  qr_ok boolean NOT NULL DEFAULT false,
  geo_ok boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','exception','approved','rejected','manual')),
  exception_reason text DEFAULT '',
  decided_by uuid REFERENCES users(id),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON clock_events (assignment_id, ts);

CREATE TABLE timesheets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid UNIQUE NOT NULL REFERENCES shift_assignments(id) ON DELETE CASCADE,
  actual_start timestamptz,
  actual_end timestamptz,
  break_minutes int NOT NULL DEFAULT 0,
  hours numeric(6,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','signed','disputed')),
  flags text[] NOT NULL DEFAULT '{}',
  approved_by uuid REFERENCES users(id),
  approved_at timestamptz,
  signed_by uuid REFERENCES users(id),
  signed_at timestamptz,
  auto_signed boolean NOT NULL DEFAULT false,
  dispute_comment text DEFAULT '',
  resolution text DEFAULT '',
  statement_id uuid,
  invoice_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ===== Money =====
CREATE TABLE statements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES officers(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  number text,
  total numeric(10,2) NOT NULL DEFAULT 0,
  hours numeric(8,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','paid')),
  issued_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id uuid NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('hours','bonus','expense','deduction')),
  timesheet_id uuid REFERENCES timesheets(id) ON DELETE SET NULL,
  description text NOT NULL,
  work_date date,
  hours numeric(6,2),
  rate numeric(8,2),
  amount numeric(10,2) NOT NULL
);

CREATE TABLE invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id),
  kind text NOT NULL DEFAULT 'invoice' CHECK (kind IN ('invoice','credit')),
  credit_of uuid REFERENCES invoices(id),
  number text,
  period_start date,
  period_end date,
  net numeric(10,2) NOT NULL DEFAULT 0,
  vat_rate numeric(5,2) NOT NULL DEFAULT 20,
  vat numeric(10,2) NOT NULL DEFAULT 0,
  gross numeric(10,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','paid','overdue','void')),
  issue_date date,
  due_date date,
  paid_at timestamptz,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  timesheet_id uuid REFERENCES timesheets(id) ON DELETE SET NULL,
  description text NOT NULL,
  work_date date,
  hours numeric(6,2),
  rate numeric(8,2),
  amount numeric(10,2) NOT NULL,
  pay_cost numeric(10,2) NOT NULL DEFAULT 0
);

-- ===== Incidents =====
CREATE SEQUENCE incident_seq START 1001;
CREATE TABLE incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref text NOT NULL DEFAULT ('INC-' || nextval('incident_seq')),
  venue_id uuid NOT NULL REFERENCES venues(id),
  shift_id uuid REFERENCES shifts(id) ON DELETE SET NULL,
  officer_id uuid REFERENCES officers(id) ON DELETE SET NULL,
  reported_by uuid REFERENCES users(id),
  type text NOT NULL,
  severity text NOT NULL DEFAULT 'low' CHECK (severity IN ('low','medium','high','critical')),
  occurred_at timestamptz NOT NULL,
  location text DEFAULT '',
  description text NOT NULL,
  people_involved text DEFAULT '',
  injuries text DEFAULT '',
  actions_taken text DEFAULT '',
  force_used boolean NOT NULL DEFAULT false,
  force_justification text DEFAULT '',
  police_called boolean NOT NULL DEFAULT false,
  police_ref text DEFAULT '',
  ambulance_called boolean NOT NULL DEFAULT false,
  ambulance_ref text DEFAULT '',
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','changes_requested','closed')),
  review_comment text DEFAULT '',
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  version int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON incidents (venue_id, occurred_at DESC);

CREATE TABLE incident_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  version int NOT NULL,
  data jsonb NOT NULL,
  edited_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE incident_witnesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact text DEFAULT '',
  statement text DEFAULT ''
);

CREATE TABLE incident_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  s3_key text NOT NULL,
  mime text,
  name text DEFAULT '',
  uploaded_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- England & Wales bank holidays
INSERT INTO bank_holidays VALUES
 ('2026-01-01','New Year''s Day'),('2026-04-03','Good Friday'),('2026-04-06','Easter Monday'),
 ('2026-05-04','Early May bank holiday'),('2026-05-25','Spring bank holiday'),('2026-08-31','Summer bank holiday'),
 ('2026-12-25','Christmas Day'),('2026-12-28','Boxing Day (substitute)'),
 ('2027-01-01','New Year''s Day'),('2027-03-26','Good Friday'),('2027-03-29','Easter Monday'),
 ('2027-05-03','Early May bank holiday'),('2027-05-31','Spring bank holiday'),('2027-08-30','Summer bank holiday'),
 ('2027-12-27','Christmas Day (substitute)'),('2027-12-28','Boxing Day (substitute)');

INSERT INTO contract_templates (title, body) VALUES ('Self-Employed Contractor Agreement',
'This agreement is between {{company}} ("the Company") and {{officer}} ("the Contractor").

1. Status. The Contractor is self-employed and is responsible for their own tax and National Insurance (UTR: {{utr}}). Nothing in this agreement creates employment.

2. Services. The Contractor will provide security services at venues as offered and accepted through the Orb Security platform. The Contractor may decline any shift.

3. Licensing. The Contractor must hold a valid SIA licence appropriate to the role and must inform the Company immediately of any change, suspension or revocation.

4. Conduct. The Contractor will follow venue assignment instructions, act lawfully and proportionately, and complete an incident report for every incident.

5. Payment. The Company will pay the agreed hourly rate for approved hours, per pay period, against a remittance statement.

6. Confidentiality and data. The Contractor will keep venue and customer information confidential and handle personal data in line with UK GDPR.

7. Termination. Either party may end this agreement at any time by written notice.');
