import { RULES } from '../lib/proof.mjs';
import { one, q, insert, update } from '../lib/db.mjs';
import { fail, required, pick, need } from '../lib/http.mjs';
import { canSeePay } from '../lib/auth.mjs';
import { venueScope, assertVenue } from '../lib/scope.mjs';
import { qrPayload } from '../lib/qr.mjs';
import { qrPosterPdf } from '../lib/pdf.mjs';
import { checkOwnPhoto, downloadUrl } from '../lib/storage.mjs';
import { audit } from '../lib/audit.mjs';
import { CO, MGR, def } from './_def.mjs';
import { getSettings } from './settings.mjs';
import { isSiteClient } from '../lib/siteClients.mjs';

const VENUE_FIELDS = ['client_id', 'name', 'address', 'postcode', 'lat', 'lng', 'radius_m', 'phone', 'instructions', 'notes', 'photo_key', 'invoice_cycle', 'active', 'proof_rule', 'site_client'];

export async function currentVenueRates(venueId, onDate = new Date().toISOString().slice(0, 10)) {
  return q(
    `SELECT DISTINCT ON (role) r.*, ro.name AS role_name FROM venue_rates r JOIN roles ro ON ro.code = r.role
      WHERE venue_id = $1 AND effective_from <= $2 ORDER BY role, effective_from DESC`, [venueId, onDate]);
}

// Venue managers never see the security company's internal notes about their site
const clientView = (user, v) => {
  if (user.role !== 'venue') return v;
  const { notes, ...rest } = v;
  return rest;
};

