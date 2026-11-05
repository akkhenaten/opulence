import { one, q } from '../lib/db.mjs';
import { fail, need, pick, required } from '../lib/http.mjs';
import { DOC_KINDS, SIA_TYPES } from '../lib/licences.mjs';
import { audit } from '../lib/audit.mjs';
import { ALL, CO, def, pub } from './_def.mjs';
import crypto from 'node:crypto';
import { getObjectBytes, headObject, publicUrl, putObject } from '../lib/storage.mjs';
import { clearBrand, getBrand } from '../lib/brand.mjs';
import { MODULES } from '../lib/modules.mjs';
import { monthKey } from '../lib/ai.mjs';
import { OPTIONAL_KINDS } from '../lib/notify.mjs';
import { cleanEverydaySettings } from '../lib/feed.mjs';

const FIELDS = ['company_name', 'company_address', 'company_email', 'company_phone', 'vat_number', 'vat_rate', 'company_number', 'bank_name',
  'bank_sort_code', 'bank_account', 'invoice_prefix', 'invoice_cycle', 'payment_terms_days', 'pay_period', 'grace_minutes', 'auto_signoff_days',
  'rounding_minutes', 'night_start', 'night_end', 'pay_night_uplift', 'pay_weekend_uplift', 'pay_bh_uplift', 'gps_tolerance_m', 'brand_color', 'ui_style', 'default_signatory_id', 'face_match_enabled'];
export const UI_STYLES = ['classic', 'control'];
const STYLE_NAMES = { classic: 'Classic', control: 'Control Room' };


export const getSettings = () => one('SELECT * FROM settings WHERE id = 1');
// The NFC tag keys never leave the server except through clock.nfcSetup
const forClient = ({ nfc_meta_key, nfc_file_key, ...s }) => ({ ...s, nfc_ready: !!(nfc_meta_key && nfc_file_key) });

export const actions = {
  'settings.get': def(ALL, async (_b, { user }) => {
    const s = await getSettings();
    if (user.role === 'company') return forClient(s);
    return { company_name: s.company_name, grace_minutes: s.grace_minutes, pay_period: s.pay_period, modules: s.modules, logo_url: s.logo_url, brand_color: s.brand_color, ui_style: s.ui_style, everyday: s.everyday };
  }),

  // Name, logo and colour for the sign-in page (no login needed)
  'settings.brand': pub(async () => getBrand()),

  // Set the company logo from an upload (files.uploadUrl purpose "company"); '' removes it
  'settings.setLogo': def(CO, async (b, { user }) => {
    let logo_key = null;
    let logo_url = null;
    if (b.key) {
      if (!String(b.key).startsWith(`docs/company/${user.id.slice(0, 8)}/`)) fail(400, 'Upload the logo first');
      const h = await headObject(b.key);
      if (!h) fail(400, 'Upload the logo first');
      if (!['image/png', 'image/jpeg'].includes(h.mime)) fail(400, 'The logo must be a PNG or JPG image');
      if (h.size > 2 * 1024 * 1024) fail(400, 'The logo must be under 2 MB');
      const bytes = await getObjectBytes(b.key);
      const png = bytes[0] === 0x89 && bytes[1] === 0x50;
      const jpg = bytes[0] === 0xff && bytes[1] === 0xd8;
      if (!png && !jpg) fail(400, "That file isn't a readable PNG or JPG image");
      const pubKey = `media/branding/${crypto.randomUUID()}.${png ? 'png' : 'jpg'}`;
      await putObject(pubKey, bytes, png ? 'image/png' : 'image/jpeg');
      logo_key = b.key;
      logo_url = publicUrl(pubKey);
    }
    await q('UPDATE settings SET logo_key = $1, logo_url = $2, updated_at = now() WHERE id = 1', [logo_key, logo_url]);
    clearBrand();
    await audit(user, 'settings.logo', 'settings', 1, { logo: logo_key ? 'set' : 'removed' });
    return forClient(await getSettings());
  }),

  'settings.update': def(CO, async (b, { user }) => {
    const f = pick(b, FIELDS);
    if ('brand_color' in f) {
      f.brand_color = String(f.brand_color || '').trim().toLowerCase() || null;
      if (f.brand_color && !/^#[0-9a-f]{6}$/.test(f.brand_color)) fail(400, 'Enter the colour as a hex code, like #C9A45C');
    }
    if ('ui_style' in f && !UI_STYLES.includes(f.ui_style)) fail(400, 'Unknown app style');
    if ('default_signatory_id' in f) {
      f.default_signatory_id = f.default_signatory_id || null;
      if (f.default_signatory_id && !(await one(
        "SELECT 1 FROM user_signatures s JOIN users u ON u.id = s.user_id WHERE s.user_id = $1 AND u.role = 'company' AND u.status = 'active'", [f.default_signatory_id]))) {
        fail(400, 'That manager has not saved a signature yet');
      }
    }
    const before = 'ui_style' in f ? (await getSettings()).ui_style : null;
    if (b.modules) {
      if (typeof b.modules !== 'object' || Object.keys(b.modules).some((k) => !MODULES.includes(k))) fail(400, 'Unknown module');
      f.modules = { ...(await getSettings()).modules, ...Object.fromEntries(Object.entries(b.modules).map(([k, v]) => [k, !!v])) };
    }
    if (b.notify_defaults) {
      if (typeof b.notify_defaults !== 'object' || Object.keys(b.notify_defaults).some((k) => !OPTIONAL_KINDS.includes(k))) fail(400, 'Unknown alert type');
      f.notify_defaults = { ...(await getSettings()).notify_defaults, ...Object.fromEntries(Object.entries(b.notify_defaults).map(([k, v]) => [k, !!v])) };
    }
    if (b.everyday) f.everyday = cleanEverydaySettings(b.everyday, (await getSettings()).everyday);
    if (b.ai_module_caps) {
      const caps = {};
      for (const [k, v] of Object.entries(b.ai_module_caps)) {
        if (![...MODULES, 'ops', 'orb', 'orb_voice', 'contracts', 'clock_face'].includes(k)) fail(400, 'Unknown module');
        if (v === null || v === '') continue;
        if (!(Number(v) >= 0)) fail(400, 'A cap must be zero or more credits');
        caps[k] = Math.round(Number(v));
      }
      f.ai_module_caps = caps;
    }
    const keys = Object.keys(f);
    if (keys.length) await q(`UPDATE settings SET ${keys.map((k, i) => `${k} = $${i + 1}`).join(', ')}, updated_at = now() WHERE id = 1`, keys.map((k) => f[k]));
    clearBrand();
    await audit(user, 'settings.update', 'settings', 1, f);
    if ('default_signatory_id' in f) {
      const who = f.default_signatory_id ? (await one('SELECT name FROM user_signatures WHERE user_id = $1', [f.default_signatory_id]))?.name : null;
      await audit(user, 'settings.signatory', 'settings', 1, { to: f.default_signatory_id, summary: who ? `Documents are now countersigned by ${who}` : 'Default company signatory cleared' });
    }
    if (before && before !== f.ui_style) await audit(user, 'settings.ui_style', 'settings', 1, { from: before, to: f.ui_style, summary: `App style changed to ${STYLE_NAMES[f.ui_style]}` });
    return forClient(await getSettings());
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
