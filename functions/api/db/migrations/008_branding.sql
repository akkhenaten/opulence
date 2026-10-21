-- Company branding: logo (private original for PDFs + public copy for emails and the app) and one brand colour
ALTER TABLE settings ADD COLUMN IF NOT EXISTS logo_key text,
                     ADD COLUMN IF NOT EXISTS logo_url text,
                     ADD COLUMN IF NOT EXISTS brand_color text;
