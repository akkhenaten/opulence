-- Three more app styles beside Day ('classic') and Night ('control'): Soft (neumorphic), Glass and Flat
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_ui_style_check;
ALTER TABLE settings ADD CONSTRAINT settings_ui_style_check CHECK (ui_style IN ('classic', 'control', 'soft', 'glass', 'flat'));
