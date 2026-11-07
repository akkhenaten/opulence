// Clock-in proof: the officer's registered phone (passkey), secure NFC tags at venues, selfies with an optional face check.
// clock.punch (modules/clock.mjs) uses the checks below; this module holds the setup and review actions.
import { one, q } from '../lib/db.mjs';
import { fail, required, need } from '../lib/http.mjs';
import { venueScope, assertVenue } from '../lib/scope.mjs';
import { notify, companyManagers, officerUser } from '../lib/notify.mjs';
import { audit } from '../lib/audit.mjs';
import { headObject, getObjectBytes, deleteObject } from '../lib/storage.mjs';
import { guardSelf } from '../lib/selfcheck.mjs';
import { checkRegistration, checkAssertion, registerOptions, assertionOptions, spendChallenge, deviceLabel } from '../lib/passkey.mjs';
import { verifySun, newKey } from '../lib/sun.mjs';
import { faceMatch } from '../lib/face.mjs';
import { getSettings } from './settings.mjs';
import { MGR, CO, def } from './_def.mjs';
import { officerName, userName } from '../lib/names.mjs';
import QRCode from 'qrcode';

const SELFIE_DAYS = 90;
const DEVICE_COLS = 'id, officer_id, label, status, created_at, last_used_at, decided_at';
const tagUrl = () => `${(process.env.APP_URL || '').replace(/\/$/, '')}/app/t?p={PICC}&c={CMAC}`;

// ---- Checks used by clock.punch

/** Registered phone: { device_ok, device_id, flag, extra, problem }. extra says why it failed (skipped or not recognised). */
export async function checkPhone(user, passkey) {
  if (!passkey?.id) return { device_ok: false, device_id: null, flag: 'phone_not_verified', extra: 'phone_skipped', problem: 'Phone not verified (check skipped)' };
  const device = await one("SELECT * FROM officer_devices WHERE credential_id = $1 AND officer_id = $2 AND status IN ('active','pending')", [passkey.id, user.officer_id]);
  if (!device) return { device_ok: false, device_id: null, flag: 'phone_not_verified', extra: 'phone_unrecognised', problem: 'Phone not verified (not the registered phone)' };
  try {
    const challenge = await spendChallenge(user.id, 'clock', passkey.clientDataJSON);
    const { signCount } = checkAssertion(passkey, device, { challenge });
    await q('UPDATE officer_devices SET sign_count = $2, last_used_at = now() WHERE id = $1', [device.id, signCount]);
  } catch (e) {
    return { device_ok: false, device_id: device.id, flag: 'phone_not_verified', extra: 'phone_unrecognised', problem: `Phone not verified (${e.message})` };
  }
  if (device.status === 'pending') return { device_ok: false, device_id: device.id, flag: 'new_phone', problem: 'New phone waiting for a manager to approve it' };
  return { device_ok: true, device_id: device.id };
}

/** A tag tap the officer made in the last 10 minutes at this venue: the tap row or a problem */
export async function findTap(user, tapId, venueId) {
  if (!tapId) return { ok: false };
  const t = await one(
    `SELECT tt.*, vt.venue_id FROM tag_taps tt JOIN venue_tags vt ON vt.id = tt.tag_id
      WHERE tt.id = $1 AND tt.user_id = $2`, [tapId, user.id]);
  if (!t) return { ok: false, problem: 'NFC tap not found' };
  if (t.venue_id !== venueId) return { ok: false, problem: 'NFC tag is for a different venue' };
  if (t.used_by_event) return { ok: false, problem: 'NFC tap already used — tap the tag again' };
  if (new Date(t.expires_at) < new Date()) return { ok: false, problem: 'NFC tap expired — tap the tag again' };
  return { ok: true, tap: t };
}

/** Spend the tap for this clock event; false when another punch got there first */
export const spendTap = async (tapId, eventId) => !!(await one('UPDATE tag_taps SET used_by_event = $2 WHERE id = $1 AND used_by_event IS NULL RETURNING id', [tapId, eventId]));

/** The selfie must be a fresh image this officer just took, not one already used */
export async function checkSelfie(user, key) {
  if (!key) return { ok: false };
  if (!String(key).startsWith(`docs/selfies/${user.id.slice(0, 8)}/`)) return { ok: false, problem: 'Selfie not valid' };
  const h = await headObject(key);
  if (!h || !/^image\/(jpeg|png|webp)$/.test(h.mime) || h.size > 3 * 1024 * 1024) return { ok: false, problem: 'Selfie not valid — take it again' };
  if (h.modified && Date.now() - h.modified.getTime() > 10 * 60000) return { ok: false, problem: 'Selfie too old — take a new one' };
  if (await one('SELECT 1 FROM clock_events WHERE selfie_key = $1', [key])) return { ok: false, problem: 'Selfie already used — take a new one' };
  return { ok: true };
}

