-- Orb voice: a default monthly cap (about 15 ten-minute talks). Only set when the company has none, so a blanked cap stays blank.

UPDATE settings SET ai_module_caps = COALESCE(ai_module_caps, '{}'::jsonb) || '{"orb_voice": 300000}'::jsonb
 WHERE id = 1 AND NOT (COALESCE(ai_module_caps, '{}'::jsonb) ? 'orb_voice');
