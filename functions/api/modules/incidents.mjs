import { one, q, tx } from '../lib/db.mjs';
import { fail, required, need } from '../lib/http.mjs';
import { venueScope, assertVenue } from '../lib/scope.mjs';
import { deleteObject, downloadUrl, getObjectBytes, headObject } from '../lib/storage.mjs';
import { notify, managersFor, venueContacts, officerUser } from '../lib/notify.mjs';
import { fmtDateTime } from '../lib/time.mjs';
import { Doc } from '../lib/pdf.mjs';
import { audit } from '../lib/audit.mjs';
import { getSettings } from './settings.mjs';
import { ALL, MGR, def } from './_def.mjs';
import { summarySig } from './incidentAi.mjs';
import { officerName, userName } from '../lib/names.mjs';
import { cleanDraft, draftProgress } from '../lib/incidentDrafts.mjs';

export const TYPES = ['ejection', 'refused_entry', 'assault', 'theft', 'drugs', 'weapon', 'medical', 'damage', 'fire', 'disorder', 'lost_child', 'vulnerable_person', 'other'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const FIELDS = ['type', 'severity', 'occurred_at', 'location', 'description', 'people_involved', 'injuries', 'actions_taken',
  'force_used', 'force_justification', 'police_called', 'police_ref', 'ambulance_called', 'ambulance_ref'];

const BASE_SQL = `
  SELECT i.*, v.name AS venue_name, ${officerName('o')} AS officer_name, ${userName('ur')} AS reported_by_name, ${userName('uv')} AS reviewed_by_name,
         (SELECT count(*) FROM incident_attachments x WHERE x.incident_id = i.id AND x.removed_at IS NULL)::int AS attachment_count
    FROM incidents i JOIN venues v ON v.id = i.venue_id LEFT JOIN officers o ON o.id = i.officer_id
    LEFT JOIN users ur ON ur.id = i.reported_by LEFT JOIN users uv ON uv.id = i.reviewed_by`;

// Officers can file up to 30 days after a shift they worked; managers can file for any date
export const OFFICER_BACKDATE_DAYS = 30;
const DAY = 86400000;
// Whole days between the incident and the report, when it was filed more than a day later
export function lateDays(inc) {
  const gap = new Date(inc.created_at || Date.now()) - new Date(inc.occurred_at);
  return gap > DAY ? Math.floor(gap / DAY) : 0;
}
export const withinBackdate = (at, now = Date.now()) => now - new Date(at) <= OFFICER_BACKDATE_DAYS * DAY;

// The officer's shift around the incident time (2 hours either side), within the last 30 days
async function officerShift(officerId, shiftId, venueId, at) {
  if (!withinBackdate(at)) fail(400, `You can only report incidents from the last ${OFFICER_BACKDATE_DAYS} days. Ask the office to file anything older.`);
  const a = await one(
    `SELECT s.id, s.venue_id FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
      WHERE a.officer_id = $1 AND a.status IN ('assigned','accepted') AND ($2::uuid IS NULL OR s.id = $2) AND ($3::uuid IS NULL OR s.venue_id = $3)
        AND $4::timestamptz BETWEEN s.starts_at - interval '2 hours' AND s.ends_at + interval '2 hours'
        AND s.starts_at > now() - make_interval(days => $5)
      ORDER BY abs(extract(epoch FROM (s.starts_at - $4::timestamptz))) LIMIT 1`, [officerId, shiftId, venueId || null, at, OFFICER_BACKDATE_DAYS + 1]);
  if (!a) fail(400, `The time must be during a shift you worked in the last ${OFFICER_BACKDATE_DAYS} days (up to 2 hours either side). Ask the office for anything older.`);
  return a;
}

function validate(b) {
  if (b.type && !TYPES.includes(b.type)) fail(400, 'Unknown incident type');
  if (b.severity && !SEVERITIES.includes(b.severity)) fail(400, 'Unknown severity');
  if (b.force_used && !String(b.force_justification || '').trim()) fail(400, 'Explain why force was necessary');
  if (b.occurred_at && new Date(b.occurred_at) > new Date(Date.now() + 5 * 60000)) fail(400, 'Incident time cannot be in the future');
}

async function canSee(user, inc) {
  if (user.role === 'officer') {
    if (inc.officer_id !== user.officer_id) fail(403, 'Forbidden');
    return;
  }
  await assertVenue(user, inc.venue_id);
}

const pickFields = (b) => ({
  ...Object.fromEntries(FIELDS.filter((k) => b[k] !== undefined).map((k) => [k, b[k]])),
  ...(b.ai_assisted ? { ai_assisted: true } : {}),
});

async function saveWitnesses(t, incidentId, witnesses) {
  if (!Array.isArray(witnesses)) return;
  await t.q('DELETE FROM incident_witnesses WHERE incident_id = $1', [incidentId]);
  for (const w of witnesses.filter((x) => x?.name?.trim())) {
    await t.q('INSERT INTO incident_witnesses (incident_id, name, contact, statement) VALUES ($1,$2,$3,$4)', [incidentId, w.name.trim(), w.contact || '', w.statement || '']);
  }
}

export const MAX_ATTACHMENTS = 20;
export const MAX_BYTES = 15 * 1024 * 1024;
const DOC_MIMES = new Set(['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain']);
export const allowedMime = (m) => /^image\/(jpeg|png|webp|gif|heic|heif)$/.test(m || '') || DOC_MIMES.has(m);
// Fresh uploads land under the uploader's own incident folder (see files.uploadUrl)
export const ownUpload = (user, key) => String(key || '').startsWith(`docs/incidents/${user.id.slice(0, 8)}/`);

async function saveAttachments(t, incidentId, attachments, user) {
  const list = attachments || [];
  if (!list.length) return;
  const { n } = await t.one('SELECT count(*)::int AS n FROM incident_attachments WHERE incident_id = $1 AND removed_at IS NULL', [incidentId]);
  if (n + list.length > MAX_ATTACHMENTS) fail(400, `A report can hold up to ${MAX_ATTACHMENTS} photos and files`);
  for (const a of list) {
    if (!ownUpload(user, a?.key)) fail(400, 'Invalid attachment');
    const head = await headObject(a.key);
    if (!head) fail(400, `${a.name || 'A file'} did not finish uploading — try again`);
    const mime = a.mime || head.mime;
    if (!allowedMime(mime)) fail(400, `${a.name || 'This file'} is not a supported type (photos, PDF, Word or text)`);
    if (head.size > MAX_BYTES) fail(400, `${a.name || 'This file'} is over 15 MB`);
    await t.q('INSERT INTO incident_attachments (incident_id, s3_key, mime, name, uploaded_by, size_bytes) VALUES ($1,$2,$3,$4,$5,$6)',
      [incidentId, a.key, mime, a.name || '', user.id, head.size]);
  }
}

export async function loadFull(id) {
  const inc = need(await one(`${BASE_SQL} WHERE i.id = $1`, [id]));
  const [witnesses, attachments, versions] = await Promise.all([
    q('SELECT * FROM incident_witnesses WHERE incident_id = $1 ORDER BY name', [id]),
    q(`SELECT x.*, ${userName('u')} AS uploaded_by_name, ${userName('ur')} AS removed_by_name FROM incident_attachments x LEFT JOIN users u ON u.id = x.uploaded_by LEFT JOIN users ur ON ur.id = x.removed_by WHERE incident_id = $1 ORDER BY x.created_at`, [id]),
    q(`SELECT v.id, v.version, v.created_at, ${userName('u')} AS edited_by_name FROM incident_versions v LEFT JOIN users u ON u.id = v.edited_by WHERE incident_id = $1 ORDER BY version`, [id]),
  ]);
  return {
    ...inc, witnesses, versions, attachments: attachments.filter((a) => !a.removed_at),
    removed: attachments.filter((a) => a.removed_at).map(({ id: aid, name, removed_at, removed_by_name, uploaded_by_name }) => ({ id: aid, name, removed_at, removed_by_name, uploaded_by_name })),
  };
}

// A draft is private to its writer; deleting it also removes files that never reached a report, and its reminders
export async function dropDraft(id, userId) {
  const d = await one('DELETE FROM incident_drafts WHERE id = $1 AND ($2::uuid IS NULL OR user_id = $2) RETURNING attachments', [id, userId]);
  if (!d) return false;
  for (const a of d.attachments || []) await deleteObject(a.key).catch(() => {});
  await q('DELETE FROM notifications WHERE ref = $1', [`draft:${id}`]);
  return true;
}

const DRAFT_SQL = `
  SELECT d.id, d.step, d.version, d.updated_at, d.created_at, d.data, d.shift_id, s.starts_at AS shift_starts_at, s.ends_at AS shift_ends_at,
         COALESCE(v.name, mv.name) AS venue_name
    FROM incident_drafts d LEFT JOIN shifts s ON s.id = d.shift_id LEFT JOIN venues v ON v.id = COALESCE(d.venue_id, s.venue_id)
    LEFT JOIN venues mv ON mv.id = NULLIF(d.data->'manager'->>'venue_id', '')::uuid`;

export const actions = {
  'incidents.types': def(ALL, async () => ({ types: TYPES, severities: SEVERITIES })),

  'incidents.list': def(ALL, async (b, { user }) => {
    const scope = await venueScope(user);
    return q(
      `${BASE_SQL}
        WHERE ($1::uuid[] IS NULL OR i.venue_id = ANY($1)) AND ($2::uuid IS NULL OR i.officer_id = $2)
          AND ($3::text IS NULL OR i.status = $3) AND ($4::text IS NULL OR i.severity = $4) AND ($5::text IS NULL OR i.type = $5)
          AND ($6::uuid IS NULL OR i.venue_id = $6) AND ($7::timestamptz IS NULL OR i.occurred_at >= $7) AND ($8::timestamptz IS NULL OR i.occurred_at < $8)
          AND ($9::text IS NULL OR i.ref ILIKE $9 OR i.description ILIKE $9 OR i.location ILIKE $9 OR i.police_ref ILIKE $9)
        ORDER BY ${b.sort === 'reported' ? 'i.created_at' : 'i.occurred_at'} DESC LIMIT $10`,
      [user.role === 'officer' ? null : scope, user.role === 'officer' ? user.officer_id : b.officer_id || null, b.status || null, b.severity || null, b.type || null,
        b.venue_id || null, b.from || null, b.to || null, b.search ? `%${b.search}%` : null, Math.min(Number(b.limit) || 200, 500)]);
  }),

  'incidents.get': def(ALL, async (b, { user }) => {
    const inc = await loadFull(b.id);
    await canSee(user, inc);
    for (const a of inc.attachments) {
      a.url = await downloadUrl(a.s3_key, a.name);
      a.can_remove = user.role === 'company' || (a.uploaded_by === user.id && inc.status !== 'closed');
    }
    if (user.role === 'venue') inc.witnesses = inc.witnesses.map(({ contact, ...w }) => w);
    if (MGR.includes(user.role)) inc.ai_summary_stale = !!inc.ai_summary && inc.ai_summary_sig !== summarySig(inc);
    else { delete inc.ai_summary; delete inc.ai_summary_sig; }
    return inc;
  }),

  'incidents.version': def(MGR, async (b, { user }) => {
    const v = need(await one('SELECT v.*, i.venue_id FROM incident_versions v JOIN incidents i ON i.id = v.incident_id WHERE v.id = $1', [b.id]));
    await assertVenue(user, v.venue_id);
    return v;
  }),

  // Drafts: half-written reports saved as the writer goes, seen by nobody else until they submit
  'incidents.drafts': def(['officer', 'company', 'security'], async (b, { user }) => {
    const rows = await q(`${DRAFT_SQL} WHERE d.user_id = $1 ORDER BY d.updated_at DESC LIMIT 50`, [user.id]);
    return rows.map(({ data, ...d }) => ({ ...d, type: data.type || null, shift_id: d.shift_id || data.shift_id || null, manager: !!data.manager, progress: draftProgress(data) }));
  }),

  'incidents.draftGet': def(['officer', 'company', 'security'], async (b, { user }) => {
    required(b, 'id');
    const d = need(await one(`${DRAFT_SQL.replace('SELECT d.id,', 'SELECT d.attachments, d.id,')} WHERE d.id = $1 AND d.user_id = $2`, [b.id, user.id]), 'This draft has been submitted or deleted');
    for (const a of d.attachments) a.url = await downloadUrl(a.key, a.name).catch(() => null);
    return d;
  }),

  'incidents.draftSave': def(['officer', 'company', 'security'], async (b, { user }) => {
    const data = cleanDraft(b.data);
    const files = (Array.isArray(b.attachments) ? b.attachments : []).map((a) => ({ key: String(a?.key || ''), mime: String(a?.mime || ''), name: String(a?.name || '').slice(0, 200) }));
    if (files.length > MAX_ATTACHMENTS) fail(400, `A report can hold up to ${MAX_ATTACHMENTS} photos and files`);
    if (files.some((a) => !ownUpload(user, a.key))) fail(400, 'Invalid attachment');
    const step = Math.max(0, Math.min(10, Number(b.step) || 0));
    const shiftId = data.shift_id || data.manager?.shift_id || null;
    // An officer's draft only links to a shift they are on; a manager's to any shift in their venues (checked again at submit)
    const sh = shiftId ? await one(
      `SELECT s.id, s.venue_id FROM shifts s WHERE s.id = $1 AND ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM shift_assignments a WHERE a.shift_id = s.id AND a.officer_id = $2))`,
      [shiftId, user.role === 'officer' ? user.officer_id : null]) : null;
    const venueId = sh?.venue_id || data.manager?.venue_id || null;
    const args = [user.id, sh?.id || null, venueId, JSON.stringify(data), JSON.stringify(files), step];
    if (!b.id) {
      return one(`INSERT INTO incident_drafts (user_id, shift_id, venue_id, data, attachments, step) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, version, updated_at`, args);
    }
    // Each reminder is sent once; an edit only restarts the 30-day clock and its warning
    const row = await one(
      `UPDATE incident_drafts SET shift_id = $2, venue_id = $3, data = $4, attachments = $5, step = $6, version = version + 1, updated_at = now(), warned_expiry = false
        WHERE id = $7 AND user_id = $1 AND ($8::int IS NULL OR version = $8) RETURNING id, version, updated_at`, [...args, b.id, b.version ?? null]);
    if (row) return row;
    const cur = need(await one(`${DRAFT_SQL.replace('SELECT d.id,', 'SELECT d.attachments, d.id,')} WHERE d.id = $1 AND d.user_id = $2`, [b.id, user.id]), 'This draft has been submitted or deleted');
    fail(409, 'This draft was updated on another device', { draft: cur });
  }),

  'incidents.draftDelete': def(['officer', 'company', 'security'], async (b, { user }) => {
    required(b, 'id');
    need(await dropDraft(b.id, user.id), 'This draft has been submitted or deleted');
    return { ok: true };
  }),

  // Officers report from their shift; managers can file on behalf of an officer.
  'incidents.create': def(['officer', 'company', 'security'], async (b, { user }) => {
    required(b, 'type', 'severity', 'occurred_at', 'description');
    validate(b);
    let venueId = b.venue_id;
    let officerId = user.role === 'officer' ? user.officer_id : b.officer_id || null;
    let shiftId = b.shift_id || null;
    if (user.role === 'officer') {
      if (!officerId) fail(403, 'Officer profile not linked');
      // Reports start from the shift card
      if (!shiftId) fail(400, 'Open the shift and report from there');
      // Officer must be (or have been) rostered at the venue around the incident time
      const a = await officerShift(officerId, shiftId, venueId, b.occurred_at);
      venueId = a.venue_id;
      shiftId = a.id;
    } else {
      // Managers can file for any past date; a shift and officer are optional but must match the venue
      if (shiftId) {
        const sh = need(await one('SELECT id, venue_id FROM shifts WHERE id = $1', [shiftId]), 'Shift not found');
        if (venueId && venueId !== sh.venue_id) fail(400, 'That shift is at a different venue');
        venueId = sh.venue_id;
      }
      if (!venueId) fail(400, 'Choose the venue');
      await assertVenue(user, venueId);
      if (officerId) {
        const ok = shiftId
          ? await one("SELECT 1 FROM shift_assignments WHERE shift_id = $1 AND officer_id = $2 AND status IN ('assigned','accepted')", [shiftId, officerId])
          : await one('SELECT 1 FROM officers WHERE id = $1', [officerId]);
        if (!ok) fail(400, shiftId ? 'That officer was not on this shift' : 'Officer not found');
      }
    }
    // Written up from a shift log note: the report and the note point at each other
    const entry = b.log_entry_id ? need(await one('SELECT id, shift_id FROM shift_log_entries WHERE id = $1 AND shift_id = $2', [b.log_entry_id, shiftId]), 'That log note is not on this shift') : null;
    const inc = await tx(async (t) => {
      const f = pickFields(b);
      if (entry) f.log_entry_id = entry.id;
      const cols = ['venue_id', 'shift_id', 'officer_id', 'reported_by', ...Object.keys(f)];
      const vals = [venueId, shiftId, officerId, user.id, ...Object.values(f)];
      const row = await t.one(`INSERT INTO incidents (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')}) RETURNING *`, vals);
      await saveWitnesses(t, row.id, b.witnesses);
      await saveAttachments(t, row.id, b.attachments, user);
      if (entry) await t.q("UPDATE shift_log_entries SET incident_id = $2, kind = 'incident', updated_at = now() WHERE id = $1", [entry.id, row.id]);
      await t.q('INSERT INTO incident_versions (incident_id, version, data, edited_by) VALUES ($1,1,$2,$3)', [row.id, JSON.stringify({ ...f, witnesses: b.witnesses || [] }), user.id]);
      // The draft it was written from is done; its files now belong to the report
      if (b.draft_id) await t.q('DELETE FROM incident_drafts WHERE id = $1 AND user_id = $2', [b.draft_id, user.id]);
      return row;
    });
    if (b.draft_id) await q('DELETE FROM notifications WHERE ref = $1', [`draft:${b.draft_id}`]);
    const v = await one('SELECT name FROM venues WHERE id = $1', [venueId]);
    // A report filed a week or more after the event is a record, not an alert
    const late = lateDays(inc);
    const urgent = ['high', 'critical'].includes(inc.severity) && late < 7;
    const msg = { kind: 'incident', severity: urgent ? 'critical' : 'info', title: `${urgent ? `${inc.severity.toUpperCase()} incident` : 'New incident'} · ${v.name}`,
      body: `${inc.ref}: ${inc.type.replace(/_/g, ' ')} at ${fmtDateTime(inc.occurred_at)}${inc.location ? ` — ${inc.location}` : ''}${late ? ` · reported ${late} day${late > 1 ? 's' : ''} later` : ''}`, email: urgent };
    await notify((await managersFor(venueId)).filter((id) => id !== user.id), { ...msg, link: `/company/incidents/${inc.id}` });
    if (urgent) await notify(await venueContacts(venueId), { ...msg, link: `/venue/incidents/${inc.id}` });
    await audit(user, 'incident.create', 'incident', inc.id, { ref: inc.ref, severity: inc.severity });
    return inc;
  }),

  // Edits keep the original: each save stores a full snapshot in incident_versions.
  'incidents.update': def(['officer', 'company', 'security'], async (b, { user }) => {
    required(b, 'id');
    validate(b);
    const cur = await loadFull(b.id);
    await canSee(user, cur);
    if (user.role === 'officer' && cur.status !== 'changes_requested' && cur.reported_by !== user.id) fail(403, 'This report can no longer be edited');
    if (user.role === 'officer' && cur.status === 'closed') fail(400, 'This report is closed');
    if (user.role === 'officer' && b.occurred_at && new Date(b.occurred_at).getTime() !== new Date(cur.occurred_at).getTime()) {
      await officerShift(user.officer_id, cur.shift_id, cur.venue_id, b.occurred_at);
    }
    const f = pickFields(b);
    const inc = await tx(async (t) => {
      const keys = Object.keys(f);
      const sets = keys.map((k, i) => `${k} = $${i + 2}`);
      const status = user.role === 'officer' && cur.status === 'changes_requested' ? 'submitted' : cur.status;
      const row = await t.one(
        `UPDATE incidents SET ${[...sets, `version = version + 1`, `updated_at = now()`, `status = $${keys.length + 2}`].join(', ')} WHERE id = $1 RETURNING *`,
        [b.id, ...Object.values(f), status]);
      await saveWitnesses(t, row.id, b.witnesses);
      await saveAttachments(t, row.id, b.attachments, user);
      const witnesses = b.witnesses || cur.witnesses.map(({ name, contact, statement }) => ({ name, contact, statement }));
      const snapshot = Object.fromEntries(FIELDS.map((k) => [k, row[k]]));
      await t.q('INSERT INTO incident_versions (incident_id, version, data, edited_by) VALUES ($1,$2,$3,$4)', [row.id, row.version, JSON.stringify({ ...snapshot, witnesses }), user.id]);
      return row;
    });
    if (user.role === 'officer' && cur.status === 'changes_requested') {
      await notify(await managersFor(inc.venue_id), { kind: 'incident', title: `Incident ${inc.ref} resubmitted`, body: 'The officer has updated the report.', link: `/company/incidents/${inc.id}` });
    }
    await audit(user, 'incident.update', 'incident', inc.id, { version: inc.version, fields: Object.keys(f) });
    return inc;
  }),

  'incidents.addAttachments': def(['officer', 'company', 'security'], async (b, { user }) => {
    required(b, 'id', 'attachments');
    const inc = need(await one('SELECT * FROM incidents WHERE id = $1', [b.id]));
    await canSee(user, inc);
    if (inc.status === 'closed' && user.role === 'officer') fail(400, 'This report is closed');
    await tx((t) => saveAttachments(t, inc.id, b.attachments, user));
    await audit(user, 'incident.attach', 'incident', inc.id, { count: b.attachments.length });
    return { ok: true };
  }),

  // Soft delete so the report history shows what was removed and by whom
  'incidents.removeAttachment': def(['officer', 'company', 'security'], async (b, { user }) => {
    required(b, 'id');
    const a = need(await one('SELECT x.*, i.status, i.venue_id, i.officer_id FROM incident_attachments x JOIN incidents i ON i.id = x.incident_id WHERE x.id = $1 AND x.removed_at IS NULL', [b.id]));
    await canSee(user, a);
    if (user.role !== 'company') {
      if (a.uploaded_by !== user.id) fail(403, 'Only the person who added this file or a company manager can remove it');
      if (a.status === 'closed') fail(400, 'This report is closed');
    }
    await q('UPDATE incident_attachments SET removed_at = now(), removed_by = $2 WHERE id = $1', [a.id, user.id]);
    await audit(user, 'incident.attachment_remove', 'incident', a.incident_id, { name: a.name });
    return { ok: true };
  }),

  // Manager review: close, or send back to the officer for more detail
  'incidents.review': def(MGR, async (b, { user }) => {
    required(b, 'id', 'decision');
    if (!['close', 'changes_requested', 'reopen'].includes(b.decision)) fail(400, 'Invalid decision');
    if (b.decision === 'changes_requested' && !b.comment) fail(400, 'Say what needs changing');
    const cur = need(await one('SELECT * FROM incidents WHERE id = $1', [b.id]));
    await assertVenue(user, cur.venue_id);
    const status = { close: 'closed', changes_requested: 'changes_requested', reopen: 'submitted' }[b.decision];
    const inc = await one('UPDATE incidents SET status = $2, review_comment = $3, reviewed_by = $4, reviewed_at = now(), updated_at = now() WHERE id = $1 RETURNING *',
      [b.id, status, b.comment || '', user.id]);
    if (inc.officer_id && b.decision === 'changes_requested') {
      await notify(await officerUser(inc.officer_id), { kind: 'incident', severity: 'warning', title: `More detail needed on ${inc.ref}`, body: b.comment, link: `/officer/incidents/${inc.id}`, email: true });
    }
    await audit(user, `incident.${b.decision}`, 'incident', inc.id, { comment: b.comment });
    return inc;
  }),

  'incidents.pdf': def(ALL, async (b, { user }) => {
    const inc = await loadFull(b.id);
    await canSee(user, inc);
    const s = await getSettings();
    const d = await Doc.create(`Incident ${inc.ref}`);
    await d.header(s, 'Incident report', `${inc.ref} · v${inc.version}`);
    const yn = (v, ref) => (v ? `Yes${ref ? ` (ref ${ref})` : ''}` : 'No');
    d.meta(
      [['Venue', inc.venue_name], ['Type', inc.type.replace(/_/g, ' ')], ['Severity', inc.severity.toUpperCase()], ['Location', inc.location || '-']],
      [['Occurred', fmtDateTime(inc.occurred_at)], ['Reported', `${fmtDateTime(inc.created_at)}${lateDays(inc) ? ` (${lateDays(inc)} days later)` : ''}`],
        ['Officer', inc.officer_name || '-'], ['Reported by', inc.reported_by_name || '-'], ['Status', inc.status.replace(/_/g, ' ')]],
    );
    const block = (title, body) => { if (body) { d.section(title); d.text(body, { size: 10 }); d.space(4); } };
    block('What happened', inc.description);
    block('People involved', inc.people_involved);
    block('Injuries', inc.injuries);
    block('Actions taken', inc.actions_taken);
    d.section('Emergency services & force');
    d.table([{ label: 'Item', width: 0.4 }, { label: 'Detail', width: 0.6 }], [
      ['Police called', yn(inc.police_called, inc.police_ref)],
      ['Ambulance called', yn(inc.ambulance_called, inc.ambulance_ref)],
      ['Force used', inc.force_used ? 'Yes' : 'No'],
    ]);
    if (inc.force_used) block('Justification for force', inc.force_justification);
    if (inc.witnesses.length) {
      d.section('Witnesses');
      d.table([{ label: 'Name', width: 0.25 }, { label: 'Contact', width: 0.25 }, { label: 'Statement', width: 0.5 }],
        inc.witnesses.map((w) => [w.name, user.role === 'venue' ? '-' : w.contact, w.statement]));
    }
    const images = inc.attachments.filter((a) => a.mime === 'image/png' || a.mime === 'image/jpeg').slice(0, 6);
    if (images.length) {
      d.section('Photos');
      for (const a of images) {
        try {
          const bytes = await getObjectBytes(a.s3_key);
          if (a.mime === 'image/png') await d.image(bytes, { width: 240 });
          else {
            const img = await d.pdf.embedJpg(bytes);
            const h = (img.height / img.width) * 240;
            d.ensure(h + 6);
            d.page.drawImage(img, { x: d.x, y: d.y - h, width: 240, height: h });
            d.y -= h + 6;
          }
        } catch { /* skip unreadable image */ }
      }
    }
    const others = inc.attachments.filter((a) => !images.includes(a));
    if (others.length) {
      d.section('Other attachments');
      d.text(others.map((a) => `• ${a.name || 'file'}${a.uploaded_by_name ? ` (added by ${a.uploaded_by_name})` : ''}`).join('\n'), { size: 10 });
      d.space(4);
    }
    if (inc.review_comment) block('Review', `${inc.reviewed_by_name || ''}: ${inc.review_comment}`);
    d.footer(`${s.company_name} · ${inc.ref} · version ${inc.version} · generated ${fmtDateTime(new Date())}`);
    return { filename: `${inc.ref}.pdf`, pdf: await d.base64() };
  }),

  'reports.incidents': def(['company', 'security', 'venue'], async (b, { user }) => {
    required(b, 'from', 'to');
    const scope = await venueScope(user);
    const p = [scope, b.from, b.to, b.venue_id || null];
    const where = `($1::uuid[] IS NULL OR i.venue_id = ANY($1)) AND i.occurred_at >= $2 AND i.occurred_at < $3::date + 1 AND ($4::uuid IS NULL OR i.venue_id = $4)`;
    const [byType, bySeverity, byWeek, byVenue, byHour] = await Promise.all([
      q(`SELECT type, count(*)::int AS n FROM incidents i WHERE ${where} GROUP BY 1 ORDER BY 2 DESC`, p),
      q(`SELECT severity, count(*)::int AS n FROM incidents i WHERE ${where} GROUP BY 1`, p),
      q(`SELECT to_char(date_trunc('week', i.occurred_at AT TIME ZONE 'Europe/London'), 'YYYY-MM-DD') AS week, count(*)::int AS n FROM incidents i WHERE ${where} GROUP BY 1 ORDER BY 1`, p),
      q(`SELECT v.name AS venue_name, count(*)::int AS n FROM incidents i JOIN venues v ON v.id = i.venue_id WHERE ${where} GROUP BY 1 ORDER BY 2 DESC`, p),
      q(`SELECT extract(hour FROM i.occurred_at AT TIME ZONE 'Europe/London')::int AS hour, count(*)::int AS n FROM incidents i WHERE ${where} GROUP BY 1 ORDER BY 1`, p),
    ]);
    return { byType, bySeverity, byWeek, byVenue, byHour };
  }),
};

// Close several reviewed reports at once (the Incidents list's selection), each through the single review and its venue check
actions['incidents.reviewMany'] = def(MGR, async (b, ctx) => {
  required(b, 'ids');
  let done = 0;
  const skipped = [];
  for (const id of [].concat(b.ids).slice(0, 200)) {
    try { await actions['incidents.review'].fn({ id, decision: 'close' }, ctx); done++; } catch (e) { skipped.push({ id, error: e.message }); }
  }
  return { done, skipped };
});
