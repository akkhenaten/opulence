-- One row per Orb job run (Settings → Orb "Last ran", Orb activity "Problems"). Consecutive runs that found
-- nothing to do update one row instead of adding a row every 5 minutes. Rows older than 90 days are removed.
CREATE TABLE IF NOT EXISTS ops_job_runs (
  id bigserial PRIMARY KEY,
  job text NOT NULL,
  started_at timestamptz NOT NULL,
  finished_at timestamptz NOT NULL DEFAULT now(),
  ok boolean NOT NULL,
  idle boolean NOT NULL DEFAULT false,
  summary text NOT NULL DEFAULT '',
  error text
);
CREATE INDEX IF NOT EXISTS ops_job_runs_job ON ops_job_runs (job, finished_at DESC);
CREATE INDEX IF NOT EXISTS ops_job_runs_failed ON ops_job_runs (finished_at DESC) WHERE NOT ok;
