-- Connected mailboxes (Gmail / Google Workspace, Outlook / Microsoft 365). Tokens are AES-GCM sealed (lib/mail/crypto.mjs);
-- message bodies are never stored, only a small per-thread cache for the inbox list and record pages.
CREATE TABLE IF NOT EXISTS email_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('google','microsoft')),
  address text NOT NULL,
  display_name text NOT NULL DEFAULT '',
  owner_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  shared boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  token_enc text NOT NULL,
  access_enc text,
  access_expires timestamptz,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected','reconnect','error')),
  last_error text,
  sync_cursor text,
  last_sync timestamptz,
  listed_at timestamptz,
  inbox_next text,
  signature text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (shared OR owner_user_id IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS email_accounts_address ON email_accounts (lower(address));
CREATE UNIQUE INDEX IF NOT EXISTS email_accounts_personal ON email_accounts (owner_user_id, provider) WHERE NOT shared;

CREATE TABLE IF NOT EXISTS email_account_access (
  account_id uuid REFERENCES email_accounts(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (account_id, user_id)
);

CREATE TABLE IF NOT EXISTS email_oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  verifier text NOT NULL,
  shared boolean NOT NULL DEFAULT false,
  account_id uuid REFERENCES email_accounts(id) ON DELETE CASCADE,
  redirect text NOT NULL,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS email_threads (
  account_id uuid REFERENCES email_accounts(id) ON DELETE CASCADE,
  thread_id text NOT NULL,
  subject text NOT NULL DEFAULT '',
  snippet text NOT NULL DEFAULT '',
  from_name text NOT NULL DEFAULT '',
  from_addr text NOT NULL DEFAULT '',
  addrs text[] NOT NULL DEFAULT '{}',
  last_at timestamptz,
  unread boolean NOT NULL DEFAULT false,
  starred boolean NOT NULL DEFAULT false,
  folder text NOT NULL DEFAULT 'inbox',
  message_count int NOT NULL DEFAULT 1,
  PRIMARY KEY (account_id, thread_id)
);
CREATE INDEX IF NOT EXISTS email_threads_addrs ON email_threads USING gin (addrs);
CREATE INDEX IF NOT EXISTS email_threads_list ON email_threads (account_id, folder, last_at DESC);
