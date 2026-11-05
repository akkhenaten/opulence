-- Google / Microsoft OAuth app keys entered in Settings → Email. The secret is AES-GCM sealed (lib/mail/crypto.mjs).
-- Env vars (GOOGLE_CLIENT_ID/SECRET, MS_CLIENT_ID/SECRET) still win when set.
CREATE TABLE IF NOT EXISTS email_providers (
  provider text PRIMARY KEY CHECK (provider IN ('google','microsoft')),
  client_id text NOT NULL,
  secret_enc text NOT NULL,
  tenant text,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
