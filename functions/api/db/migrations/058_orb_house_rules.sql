-- The company's own rules for Orb (Orb settings → House rules): followed in chat, voice and the advice on cards
ALTER TABLE settings ADD COLUMN IF NOT EXISTS ops_house_rules text;
