-- Billing streams: a venue that pays from more than one budget (e.g. a concierge desk and contractor site management)
-- gets one invoice per budget. Every venue has a default stream, so a venue that never adds another sees no change.
-- Shifts, cover requests and invoices carry their stream; a charge rate can be venue-wide (no stream) or a stream's own.
CREATE TABLE IF NOT EXISTS venue_streams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  po_ref text NOT NULL DEFAULT '',
  recipients text[] NOT NULL DEFAULT '{}',
  bill_to_name text NOT NULL DEFAULT '',
  bill_to_address text NOT NULL DEFAULT '',
  roles text[] NOT NULL DEFAULT '{}',
  is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  checked_at timestamptz,
  checked_by uuid REFERENCES users(id),
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS venue_streams_name ON venue_streams (venue_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS venue_streams_default ON venue_streams (venue_id) WHERE is_default;

-- One default stream per venue, already checked (it bills exactly as the venue did)
INSERT INTO venue_streams (venue_id, name, is_default, checked_at)
SELECT v.id, v.name, true, now() FROM venues v
 WHERE NOT EXISTS (SELECT 1 FROM venue_streams s WHERE s.venue_id = v.id AND s.is_default);

CREATE OR REPLACE FUNCTION venue_default_stream(v uuid) RETURNS uuid AS $$
  SELECT id FROM venue_streams WHERE venue_id = v AND is_default
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION venue_add_default_stream() RETURNS trigger AS $$
BEGIN
  INSERT INTO venue_streams (venue_id, name, is_default, checked_at) VALUES (NEW.id, NEW.name, true, now())
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS venue_default_stream ON venues;
CREATE TRIGGER venue_default_stream AFTER INSERT ON venues FOR EACH ROW EXECUTE FUNCTION venue_add_default_stream();

ALTER TABLE shifts ADD COLUMN IF NOT EXISTS stream_id uuid REFERENCES venue_streams(id);
ALTER TABLE cover_series ADD COLUMN IF NOT EXISTS stream_id uuid REFERENCES venue_streams(id);
ALTER TABLE cover_requests ADD COLUMN IF NOT EXISTS stream_id uuid REFERENCES venue_streams(id);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS stream_id uuid REFERENCES venue_streams(id);
ALTER TABLE venue_rates ADD COLUMN IF NOT EXISTS stream_id uuid REFERENCES venue_streams(id) ON DELETE CASCADE;

UPDATE shifts SET stream_id = venue_default_stream(venue_id) WHERE stream_id IS NULL;
UPDATE cover_series SET stream_id = venue_default_stream(venue_id) WHERE stream_id IS NULL;
UPDATE cover_requests SET stream_id = venue_default_stream(venue_id) WHERE stream_id IS NULL;
UPDATE invoices SET stream_id = venue_default_stream(venue_id) WHERE stream_id IS NULL;

-- A row written without a stream (older code paths, copies) takes the venue's default
CREATE OR REPLACE FUNCTION fill_default_stream() RETURNS trigger AS $$
BEGIN
  IF NEW.stream_id IS NULL THEN NEW.stream_id := venue_default_stream(NEW.venue_id); END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS shifts_default_stream ON shifts;
CREATE TRIGGER shifts_default_stream BEFORE INSERT ON shifts FOR EACH ROW EXECUTE FUNCTION fill_default_stream();
DROP TRIGGER IF EXISTS invoices_default_stream ON invoices;
CREATE TRIGGER invoices_default_stream BEFORE INSERT ON invoices FOR EACH ROW EXECUTE FUNCTION fill_default_stream();
DROP TRIGGER IF EXISTS cover_series_default_stream ON cover_series;
CREATE TRIGGER cover_series_default_stream BEFORE INSERT ON cover_series FOR EACH ROW EXECUTE FUNCTION fill_default_stream();
DROP TRIGGER IF EXISTS cover_requests_default_stream ON cover_requests;
CREATE TRIGGER cover_requests_default_stream BEFORE INSERT ON cover_requests FOR EACH ROW EXECUTE FUNCTION fill_default_stream();

ALTER TABLE shifts ALTER COLUMN stream_id SET NOT NULL;
ALTER TABLE invoices ALTER COLUMN stream_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS shifts_stream_idx ON shifts (stream_id);
CREATE INDEX IF NOT EXISTS invoices_venue_stream_idx ON invoices (venue_id, stream_id, status);
CREATE INDEX IF NOT EXISTS venue_rates_stream_idx ON venue_rates (venue_id, role, stream_id, effective_from DESC);