/** Face check against the profile photo, only when the company has it on and the officer agreed */
export async function scoreSelfie(officer, key, s) {
  if (!s.face_match_enabled || officer.face_consent !== 'given') return { face_result: null, face_note: null };
  if (!officer.photo_key) return { face_result: 'unscored', face_note: 'No profile photo to compare with' };
  try {
    const [selfie, profile] = await Promise.all([getObjectBytes(key), getObjectBytes(officer.photo_key)]);
    const r = await faceMatch({ selfie, profile });
    return { face_result: r.result, face_note: r.note };
  } catch (e) {
    console.error('[face] read', e.message);
    return { face_result: 'unscored', face_note: 'Photo could not be read' };
  }
}

async function officerDevices(officerId) {
  return q(`SELECT ${DEVICE_COLS} FROM officer_devices WHERE officer_id = $1 AND status IN ('active','pending') ORDER BY created_at DESC`, [officerId]);
}

// ---- Retention (hourly from runJobs)

export async function selfieJobs() {
  const rows = await q(
    `SELECT ce.id, ce.selfie_key FROM clock_events ce LEFT JOIN timesheets t ON t.assignment_id = ce.assignment_id
      WHERE ce.selfie_key IS NOT NULL AND ce.ts < now() - make_interval(days => $1)
        AND ce.status <> 'exception' AND COALESCE(t.status, '') <> 'disputed'
      LIMIT 500`, [SELFIE_DAYS]);
  let deleted = 0;
  for (const r of rows) {
    try {
      await deleteObject(r.selfie_key);
      await q('UPDATE clock_events SET selfie_key = NULL, selfie_deleted_at = now() WHERE id = $1', [r.id]);
      deleted++;
    } catch (e) {
      console.error('[selfies] delete', r.id, e.message);
    }
  }
  await q("DELETE FROM tag_taps WHERE expires_at < now() - interval '1 day'");
  await q("DELETE FROM passkey_challenges WHERE expires_at < now() - interval '1 hour'");
  return { deleted };
}

