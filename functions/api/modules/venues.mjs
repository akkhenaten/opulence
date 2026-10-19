import { one, q, insert, update } from '../lib/db.mjs';
import { fail, required, pick, need } from '../lib/http.mjs';
import { canSeePay } from '../lib/auth.mjs';
import { venueScope, assertVenue } from '../lib/scope.mjs';
import { qrPayload } from '../lib/qr.mjs';
import { qrPosterPdf } from '../lib/pdf.mjs';
import { downloadUrl } from '../lib/storage.mjs';
import { audit } from '../lib/audit.mjs';
import { CO, MGR, def } from './_def.mjs';

const VENUE_FIELDS = ['client_id', 'name', 'address', 'postcode', 'lat', 'lng', 'radius_m', 'phone', 'instructions', 'notes', 'photo_key', 'invoice_cycle', 'active'];

export async function currentVenueRates(venueId, onDate = new Date().toISOString().slice(0, 10)) {
  return q(
    `SELECT DISTINCT ON (role) r.*, ro.name AS role_name FROM venue_rates r JOIN roles ro ON ro.code = r.role
      WHERE venue_id = $1 AND effective_from <= $2 ORDER BY role, effective_from DESC`, [venueId, onDate]);
}

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
    return Promise.all(rows.map(async (v) => ({ ...v, photo_url: await downloadUrl(v.photo_key) })));
  }),

  'venues.get': def(['company', 'security', 'venue'], async (b, { user }) => {
    required(b, 'id');
    await assertVenue(user, b.id);
    const v = need(await one('SELECT v.*, c.name AS client_name FROM venues v LEFT JOIN clients c ON c.id = v.client_id WHERE v.id = $1', [b.id]));
    const [contacts, security, rates, docs] = await Promise.all([
      q("SELECT u.id, u.name, u.email, u.phone, u.status FROM venue_contacts vc JOIN users u ON u.id = vc.user_id WHERE vc.venue_id = $1", [b.id]),
      q("SELECT u.id, u.name, u.email, u.phone FROM security_venues sv JOIN users u ON u.id = sv.user_id WHERE sv.venue_id = $1", [b.id]),
      user.role === 'venue' || canSeePay(user) ? currentVenueRates(b.id) : [],
      q("SELECT id, kind, title, expiry, created_at, mime FROM documents WHERE owner_type = 'venue' AND owner_id = $1 ORDER BY created_at DESC", [b.id]),
    ]);
    return { ...v, photo_url: await downloadUrl(v.photo_key), contacts, security, rates, documents: docs };
  }),

  'venues.save': def(CO, async (b, { user }) => {
    const f = pick(b, VENUE_FIELDS);
    let v;
    if (b.id) v = await update('venues', b.id, f);
    else {
      required(b, 'name');
      v = await insert('venues', f);
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
    return { filename: `QR-${v.name}.pdf`, pdf: await qrPosterPdf(v, qrPayload(v)) };
  }),

  'clients.list': def(CO, async () => q(
    'SELECT c.*, (SELECT count(*) FROM venues v WHERE v.client_id = c.id) AS venue_count FROM clients c ORDER BY name')),

  'clients.save': def(CO, async (b) => {
    const f = pick(b, ['name', 'billing_email', 'billing_address', 'vat_number']);
    if (b.id) return update('clients', b.id, f);
    required(b, 'name');
    return insert('clients', f);
  }),
};
