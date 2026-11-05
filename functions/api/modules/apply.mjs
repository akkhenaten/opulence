// "Join the team": the public Apply page and the manager's review of online applicants in Recruitment.
// An application creates an officers row with status 'applicant' plus an applications row; the CV and SIA badge
// become the officer's documents, and AI reads them in the background (apply.read, or the scheduled catch-up).
import { one, q, tx } from '../lib/db.mjs';
import { fail, need, required } from '../lib/http.mjs';
import { uploadUrl, headObject, deleteObject } from '../lib/storage.mjs';
import { notify, companyManagers, sendRawEmail, emailHtml } from '../lib/notify.mjs';
import { getBrand, esc } from '../lib/brand.mjs';
import { hashToken, newToken } from '../lib/signLinks.mjs';
import { audit } from '../lib/audit.mjs';
import { londonDate } from '../lib/time.mjs';
import { cleanApplication, readApplication, applicationFlags, findDuplicates, rolesFor, getApplication, FILE_TYPES, MAX_FILE } from '../lib/applicants.mjs';
import { seedOnboarding, tickOnboarding } from './hr.mjs';
import { CO, def, pub } from './_def.mjs';

const KINDS = { cv: 'CV', sia_front: 'SIA badge (front)', sia_back: 'SIA badge (back)' };
const ROLE_LABEL = { door: 'Door supervisor', guard: 'Security guard', cctv: 'CCTV operator', steward: 'Steward', close: 'Close protection' };
const roleText = (codes) => (codes || []).map((c) => ROLE_LABEL[c] || c).join(', ');
// The connection's own address: a forwarded-for header can be set by the visitor
const ipOf = (ctx) => ctx.event?.requestContext?.http?.sourceIp || ctx.ip || '';

/** Delete an applicant's files and record (retention, or a repeat application replacing old files) */
async function dropFiles(officerId, kinds) {
  const docs = await q("SELECT id, s3_key FROM documents WHERE owner_type = 'officer' AND owner_id = $1 AND kind = ANY($2)", [officerId, kinds]);
  for (const d of docs) await deleteObject(d.s3_key).catch((e) => console.warn('[apply] delete failed', d.s3_key, e.message));
  if (docs.length) await q('DELETE FROM documents WHERE id = ANY($1)', [docs.map((d) => d.id)]);
}

/** Catch-up AI reads (the Apply page normally starts them) and the 6-month clean-up, from the scheduled run */
export async function applicantJobs() {
  const out = {};
  const stuck = await q("SELECT officer_id FROM applications WHERE ai_status = 'pending' AND updated_at < now() - interval '2 minutes' ORDER BY updated_at LIMIT 3");
  for (const a of stuck) await readApplication(a.officer_id);
  out.read = stuck.length;
  // Once a day: applications not taken forward are deleted after 6 months, with their files
  const today = londonDate(new Date());
  if (await one("SELECT 1 FROM ops_activity WHERE kind = 'applicant_purge' AND text = $1", [today])) return out;
  await q("INSERT INTO ops_activity (kind, text) VALUES ('applicant_purge', $1)", [today]);
  const old = await q(
    `SELECT o.id, o.user_id FROM applications a JOIN officers o ON o.id = a.officer_id
      WHERE o.status IN ('applicant','rejected') AND coalesce(a.rejected_at, a.updated_at) < now() - interval '6 months'`);
  for (const o of old) {
    await dropFiles(o.id, ['cv', 'sia', 'rtw', 'id', 'poa', 'other']);
    await q('DELETE FROM officers WHERE id = $1', [o.id]);
    if (o.user_id) await q("DELETE FROM users WHERE id = $1 AND status <> 'active'", [o.user_id]).catch(() => {});
  }
  if (old.length) await audit(null, 'applicant.purge', 'officer', null, { count: old.length });
  out.purged = old.length;
  // Uploads that never became an application
  const orphans = await q("DELETE FROM apply_uploads u WHERE created_at < now() - interval '1 day' RETURNING key");
  for (const u of orphans) {
    if (!(await one('SELECT 1 FROM documents WHERE s3_key = $1', [u.key]))) await deleteObject(u.key).catch(() => {});
  }
  return out;
}