export const actions = {
  'venues.list': def(['company', 'security', 'venue'], async (b, { user }) => {
    const scope = await venueScope(user);
    const rows = await q(
      `SELECT v.*, c.name AS client_name,
              (SELECT count(*) FROM shifts s WHERE s.venue_id = v.id AND s.status = 'published' AND s.starts_at > now()) AS upcoming_shifts,
              (SELECT count(*) FROM incidents i WHERE i.venue_id = v.id AND i.status <> 'closed') AS open_incidents
         FROM venues v LEFT JOIN clients c ON c.id = v.client_id
        WHERE ($1::uuid[] IS NULL OR v.id = ANY($1)) AND ($2::boolean OR v.active)
        ORDER BY v.active DESC, v.name`, [scope, !!b.include_inactive]);
    return Promise.all(rows.map(async (v) => ({ ...clientView(user, v), photo_url: await downloadUrl(v.photo_key) })));
  }),

  'venues.get': def(['company', 'security', 'venue'], async (b, { user }) => {
    required(b, 'id');
    await assertVenue(user, b.id);
    const v = need(await one('SELECT v.*, c.name AS client_name FROM venues v LEFT JOIN clients c ON c.id = v.client_id WHERE v.id = $1', [b.id]));
    const [contacts, security, rates, docs] = await Promise.all([
      q(`SELECT u.id, u.name, u.email, u.phone, u.status, u.client_id, array(SELECT x.venue_id FROM venue_contacts x WHERE x.user_id = u.id) AS venue_ids
           FROM venue_contacts vc JOIN users u ON u.id = vc.user_id WHERE vc.venue_id = $1 ORDER BY u.name`, [b.id]),
      q(`SELECT u.id, u.name, u.email, u.phone, u.status, u.client_id, array(SELECT x.venue_id FROM security_venues x WHERE x.user_id = u.id) AS venue_ids
           FROM security_venues sv JOIN users u ON u.id = sv.user_id WHERE sv.venue_id = $1 ORDER BY u.name`, [b.id]),
      user.role === 'venue' || canSeePay(user) ? currentVenueRates(b.id) : [],
      q("SELECT id, kind, title, expiry, created_at, mime FROM documents WHERE owner_type = 'venue' AND owner_id = $1 ORDER BY created_at DESC", [b.id]),
    ]);
    const fb = await one("SELECT count(*)::int AS n FROM venue_comments WHERE venue_id = $1 AND status = 'open'", [b.id]);
    return { ...clientView(user, v), photo_url: await downloadUrl(v.photo_key), contacts, security, rates, documents: docs, feedback_open: fb.n };
  }),

  // Company and security managers run venues; the client and invoicing set-up stay with the company
  'venues.save': def(MGR, async (b, { user }) => {
    const f = pick(b, VENUE_FIELDS);
    if (user.role !== 'company') { delete f.client_id; delete f.invoice_cycle; delete f.site_client; }
    if (f.site_client === '') f.site_client = null;
    if (f.site_client && !isSiteClient(f.site_client)) fail(400, 'Unknown website client');
    if (f.proof_rule !== undefined && !RULES[f.proof_rule]) fail(400, 'Unknown clock-in rule');
    if (b.id) await assertVenue(user, b.id);
    // A new venue photo must be an image this manager just uploaded; an unchanged key passes through
    if (f.photo_key !== undefined) {
      const cur = b.id ? await one('SELECT photo_key FROM venues WHERE id = $1', [b.id]) : null;
      if (f.photo_key !== (cur?.photo_key ?? null)) f.photo_key = await checkOwnPhoto(user, f.photo_key, fail);
    }
    let v;
    if (b.id) v = await update('venues', b.id, f);
    else {
      required(b, 'name');
      v = await insert('venues', f);
      if (user.role === 'security') await q('INSERT INTO security_venues (venue_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [v.id, user.id]);
    }
    await audit(user, b.id ? 'venue.update' : 'venue.create', 'venue', v.id, f);
    return v;
  }),

  'venues.rates': def(['company', 'security', 'venue'], async (b, { user }) => {
    await assertVenue(user, b.venue_id);
    if (user.role === 'security' && !canSeePay(user)) fail(403, 'No access to rates');
    return q('SELECT r.*, ro.name AS role_name FROM venue_rates r JOIN roles ro ON ro.code = r.role WHERE venue_id = $1 ORDER BY role, effective_from DESC', [b.venue_id]);
  }),

  'venues.saveRate': def(CO, async (b, { user }) => {
    required(b, 'venue_id', 'role', 'rate');
    const r = await insert('venue_rates', pick(b, ['venue_id', 'role', 'rate', 'night_uplift', 'weekend_uplift', 'bh_uplift', 'min_hours', 'effective_from']));
    await audit(user, 'venue.rate', 'venue', b.venue_id, r);
    return r;
  }),

  'venues.deleteRate': def(CO, async (b, { user }) => {
    await q('DELETE FROM venue_rates WHERE id = $1', [b.id]);
    await audit(user, 'venue.rate_delete', 'venue_rate', b.id);
    return { ok: true };
  }),

  'venues.qr': def(MGR, async (b, { user }) => {
    await assertVenue(user, b.id);
    const v = need(await one('SELECT * FROM venues WHERE id = $1', [b.id]));
    return { payload: qrPayload(v), version: v.qr_version };
  }),

  'venues.qrRegenerate': def(CO, async (b, { user }) => {
    const v = need(await one('UPDATE venues SET qr_version = qr_version + 1 WHERE id = $1 RETURNING *', [b.id]));
    await audit(user, 'venue.qr_regenerate', 'venue', v.id, { version: v.qr_version });
    return { payload: qrPayload(v), version: v.qr_version };
  }),

  'venues.qrPoster': def(MGR, async (b, { user }) => {
    await assertVenue(user, b.id);
    const v = need(await one('SELECT * FROM venues WHERE id = $1', [b.id]));
    return { filename: `QR-${v.name}.pdf`, pdf: await qrPosterPdf(v, qrPayload(v), await getSettings()) };
  }),

  'clients.list': def(CO, async () => q(
    `SELECT c.*, (SELECT count(*) FROM venues v WHERE v.client_id = c.id) AS venue_count,
            (SELECT count(DISTINCT u.id) FROM users u WHERE NOT u.system AND u.status <> 'disabled'
                AND (u.client_id = c.id OR u.id IN (SELECT vc.user_id FROM venue_contacts vc JOIN venues v ON v.id = vc.venue_id WHERE v.client_id = c.id))) AS contact_count,
            COALESCE((SELECT array_agg(v.id) FROM venues v WHERE v.client_id = c.id), '{}') AS venue_ids
       FROM clients c ORDER BY name`)),

  // A client with its venues and the people who speak for it: linked to the client, or managing one of its venues
  'clients.get': def(CO, async (b) => {
    required(b, 'id');
    const c = need(await one('SELECT * FROM clients WHERE id = $1', [b.id]), 'Client not found');
    const [venues, contacts] = await Promise.all([
      q('SELECT id, name, active, site_client FROM venues WHERE client_id = $1 ORDER BY active DESC, name', [b.id]),
      q(`SELECT u.id, u.name, u.email, u.role, u.status, COALESCE(u.client_id = $1, false) AS linked,
                COALESCE(array_agg(DISTINCT v.name) FILTER (WHERE v.name IS NOT NULL), '{}') AS venues
           FROM users u
           LEFT JOIN venue_contacts vc ON vc.user_id = u.id
           LEFT JOIN venues v ON v.id = vc.venue_id AND v.client_id = $1
          WHERE NOT u.system AND (u.client_id = $1 OR v.id IS NOT NULL)
          GROUP BY u.id ORDER BY u.status = 'disabled', u.name`, [b.id]),
    ]);
    return { ...c, venues, contacts };
  }),

  'clients.setVenue': def(CO, async (b, { user }) => {
    required(b, 'venue_id');
    if (b.client_id) need(await one('SELECT 1 FROM clients WHERE id = $1', [b.client_id]), 'Client not found');
    const v = need(await one('UPDATE venues SET client_id = $2 WHERE id = $1 RETURNING id, client_id', [b.venue_id, b.client_id || null]), 'Venue not found');
    await audit(user, 'venue.update', 'venue', v.id, { client_id: v.client_id });
    return v;
  }),

  'clients.save': def(CO, async (b) => {
    const f = pick(b, ['name', 'billing_email', 'billing_address', 'vat_number']);
    if (b.id) return update('clients', b.id, f);
    required(b, 'name');
    return insert('clients', f);
  }),
};
