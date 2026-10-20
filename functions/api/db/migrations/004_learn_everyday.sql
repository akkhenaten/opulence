-- ===== Academy (training + quizzes), Toolbox (guidance cards), Everyday (staff feed) =====
ALTER TABLE settings
  ADD COLUMN modules jsonb NOT NULL DEFAULT '{"academy":true,"toolbox":true,"everyday":true}',
  ADD COLUMN ai_module_caps jsonb NOT NULL DEFAULT '{}';   -- { academy: credits/month, ... }; missing = overall cap only

CREATE TABLE ai_usage (
  month text NOT NULL,
  module text NOT NULL,
  credits numeric NOT NULL DEFAULT 0,
  PRIMARY KEY (month, module)
);

ALTER TABLE users
  ADD COLUMN notify_prefs jsonb NOT NULL DEFAULT '{}',     -- { mention:false, ... }; missing key = on
  ADD COLUMN feed_seen_at timestamptz,
  ADD COLUMN feed_rules_at timestamptz;

CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint text UNIQUE NOT NULL,
  keys jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Server-only values (web push signing keys); never returned by an action
CREATE TABLE app_secrets (name text PRIMARY KEY, value text NOT NULL);

-- ----- Academy -----
CREATE TABLE courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  topic text NOT NULL DEFAULT 'operations',               -- law | operations | first_aid
  summary text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  pass_mark int NOT NULL DEFAULT 80,
  quiz_size int NOT NULL DEFAULT 10,
  cooldown_hours int NOT NULL DEFAULT 24,
  mandatory boolean NOT NULL DEFAULT false,
  renew_months int,
  sources jsonb NOT NULL DEFAULT '[]',
  review_by date,
  version int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES users(id),
  published_by uuid REFERENCES users(id),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE course_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  title text NOT NULL,
  body text NOT NULL DEFAULT '',
  quick_check jsonb                                          -- { prompt, options[], answer, explain }
);
CREATE INDEX course_sections_course ON course_sections(course_id, position);

CREATE TABLE course_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  section_id uuid REFERENCES course_sections(id) ON DELETE SET NULL,
  kind text NOT NULL DEFAULT 'mcq' CHECK (kind IN ('mcq','scenario')),
  prompt text NOT NULL,
  options jsonb NOT NULL,
  answer int NOT NULL,
  explain text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true
);
CREATE INDEX course_questions_course ON course_questions(course_id);

CREATE TABLE course_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  officer_id uuid NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  due_date date,
  assigned_by uuid REFERENCES users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, officer_id)
);
CREATE INDEX course_assignments_officer ON course_assignments(officer_id);

CREATE TABLE course_progress (
  officer_id uuid NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  done_sections uuid[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (officer_id, course_id)
);

CREATE TABLE quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_id uuid NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  course_version int NOT NULL DEFAULT 0,
  question_ids uuid[] NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}',                    -- { question_id: choice }
  score int,
  passed boolean,
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz
);
CREATE INDEX quiz_attempts_officer ON quiz_attempts(officer_id, course_id);

CREATE SEQUENCE certificate_ref START 1001;
CREATE TABLE certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ref text UNIQUE NOT NULL DEFAULT ('ORB-TR-' || nextval('certificate_ref')),
  officer_id uuid NOT NULL REFERENCES officers(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  attempt_id uuid REFERENCES quiz_attempts(id),
  score int NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at date
);
CREATE INDEX certificates_officer ON certificates(officer_id, course_id);

-- ----- Toolbox -----
CREATE TABLE toolbox_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL DEFAULT 'situations' CHECK (category IN ('first_aid','situations','law','venue')),
  title text NOT NULL,
  summary text NOT NULL DEFAULT '',
  steps jsonb NOT NULL DEFAULT '[]',
  dont jsonb NOT NULL DEFAULT '[]',
  law text NOT NULL DEFAULT '',
  report_tips text NOT NULL DEFAULT '',
  escalate text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  venue_id uuid REFERENCES venues(id) ON DELETE CASCADE,
  course_id uuid REFERENCES courses(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','archived')),
  sources jsonb NOT NULL DEFAULT '[]',
  review_by date,
  version int NOT NULL DEFAULT 0,
  updated_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE toolbox_favourites (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id uuid NOT NULL REFERENCES toolbox_cards(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, card_id)
);

-- ----- Everyday -----
CREATE TABLE posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  photos jsonb NOT NULL DEFAULT '[]',                     -- [{ key }]
  mentions uuid[] NOT NULL DEFAULT '{}',
  pinned_at timestamptz,
  edited_at timestamptz,
  hidden_at timestamptz,
  hidden_by uuid REFERENCES users(id),
  hidden_reason text,
  deleted_at timestamptz,
  ai_check jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX posts_created ON posts(created_at DESC);

CREATE TABLE post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES post_comments(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL,
  mentions uuid[] NOT NULL DEFAULT '{}',
  edited_at timestamptz,
  hidden_at timestamptz,
  hidden_by uuid REFERENCES users(id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX post_comments_post ON post_comments(post_id, created_at);

CREATE TABLE reactions (
  target_type text NOT NULL CHECK (target_type IN ('post','comment')),
  target_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('like','love','laugh','wow','sad','clap')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (target_type, target_id, user_id)
);

CREATE TABLE feed_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL CHECK (target_type IN ('post','comment')),
  target_id uuid NOT NULL,
  reporter_id uuid REFERENCES users(id) ON DELETE SET NULL,   -- NULL = flagged by Orb AI
  reason text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE feed_mutes (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  until timestamptz NOT NULL,
  reason text DEFAULT '',
  by uuid REFERENCES users(id)
);

CREATE TABLE feed_checks (hash text PRIMARY KEY, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