export const actions = {
  // ---- The officer's phone

  'clock.passkeyOptions': def(['officer'], async (_b, { user }) => {
    const devices = await officerDevices(user.officer_id);
    if (!devices.length) return { register: true };
    const ids = (await q("SELECT credential_id FROM officer_devices WHERE officer_id = $1 AND status IN ('active','pending')", [user.officer_id])).map((r) => r.credential_id);
    return { options: await assertionOptions(user, ids), pending: !devices.some((d) => d.status === 'active') };
  }),

  'device.registerOptions': def(['officer'], async (_b, { user }) => {
    const ids = (await q("SELECT credential_id FROM officer_devices WHERE officer_id = $1 AND status IN ('active','pending')", [user.officer_id])).map((r) => r.credential_id);
    return registerOptions(user, ids);
  }),

  // The very first phone is trusted straight away; any later phone waits for a manager
  'device.register': def(['officer'], async (b, { user, event }) => {
    required(b, 'credential');
    const challenge = await spendChallenge(user.id, 'register', b.credential.clientDataJSON);
    let cred;
    try { cred = checkRegistration(b.credential, { challenge }); } catch (e) { fail(400, `This phone could not be registered: ${e.message}`); }
    if (await one('SELECT 1 FROM officer_devices WHERE credential_id = $1', [cred.credentialId])) fail(400, 'This phone is already registered');
    const ever = await one("SELECT 1 FROM officer_devices WHERE officer_id = $1 AND status IN ('active','replaced','revoked')", [user.officer_id]);
    const status = ever ? 'pending' : 'active';
    if (status === 'pending') await q("UPDATE officer_devices SET status = 'replaced' WHERE officer_id = $1 AND status = 'pending'", [user.officer_id]);
    const label = deviceLabel(event?.headers?.['user-agent'] || event?.headers?.['User-Agent']);
    const d = await one(
      `INSERT INTO officer_devices (officer_id, credential_id, public_key, alg, sign_count, label, status) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${DEVICE_COLS}`,
      [user.officer_id, cred.credentialId, cred.publicKey, cred.alg, cred.signCount, label, status]);
    await audit(user, 'device.register', 'officer', user.officer_id, { label, status, summary: status === 'active' ? `Registered ${label} for clocking in` : `Asked to use a new phone (${label})` });
    if (status === 'pending') {
      await notify(await companyManagers(), {
        kind: 'clock_exception', severity: 'warning', title: `${user.name} wants to clock in on a new phone`,
        body: `${label}. Approve it only if you know they changed phone.`, link: '/company/exceptions?tab=phones',
      });
    }
    return d;
  }),

  'device.mine': def(['officer'], async (_b, { user }) => {
    const o = await one('SELECT face_consent, face_consent_at FROM officers WHERE id = $1', [user.officer_id]);
    const s = await getSettings();
    return { devices: await officerDevices(user.officer_id), face_consent: o?.face_consent || null, face_consent_at: o?.face_consent_at || null, face_match_enabled: !!s.face_match_enabled };
  }),

  // On a laptop the register screen shows a code that opens it on the officer's phone instead
  'device.registerLink': def(['officer'], async (_b, { event }) => {
    const h = event?.headers || {};
    const base = (h.origin || h.Origin || process.env.APP_URL || '').replace(/\/$/, '');
    const url = `${base}/app/officer/profile?phone=register`;
    return { url, qr: await QRCode.toDataURL(url, { width: 384, margin: 1, color: { dark: '#0B1220', light: '#FFFFFF' } }) };
  }),

  'device.list': def(MGR, async (b) => {
    if (!b.officer_id && !b.pending) fail(400, 'officer_id or pending is required');
    return q(
      `SELECT d.id, d.officer_id, d.label, d.status, d.created_at, d.last_used_at, d.decided_at, ${userName('u')} AS decided_by_name,
              ${officerName('o')} AS officer_name,
              (SELECT label FROM officer_devices x WHERE x.officer_id = d.officer_id AND x.status = 'active' LIMIT 1) AS current_label
         FROM officer_devices d JOIN officers o ON o.id = d.officer_id LEFT JOIN users u ON u.id = d.decided_by
        WHERE ${b.pending ? "d.status = 'pending'" : "d.officer_id = $1 AND d.status IN ('active','pending')"}
        ORDER BY d.created_at DESC LIMIT 200`, b.pending ? [] : [b.officer_id]);
  }),

  'device.decide': def(MGR, async (b, { user }) => {
    required(b, 'id', 'approve');
    const d = need(await one("SELECT * FROM officer_devices WHERE id = $1 AND status = 'pending'", [b.id]), 'This phone request was already decided');
    await guardSelf(user, d.officer_id, { message: 'Another manager needs to approve your own new phone' });
    if (b.approve) {
      await q("UPDATE officer_devices SET status = 'replaced', decided_by = $2, decided_at = now() WHERE officer_id = $1 AND status = 'active'", [d.officer_id, user.id]);
      await q("UPDATE officer_devices SET status = 'active', decided_by = $2, decided_at = now() WHERE id = $1", [d.id, user.id]);
    } else {
      await q("UPDATE officer_devices SET status = 'rejected', decided_by = $2, decided_at = now() WHERE id = $1", [d.id, user.id]);
    }
    await audit(user, b.approve ? 'device.approve' : 'device.reject', 'officer', d.officer_id, { label: d.label, summary: `${b.approve ? 'Approved' : 'Rejected'} new phone ${d.label}` });
    await notify(await officerUser(d.officer_id), {
      kind: 'clock_exception', severity: b.approve ? 'info' : 'warning', title: b.approve ? 'Your new phone is approved for clocking in' : 'Your new phone was not approved',
      body: b.approve ? `${d.label} is now your clock-in phone.` : 'Clock in on your registered phone, or speak to the office.', link: '/officer/clock',
    });
    return { ok: true };
  }),

  'device.revoke': def(MGR, async (b, { user }) => {
    required(b, 'id');
    const d = need(await one("UPDATE officer_devices SET status = 'revoked', decided_by = $2, decided_at = now() WHERE id = $1 AND status IN ('active','pending') RETURNING *", [b.id, user.id]));
    await audit(user, 'device.revoke', 'officer', d.officer_id, { label: d.label, summary: `Removed ${d.label} as a clock-in phone` });
    return { ok: true };
  }),

  'officers.faceConsent': def(['officer'], async (b, { user }) => {
    required(b, 'consent');
    const v = b.consent ? 'given' : 'declined';
    await q('UPDATE officers SET face_consent = $2, face_consent_at = now() WHERE id = $1', [user.officer_id, v]);
    await audit(user, 'officer.face_consent', 'officer', user.officer_id, { consent: v, summary: b.consent ? 'Agreed to the selfie face check' : 'Declined the selfie face check' });
    return { face_consent: v };
  }),

  // ---- Secure NFC tags

  // Tag link opened on a phone. Officers get a single-use tap for clock-in; a manager in pairing mode links a new tag to the venue.
  'clock.tagTap': def(['officer', 'company', 'security'], async (b, { user }) => {
    const s = await getSettings();
    if (!s.nfc_meta_key || !s.nfc_file_key) fail(400, 'NFC tags are not set up yet. Scan the QR code instead.');
    const sun = verifySun({ p: b.p, c: b.c }, { metaKey: s.nfc_meta_key, fileKey: s.nfc_file_key });
    if (!sun) fail(400, 'This tag could not be verified. Tap it again, or scan the QR code.');
    const tag = await one('SELECT t.*, v.name AS venue_name FROM venue_tags t JOIN venues v ON v.id = t.venue_id WHERE t.uid = $1', [sun.uid]);
    const manager = user.role !== 'officer';
    if (!tag) {
      if (!manager) fail(404, 'This tag is not linked to a venue yet. Scan the QR code instead.');
      const v = await one('UPDATE venues SET tag_pairing_until = NULL, tag_pairing_by = NULL WHERE tag_pairing_by = $1 AND tag_pairing_until > now() RETURNING id, name', [user.id]);
      if (!v) fail(404, 'This tag is not linked to a venue. Open the venue, choose "Pair a tag", then tap it.');
      const count = (await one('SELECT count(*)::int AS n FROM venue_tags WHERE venue_id = $1', [v.id])).n;
      const t = await one('INSERT INTO venue_tags (venue_id, uid, label, last_counter, last_tap_at, created_by) VALUES ($1,$2,$3,$4, now(), $5) RETURNING *',
        [v.id, sun.uid, `Tag ${count + 1}`, sun.counter, user.id]);
      await audit(user, 'venue.tag_pair', 'venue', v.id, { tag: t.id, summary: `Paired NFC ${t.label} to ${v.name}` });
      return { paired: true, venue_id: v.id, venue_name: v.name, tag: { id: t.id, label: t.label } };
    }
    // Each tap carries a counter that only goes up, so a copied link works at most once
    const fresh = await one("UPDATE venue_tags SET last_counter = $2, last_tap_at = now() WHERE id = $1 AND last_counter < $2 AND status = 'active' RETURNING id", [tag.id, sun.counter]);
    if (!fresh) fail(400, tag.status === 'paused' ? 'This tag is paused. Scan the QR code instead.' : 'This tap link was already used. Tap the tag again.');
    if (manager) return { checked: true, venue_id: tag.venue_id, venue_name: tag.venue_name, tag: { id: tag.id, label: tag.label } };
    const tap = await one("INSERT INTO tag_taps (tag_id, user_id, counter, expires_at) VALUES ($1,$2,$3, now() + interval '10 minutes') RETURNING id, expires_at", [tag.id, user.id, sun.counter]);
    return { tap_id: tap.id, expires_at: tap.expires_at, venue_id: tag.venue_id, venue_name: tag.venue_name };
  }),

  'venues.tags': def(MGR, async (b, { user }) => {
    required(b, 'venue_id');
    await assertVenue(user, b.venue_id);
    const v = await one('SELECT tag_pairing_until, tag_pairing_by FROM venues WHERE id = $1', [b.venue_id]);
    const tags = await q('SELECT id, uid, label, status, last_tap_at, created_at FROM venue_tags WHERE venue_id = $1 ORDER BY created_at', [b.venue_id]);
    const s = await getSettings();
    return { tags, nfc_ready: !!(s.nfc_meta_key && s.nfc_file_key), pairing_until: v?.tag_pairing_by === user.id && new Date(v.tag_pairing_until) > new Date() ? v.tag_pairing_until : null };
  }),

  'venues.tagPair': def(MGR, async (b, { user }) => {
    required(b, 'venue_id');
    await assertVenue(user, b.venue_id);
    const s = await getSettings();
    if (!s.nfc_meta_key) fail(400, 'NFC tags are not set up yet. A company admin can set them up in Settings → Workforce rules.');
    await q('UPDATE venues SET tag_pairing_until = NULL, tag_pairing_by = NULL WHERE tag_pairing_by = $1', [user.id]);
    const v = await one("UPDATE venues SET tag_pairing_until = now() + interval '5 minutes', tag_pairing_by = $2 WHERE id = $1 RETURNING tag_pairing_until", [b.venue_id, user.id]);
    return { pairing_until: v.tag_pairing_until };
  }),

  'venues.tagUpdate': def(MGR, async (b, { user }) => {
    required(b, 'id');
    const t = need(await one('SELECT * FROM venue_tags WHERE id = $1', [b.id]));
    await assertVenue(user, t.venue_id);
    if (b.status && !['active', 'paused'].includes(b.status)) fail(400, 'Invalid status');
    const r = await one('UPDATE venue_tags SET label = COALESCE($2, label), status = COALESCE($3, status) WHERE id = $1 RETURNING id, uid, label, status, last_tap_at, created_at',
      [b.id, b.label ? String(b.label).slice(0, 60) : null, b.status || null]);
    await audit(user, 'venue.tag_update', 'venue', t.venue_id, { tag: t.id, label: r.label, status: r.status });
    return r;
  }),

  'venues.tagRemove': def(MGR, async (b, { user }) => {
    required(b, 'id');
    const t = need(await one('SELECT * FROM venue_tags WHERE id = $1', [b.id]));
    await assertVenue(user, t.venue_id);
    await q('DELETE FROM venue_tags WHERE id = $1', [b.id]);
    await audit(user, 'venue.tag_remove', 'venue', t.venue_id, { tag: t.id, summary: `Removed NFC ${t.label}` });
    return { ok: true };
  }),

  // The keys and link to program tags with. Company admins only, and every look is recorded.
  'clock.nfcSetup': def(CO, async (_b, { user }) => {
    const s = await one('UPDATE settings SET nfc_meta_key = COALESCE(nfc_meta_key, $1), nfc_file_key = COALESCE(nfc_file_key, $2) WHERE id = 1 RETURNING nfc_meta_key, nfc_file_key', [newKey(), newKey()]);
    await audit(user, 'settings.nfc_keys_viewed', 'settings', 1, { summary: 'Viewed the NFC tag programming keys' });
    return { url_template: tagUrl(), meta_key: s.nfc_meta_key, file_key: s.nfc_file_key };
  }),

  // ---- Report: how officers are proving they are on site

  'clock.proofReport': def(MGR, async (b, { user }) => {
    const scope = await venueScope(user);
    const from = b.from || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const to = b.to || new Date().toISOString().slice(0, 10);
    const agg = (key, name) => q(
      `SELECT ${key} AS id, ${name} AS name, count(*)::int AS punches,
              count(*) FILTER (WHERE ce.device_ok)::int AS phone_ok,
              count(*) FILTER (WHERE ce.device_ok IS NOT NULL AND NOT ce.device_ok)::int AS phone_failed,
              count(*) FILTER (WHERE ce.geo_ok)::int AS location_ok,
              count(*) FILTER (WHERE ce.venue_code = 'qr')::int AS qr,
              count(*) FILTER (WHERE ce.venue_code = 'nfc')::int AS nfc,
              count(*) FILTER (WHERE ce.selfie_key IS NOT NULL OR ce.selfie_deleted_at IS NOT NULL)::int AS selfies,
              count(*) FILTER (WHERE ce.status IN ('exception','approved','rejected'))::int AS exceptions,
              count(*) FILTER (WHERE 'face_check' = ANY(ce.flags))::int AS face_flags
         FROM clock_events ce JOIN shift_assignments a ON a.id = ce.assignment_id JOIN shifts s ON s.id = a.shift_id
         JOIN venues v ON v.id = s.venue_id JOIN officers o ON o.id = a.officer_id
        WHERE ce.kind = 'in' AND ce.status <> 'manual' AND ce.ts >= $1::date AND ce.ts < $2::date + 1
          AND ($3::uuid[] IS NULL OR s.venue_id = ANY($3)) AND ($4::uuid IS NULL OR s.venue_id = $4)
        GROUP BY 1, 2 ORDER BY exceptions DESC, punches DESC LIMIT 300`, [from, to, scope, b.venue_id || null]);
    return { from, to, officers: await agg('o.id', "COALESCE(NULLIF(btrim(o.goes_by), ''), o.first_name || ' ' || o.last_name)"), venues: await agg('v.id', 'v.name') };
  }),
};
