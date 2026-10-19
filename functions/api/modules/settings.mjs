import { one, q } from '../lib/db.mjs';
import { pick, required } from '../lib/http.mjs';
import { audit } from '../lib/audit.mjs';
import { ALL, CO, def } from './_def.mjs';

const FIELDS = ['company_name', 'company_address', 'company_email', 'company_phone', 'vat_number', 'vat_rate', 'company_number', 'bank_name',
  'bank_sort_code', 'bank_account', 'invoice_prefix', 'invoice_cycle', 'payment_terms_days', 'pay_period', 'grace_minutes', 'auto_signoff_days',
  'rounding_minutes', 'night_start', 'night_end', 'pay_night_uplift', 'pay_weekend_uplift', 'pay_bh_uplift', 'gps_tolerance_m'];

export const getSettings = () => one('SELECT * FROM settings WHERE id = 1');

export const actions = {
  'settings.get': def(ALL, async (_b, { user }) => {
    const s = await getSettings();
    if (user.role === 'company') return s;
    return { company_name: s.company_name, grace_minutes: s.grace_minutes, pay_period: s.pay_period };
  }),

  'settings.update': def(CO, async (b, { user }) => {
    const f = pick(b, FIELDS);
    const keys = Object.keys(f);
    if (keys.length) await q(`UPDATE settings SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_at = now() WHERE id = 1`, keys.map((k) => f[k]));
    await audit(user, 'settings.update', 'settings', 1, f);
    return getSettings();
  }),

  'roles.list': def(ALL, async () => q('SELECT * FROM roles ORDER BY name')),

  'bankHolidays.list': def(ALL, async () => q('SELECT * FROM bank_holidays ORDER BY day')),
  'bankHolidays.save': def(CO, async (b) => {
    required(b, 'day', 'name');
    await q('INSERT INTO bank_holidays (day, name) VALUES ($1,$2) ON CONFLICT (day) DO UPDATE SET name = EXCLUDED.name', [b.day, b.name]);
    return { ok: true };
  }),
  'bankHolidays.delete': def(CO, async (b) => { await q('DELETE FROM bank_holidays WHERE day = $1', [b.day]); return { ok: true }; }),
};
