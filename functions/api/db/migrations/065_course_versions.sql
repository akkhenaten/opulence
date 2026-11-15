-- Each published version of a course, kept as it was (title, lessons, quiz), so a manager can see what an officer passed.
-- Versions published before this table existed have no snapshot. Adds data only; safe to run twice.
CREATE TABLE IF NOT EXISTS course_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  version int NOT NULL,
  title text NOT NULL DEFAULT '',
  content jsonb NOT NULL DEFAULT '{}',
  published_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid,
  UNIQUE (course_id, version)
);
CREATE INDEX IF NOT EXISTS course_versions_course ON course_versions (course_id, version DESC);
