-- Visual and interactive lesson blocks: picture, key facts, step flow, do/don't, best-practice options
ALTER TABLE course_sections ADD COLUMN IF NOT EXISTS blocks jsonb NOT NULL DEFAULT '[]';
