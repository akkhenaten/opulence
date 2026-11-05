-- Whether a register check was filled in automatically (SIA Checker) or typed in by the manager
ALTER TABLE sia_checks ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','auto'));