export const actions = {
  'apply.uploadUrl': pub(async (b, ctx) => {
    const ip = ipOf(ctx);
    if (!KINDS[b.kind]) fail(400, 'Unknown file');
    if (!FILE_TYPES.test(String(b.content_type || ''))) fail(400, 'Please upload a PDF, Word document or photo');
    const { n } = await one("SELECT count(*)::int AS n FROM apply_uploads WHERE ip = $1 AND created_at > now() - interval '1 hour'", [ip]);
    if (n >= 15) fail(429, 'Too many uploads — please try again later');
    const r = await uploadUrl('apply', b.filename, b.content_type);
    await q('INSERT INTO apply_uploads (key, ip, kind) VALUES ($1,$2,$3)', [r.key, ip, b.kind]);
    return r;
  }),

  'apply.submit': pub(async (b, ctx) => {
    const ip = ipOf(ctx);
    if (b.website) return { ok: true }; // honeypot: bots fill every field
    const a = cleanApplication(b);
    if (a.error) fail(400, a.error);
    const { n } = await one("SELECT count(*)::int AS n FROM applications WHERE ip = $1 AND created_at > now() - interval '1 hour'", [ip]);
    if (n >= 5) fail(429, 'Too many applications — please try again later');
    // Every file must be one this visitor uploaded just now, and within the size limit
    const files = [['cv', a.cv_key], ['sia_front', a.sia_front_key], ['sia_back', a.sia_back_key]].filter(([, k]) => k);
    for (const [kind, key] of files) {
      if (!(await one("SELECT 1 FROM apply_uploads WHERE key = $1 AND ip = $2 AND kind = $3 AND created_at > now() - interval '2 hours'", [key, ip, kind]))) fail(400, 'Please upload your files again');
      const h = await headObject(key);
      if (!h) fail(400, 'Please upload your files again');
      if (h.size > MAX_FILE) fail(400, `${KINDS[kind]} must be under 10 MB`);
      files.find((f) => f[0] === kind)[2] = h.mime;
    }
    const token = newToken();
    const { id, repeat } = await tx(async (t) => {
      // One open application per person: a repeat (same email or SIA number) updates it instead of adding another
      const prev = await t.one(
        `SELECT o.id FROM officers o JOIN applications ap ON ap.officer_id = o.id
          WHERE o.status = 'applicant' AND (lower(o.email) = $1 OR ($2 <> '' AND regexp_replace(coalesce(o.sia_number, ''), '\\D', '', 'g') = $2))
          ORDER BY ap.created_at DESC LIMIT 1`, [a.email, a.sia_number]);
      const fields = [a.first_name, a.last_name, a.email, a.phone, a.postcode, a.sia_number || null, a.roles];
      let officerId = prev?.id;
      if (officerId) {
        await t.q('UPDATE officers SET first_name = $2, last_name = $3, email = $4, phone = $5, postcode = $6, sia_number = coalesce($7, sia_number), roles = $8 WHERE id = $1', [officerId, ...fields]);
      } else {
        officerId = (await t.one(
          "INSERT INTO officers (first_name, last_name, email, phone, postcode, sia_number, roles, status) VALUES ($1,$2,$3,$4,$5,$6,$7,'applicant') RETURNING id", fields)).id;
        await seedOnboarding(t, officerId);
      }
      await t.q(
        `INSERT INTO applications (officer_id, roles, availability, availability_note, rtw_confirmed, consent_at, ip, read_token, ai_status)
         VALUES ($1,$2,$3,$4,$5,now(),$6,$7,'pending')
         ON CONFLICT (officer_id) DO UPDATE SET roles = $2, availability = $3, availability_note = $4, rtw_confirmed = $5, consent_at = now(),
           ip = $6, read_token = $7, ai_status = 'pending', ai = NULL, ai_error = NULL, seen_at = NULL, updated_at = now()`,
        [officerId, a.roles, a.availability, a.availability_note, a.rtw, ip, hashToken(token)]);
      return { id: officerId, repeat: !!prev };
    });
    if (repeat) await dropFiles(id, ['cv', 'sia']);
    for (const [kind, key, mime] of files) {
      await q("INSERT INTO documents (owner_type, owner_id, kind, title, number, s3_key, mime) VALUES ('officer',$1,$2,$3,$4,$5,$6)",
        [id, kind === 'cv' ? 'cv' : 'sia', KINDS[kind], kind === 'sia_front' ? a.sia_number || null : null, key, mime || null]);
    }
    await q('DELETE FROM apply_uploads WHERE key = ANY($1)', [files.map((f) => f[1])]);
    if (files.some((f) => f[0] === 'sia_front')) await tickOnboarding(id, 'sia');
    const name = `${a.first_name} ${a.last_name}`;
    await notify(await companyManagers(), {
      kind: 'applicant', title: `${repeat ? 'Updated application' : 'New application'} from ${name} — ${roleText(a.roles)}`,
      body: 'AI is reading the CV and SIA badge. Review it in Recruitment.', link: `/company/recruitment?applicant=${id}`, email: true,
    });
    const brand = await getBrand();
    await sendRawEmail(a.email, `We've got your application — ${brand.name}`, await emailHtml(
      `Thank you, ${esc(a.first_name)}`,
      `We've received your application to join ${esc(brand.name)} as ${esc(roleText(a.roles).toLowerCase())}. Our team will review it and be in touch. If your details change, you can simply apply again with the same email address.`,
      '/apply', 'View the application page'));
    await audit(null, repeat ? 'applicant.update' : 'applicant.apply', 'officer', id, { roles: a.roles, ip });
    return { ok: true, read_token: token };
  }),

  // The Apply page starts the AI read right after the thank-you screen shows; one use per token
  'apply.read': pub(async (b) => {
    if (!b.token) return { ok: false };
    const a = await one("UPDATE applications SET read_token = NULL WHERE read_token = $1 AND ai_status = 'pending' RETURNING officer_id", [hashToken(b.token)]);
    if (!a) return { ok: false };
    await readApplication(a.officer_id);
    return { ok: true };
  }),

  'apply.get': def(CO, async (b) => {
    required(b, 'officer_id');
    const o = need(await getApplication(b.officer_id), 'Application not found');
    await q('UPDATE applications SET seen_at = coalesce(seen_at, now()) WHERE officer_id = $1', [o.id]);
    const [roles, duplicates, docs] = await Promise.all([
      rolesFor(o.applied_roles), findDuplicates(o),
      q("SELECT id, kind, title, mime, created_at FROM documents WHERE owner_type = 'officer' AND owner_id = $1 ORDER BY kind, title", [o.id]),
    ]);
    const flags = applicationFlags({ applicant: o, application: o, roles, today: londonDate(new Date()), duplicates });
    return {
      id: o.id, first_name: o.first_name, last_name: o.last_name, email: o.email, phone: o.phone, postcode: o.postcode,
      status: o.status, sia_number: o.sia_number, roles: o.applied_roles, role_names: roles.map((r) => r.name),
      availability: o.availability, availability_note: o.availability_note, rtw_confirmed: o.rtw_confirmed,
      applied_at: o.applied_at, updated_at: o.application_updated, has_login: !!o.user_id,
      ai: o.ai, ai_status: o.ai_status, ai_error: o.ai_error, ai_at: o.ai_at,
      sia_checked_at: o.sia_checked_at, sia_checked_by: o.sia_checked_by_name, rejected_at: o.rejected_at,
      flags, duplicates, docs,
    };
  }),

  'apply.reread': def(CO, async (b, { user }) => {
    required(b, 'officer_id');
    need(await one("UPDATE applications SET ai_status = 'pending', updated_at = now() WHERE officer_id = $1 RETURNING 1", [b.officer_id]), 'Application not found');
    const r = await readApplication(b.officer_id);
    await audit(user, 'applicant.reread', 'officer', b.officer_id, { result: r });
    return { ok: r === 'done' };
  }),

  'apply.siaChecked': def(CO, async (b, { user }) => {
    required(b, 'officer_id');
    need(await one(
      'UPDATE applications SET sia_checked_by = $2, sia_checked_at = CASE WHEN $3 THEN NULL ELSE now() END, updated_at = now() WHERE officer_id = $1 RETURNING 1',
      [b.officer_id, b.undo ? null : user.id, !!b.undo]), 'Application not found');
    await audit(user, 'applicant.sia_checked', 'officer', b.officer_id, { undo: !!b.undo });
    return { ok: true };
  }),

  'apply.invite': def(CO, async (b, { user }) => {
    required(b, 'officer_id');
    const o = need(await getApplication(b.officer_id), 'Application not found');
    if (!['applicant', 'rejected'].includes(o.status)) fail(409, 'Already moved on from Applicants');
    const badge = o.ai?.badge?.readable !== false ? o.ai?.badge || {} : {};
    await tx(async (t) => {
      await t.q(
        `UPDATE officers SET status = 'onboarding',
           sia_number = coalesce(sia_number, nullif($2, '')), sia_type = coalesce(sia_type, nullif($3, '')), sia_expiry = coalesce(sia_expiry, nullif($4, '')::date)
         WHERE id = $1`, [o.id, badge.number || '', badge.licence_types?.[0] || '', badge.expiry || '']);
      await t.q('UPDATE applications SET rejected_at = NULL, updated_at = now() WHERE officer_id = $1', [o.id]);
    });
    // The login invite can fail on its own (e.g. the email already signs in); they stay in onboarding either way
    let invite_link = null;
    let invite_error = null;
    if (!o.user_id && o.email) {
      try { invite_link = await (await import('./officers.mjs')).inviteOfficerLogin(o.id); } catch (e) { invite_error = e.message; }
    }
    await audit(user, 'applicant.invite', 'officer', o.id, { invite: !!invite_link });
    return { ok: true, invite_link, invite_error };
  }),

  'apply.reject': def(CO, async (b, { user }) => {
    required(b, 'officer_id');
    const o = need(await getApplication(b.officer_id), 'Application not found');
    if (o.status !== 'applicant') fail(409, 'Only applicants can be rejected');
    await q("UPDATE officers SET status = 'rejected' WHERE id = $1", [o.id]);
    await q('UPDATE applications SET rejected_at = now(), updated_at = now() WHERE officer_id = $1', [o.id]);
    let emailed = false;
    if (b.email && o.email) {
      const brand = await getBrand();
      emailed = await sendRawEmail(o.email, `Your application to ${brand.name}`, await emailHtml(
        `Thank you, ${esc(o.first_name)}`,
        `Thank you for applying to ${esc(brand.name)} and for your interest in working with us. We've reviewed your application and we're not able to offer you a role at this time. We'll keep your details for 6 months, after which they are deleted. We wish you every success.`,
        '/apply', 'Apply again later'));
    }
    await audit(user, 'applicant.reject', 'officer', o.id, { email: emailed });
    return { ok: true, emailed };
  }),
};
