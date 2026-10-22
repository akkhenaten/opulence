-- Pay runs with officer review, disputes, saved PDFs and the Ask Orb assistant
CREATE TABLE IF NOT EXISTS pay_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start date NOT NULL,
  period_end date NOT NULL,
  run_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_review','reconciled','issued','paid')),
  review_deadline timestamptz,
  reminded_at timestamptz,
  created_by uuid REFERENCES users(id),
  created_via text NOT NULL DEFAULT 'user' CHECK (created_via IN ('user','ai')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pay_runs_period_idx ON pay_runs (period_start DESC);

ALTER TABLE documents ADD COLUMN IF NOT EXISTS system boolean NOT NULL DEFAULT false;

ALTER TABLE statements
  ADD COLUMN IF NOT EXISTS pay_run_id uuid REFERENCES pay_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS review_status text CHECK (review_status IN ('pending','approved','disputed','no_response','resolved')),
  ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS held boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pdf_document_id uuid REFERENCES documents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS statements_run_idx ON statements (pay_run_id);

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS pay_run_id uuid REFERENCES pay_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pdf_document_id uuid REFERENCES documents(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS statement_disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id uuid NOT NULL REFERENCES statements(id) ON DELETE CASCADE,
  line_id uuid REFERENCES statement_lines(id) ON DELETE SET NULL,
  line_description text NOT NULL DEFAULT '',
  comment text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  resolution text,
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  raised_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS statement_disputes_st_idx ON statement_disputes (statement_id);

CREATE TABLE IF NOT EXISTS assistant_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'New chat',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assistant_conversations_user_idx ON assistant_conversations (user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS assistant_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES assistant_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content jsonb NOT NULL,                 -- { text, items[] } shown in the chat
  history jsonb,                          -- raw model turns for this exchange (tool calls and results)
  pending_action jsonb,                   -- { action, body, summary } waiting for Confirm
  action_status text CHECK (action_status IN ('pending','confirmed','cancelled','failed')),
  action_result jsonb,
  credits numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assistant_messages_conv_idx ON assistant_messages (conversation_id, created_at);

-- Backfill: one pay run per existing statement period; issued statements count as approved
INSERT INTO pay_runs (period_start, period_end, run_date, status, created_at)
SELECT period_start, period_end, min(created_at)::date,
       CASE WHEN bool_and(status = 'paid') THEN 'paid' WHEN bool_and(status <> 'draft') THEN 'issued' ELSE 'draft' END,
       min(created_at)
  FROM statements WHERE pay_run_id IS NULL GROUP BY period_start, period_end;

UPDATE statements st SET pay_run_id = r.id
  FROM pay_runs r WHERE st.pay_run_id IS NULL AND r.period_start = st.period_start AND r.period_end = st.period_end;

UPDATE statements SET review_status = 'approved', reviewed_at = COALESCE(issued_at, created_at)
 WHERE review_status IS NULL AND status <> 'draft';

UPDATE invoices i SET pay_run_id = r.id
  FROM pay_runs r WHERE i.pay_run_id IS NULL AND i.kind = 'invoice' AND r.period_start = i.period_start AND r.period_end = i.period_end;
