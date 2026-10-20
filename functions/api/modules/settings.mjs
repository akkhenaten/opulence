import { one, q } from '../lib/db.mjs';
import { fail, need, pick, required } from '../lib/http.mjs';
import { DOC_KINDS, SIA_TYPES } from '../lib/licences.mjs';
import { audit } from '../lib/audit.mjs';
import { ALL, CO, def } from './_def.mjs';
import { MODULES } from '../lib/modules.mjs';
import { monthKey } from '../lib/ai.mjs';
import { OPTIONAL_KINDS } from '../lib/notify.mjs';

const FIELDS = ['company_name', 'company_address', 'company_email', 'company_phone', 'vat_number', 'vat_rate', 'company_number', 'bank_name',
  'bank_sort_code', 'bank_account', 'invoice_prefix', 'invoice_cycle', 'payment_terms_days', 'pay_period', 'grace_minutes', 'auto_signoff_days',
  'rounding_minutes', 'night_start', 'night_end', 'pay_night_uplift', 'pay_weekend_uplift', 'pay_bh_uplift', 'gps_tolerance_m'];

export const getSettings = () => one('SELECT * FROM settings WHERE id = 1');

export const actions = {
  'settings.get': def(ALL, async (_b, { user }) => {
    const s = await getSettings();
    if (user.role === 'company') return s;
    return { company_name: s.company_name, grace_minutes: s.grace_minutes, pay_period: s.pay_period, modules: s.modules };
  }),

  'settings.update': def(CO, async (b, { user }) => {
    const f = pick(b, FIELDS);
    if (b.modules) {
      if (typeof b.modules !== 'object' || Object.keys(b.modules).some((k) => !MODULES.includes(k))) fail(400, 'Unknown module');
      f.modules = { ...(await getSettings()).modules, ...Object.fromEntries(Object.entries(b.modules).map(([k, v]) => [k, !!v])) };
    }
    if (b.notify_defaults) {
      if (typeof b.notify_defaults !== 'object' || Object.keys(b.notify_defaults).some((k) => !OPTIONAL_KINDS.includes(k))) fail(400, 'Unknown alert type');
      f.notify_defaults = { ...(await getSettings()).notify_defaults, ...Object.fromEntries(Object.entries(b.notify_defaults).map(([k, v]) => [k, !!v])) };
    }
    if (b.ai_module_caps) {
      const caps = {};
      for (const [k, v] of Object.entries(b.ai_module_caps)) {
        if (![...MODULES, 'ops'].includes(k)) fail(400, 'Unknown module');
        if (v === null || v === '') continue;
        if (!(Number(v) >= 0)) fail(400, 'A cap must be zero or more credits');
        caps[k] = Math.round(Number(v));
      }
      f.ai_module_caps = caps;
    }
    const keys = Object.keys(f);
    if (keys.length) await q(`UPDATE settings SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_at = now() WHERE id = 1`, keys.map((k) => f[k]));
    await audit(user, 'settings.update', 'settings', 1, f);
    return getSettings();
  }),

  // AI credits used this month, per module
  'ai.usage': def(CO, async () => {
    const s = await getSettings();
    const rows = await q('SELECT module, credits FROM ai_usage WHERE month = $1', [monthKey()]);
    return { month: monthKey(), total: Number(s.ops_ai_used), cap: Number(s.ops_ai_cap_credits), caps: s.ai_module_caps, used: Object.fromEntries(rows.map((r) => [r.module, Number(r.credits)])) };
  }),

  'roles.list': def(ALL, async () => q('SELECT * FROM roles ORDER BY name')),

  // Which SIA licences cover a role and which documents it needs (used by the compliance run)
  'roles.update': def(CO, async (b, { user }) => {
    required(b, 'code');
    const lic = b.accepted_licences ?? null;
    const docs = b.required_docs ?? null;
    if (lic && (!Array.isArray(lic) || lic.some((x) => !SIA_TYPES.includes(x)))) fail(400, 'Unknown licence type');
    if (docs && (!Array.isArray(docs) || docs.some((x) => !DOC_KINDS.includes(x)))) fail(400, 'Unknown document type');
    const r = need(await one(
      `UPDATE roles SET requires_sia = COALESCE($2, requires_sia), accepted_licences = COALESCE($3, accepted_licences), required_docs = COALESCE($4, required_docs)
        WHERE code = $1 RETURNING *`, [b.code, typeof b.requires_sia === 'boolean' ? b.requires_sia : null, lic, docs]), 'Role not found');
    await audit(user, 'roles.update', 'role', null, { code: b.code, requires_sia: b.requires_sia, accepted_licences: lic, required_docs: docs });
    return r;
  }),

  'bankHolidays.list': def(ALL, async () => q('SELECT * FROM bank_holidays ORDER BY day')),
  'bankHolidays.save': def(CO, async (b) => {
    required(b, 'day', 'name');
    await q('INSERT INTO bank_holidays (day, name) VALUES ($1,$2) ON CONFLICT (day) DO UPDATE SET name = EXCLUDED.name', [b.day, b.name]);
    return { ok: true };
  }),
  'bankHolidays.delete': def(CO, async (b) => { await q('DELETE FROM bank_holidays WHERE day = $1', [b.day]); return { ok: true }; }),
};
