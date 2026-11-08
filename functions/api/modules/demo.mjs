import { one, q } from '../lib/db.mjs';
import { fail, required, need } from '../lib/http.mjs';
import { audit } from '../lib/audit.mjs';
import { notify, platformAdmins } from '../lib/notify.mjs';
import { CO, def, pub } from './_def.mjs';

// "Request a private demo" form on the public landing page
export const DEMO_STATUSES = ['new', 'contacted', 'won', 'lost'];
const cap = (v, n = 200) => String(v ?? '').trim().slice(0, n) || null;

export const actions = {
  'demo.request': pub(async (b, ctx) => {
    // The connection's own address: a forwarded-for header can be set by the visitor
    const ip = ctx.event?.requestContext?.http?.sourceIp || ctx.ip || '';
    if (b.website) return { ok: true }; // honeypot: bots fill every field
    const r = { name: cap(b.name), company: cap(b.company), email: cap(b.email), phone: cap(b.phone, 40), sites: cap(b.sites, 20), message: cap(b.message, 2000) };
    if (!r.name || !r.company || !r.email) fail(400, 'Please add your name, company and work email');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email)) fail(400, 'Please check your email address');
    const { n } = await one("SELECT count(*)::int AS n FROM demo_requests WHERE ip = $1 AND created_at > now() - interval '1 hour'", [ip]);
    if (n >= 5) fail(429, 'Too many requests — please try again later');
    await q('INSERT INTO demo_requests (name, company, email, phone, sites, message, ip) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [r.name, r.company, r.email, r.phone, r.sites, r.message, ip]);
    await notify(await platformAdmins(), { kind: 'demo', title: `New demo request from ${r.company}`, body: `${r.name} · ${r.email}`, link: '/company/settings?tab=demos', email: true });
    return { ok: true };
  }),

  'demo.list': def(CO, async () => q('SELECT id, name, company, email, phone, sites, message, status, status_note, created_at FROM demo_requests ORDER BY created_at DESC LIMIT 200')),

  'demo.setStatus': def(CO, async (b, { user }) => {
    required(b, 'id', 'status');
    if (!DEMO_STATUSES.includes(b.status)) fail(400, 'Invalid status');
    const r = need(await one('UPDATE demo_requests SET status = $2, status_note = COALESCE($3, status_note) WHERE id = $1 RETURNING id, status, status_note', [b.id, b.status, b.note == null ? null : String(b.note).slice(0, 500)]));
    await audit(user, `demo.${b.status}`, 'demo_request', String(r.id));
    return r;
  }),
};
