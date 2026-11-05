// Venue packs: assignment instructions and procedures (AI drafts, a manager publishes), which officers
// read, tick and sign before they can clock in at a venue. The signings form each venue's register.
import { one, q, tx } from '../lib/db.mjs';
import { fail, need, required } from '../lib/http.mjs';
import { audit } from '../lib/audit.mjs';
import { extract, fileBlock, canRead, SONNET } from '../lib/ai.mjs';
import { docxToMarkup } from '../lib/docx.mjs';
import { getObjectBytes } from '../lib/storage.mjs';
import { parse } from '../lib/docmarkup.mjs';
import { assertVenue, venueScope, assertOfficerAccess } from '../lib/scope.mjs';
import { notify, managersFor, officerUser } from '../lib/notify.mjs';
import { nextReference, event, uaOf, sealQuietly, pdfFor } from '../lib/esign.mjs';
import { Doc } from '../lib/pdf.mjs';
import { fmtDate, fmtDateTime } from '../lib/time.mjs';
import { packFor, packsFor, statusesFor, statusFor, pairKey, OK, STATUS_LABEL } from '../lib/venuePack.mjs';
import { getSettings } from './settings.mjs';
import { CO, MGR, def } from './_def.mjs';

const VIEW = ['company', 'security', 'venue'];
const PNG = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const BOOKED = "a.status IN ('assigned','accepted') AND s.status = 'published'";
const packLink = (venueId) => `/officer/venue-pack/${venueId}`;
const clip = (s, n) => String(s ?? '').trim().slice(0, n);
const officerName = (o) => `${o.first_name} ${o.last_name}`.trim();

// ---- Access ----

async function procedure(id) {
  return need(await one(`SELECT p.*, v.name AS venue_name FROM procedures p LEFT JOIN venues v ON v.id = p.venue_id WHERE p.id = $1`, [id]), 'Document not found');
}

/** General procedures are company-wide: only company managers change them. Venue documents follow venue access. */
async function canEdit(user, p) {
  if (p.scope === 'general') { if (user.role !== 'company') fail(403, 'Only company managers can change general procedures'); return; }
  await assertVenue(user, p.venue_id);
}

async function canView(user, p) {
  if (p.scope === 'venue') await assertVenue(user, p.venue_id);
}

/** An officer sees a venue's pack once they have been booked there (or have signed it before). */
async function officerAtVenue(officerId, venueId) {
  const r = await one(`SELECT 1 FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id WHERE a.officer_id = $1 AND s.venue_id = $2 AND ${BOOKED}
    UNION ALL SELECT 1 FROM pack_signings WHERE officer_id = $1 AND venue_id = $2 LIMIT 1`, [officerId, venueId]);
  if (!r) fail(403, 'You are not booked at this venue');
}

// ---- Where a document applies ----

/** Venues a procedure is part of (venue documents: their venue; general: all active venues unless switched off, or the chosen ones). */
async function venuesOf(p) {
  if (p.scope === 'venue') return q('SELECT id, name FROM venues WHERE id = $1', [p.venue_id]);
  return q(`SELECT v.id, v.name FROM venues v LEFT JOIN procedure_venues pv ON pv.procedure_id = $1 AND pv.venue_id = v.id
    WHERE v.active AND (CASE WHEN $2 THEN NOT COALESCE(pv.excluded, false) ELSE pv.venue_id IS NOT NULL AND NOT pv.excluded END) ORDER BY v.name`, [p.id, p.applies_all]);
}

/** Officers booked from now on at these venues: [{ officer_id, venue_id }] */
const bookedPairs = (venueIds, days = 365) => q(`SELECT DISTINCT a.officer_id, s.venue_id FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
  WHERE s.venue_id = ANY($1::uuid[]) AND ${BOOKED} AND s.ends_at > now() AND s.starts_at < now() + make_interval(days => $2)`, [venueIds, days]);

/** After a real change (or a new document in a pack): tell booked officers who now need to sign again. */
export async function notifyResign(p, venueIds = null) {
  const ids = venueIds || (await venuesOf(p)).map((v) => v.id);
  if (!ids.length) return 0;
  const pairs = await bookedPairs(ids);
  const st = await statusesFor(pairs);
  const names = new Map((await q('SELECT id, name FROM venues WHERE id = ANY($1::uuid[])', [ids])).map((v) => [v.id, v.name]));
  let n = 0;
  for (const pr of pairs) {
    const s = st.get(pairKey(pr.officer_id, pr.venue_id));
    if (!s || OK.has(s.status)) continue;
    n += 1;
    await notify(await officerUser(pr.officer_id), {
      kind: 'venue_pack', severity: 'warning', link: packLink(pr.venue_id), email: true,
      title: `${names.get(pr.venue_id)}: please read and sign the updated site pack`,
      body: 'The instructions or procedures for this venue have changed. Read and sign them in the app before your next clock-in.',
      dedupe: `pack-resign:${p.id}:${p.current_version}:${pr.venue_id}`,
    });
  }
  return n;
}

// ---- Reminders ----

const REMINDER_TEXT = {
  booked: (v) => [`Before your first shift at ${v}: read and sign the site pack`, 'You can do it now in the app. You will not be able to clock in until it is signed.'],
  day: (v) => [`Tomorrow at ${v}: your site pack is not signed yet`, 'Read and sign it in the app before you arrive, so clock-in is not held up.'],
  '2h': (v) => [`${v} soon: sign the site pack before clock-in`, 'Clock-in stays blocked until the site pack is read and signed.'],
};

/** Claim one reminder per booking and kind; sent only when the officer's pack for that venue is not up to date. */
async function sendReminders(rows, kind) {
  if (!rows.length) return 0;
  const st = await statusesFor(rows.map((r) => ({ officer_id: r.officer_id, venue_id: r.venue_id })));
  let sent = 0;
  for (const r of rows) {
    const claimed = await one('INSERT INTO pack_reminders (assignment_id, kind) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING sent_at', [r.id, kind]);
    if (!claimed) continue;
    const s = st.get(pairKey(r.officer_id, r.venue_id));
    if (!s || OK.has(s.status)) continue;
    // One nudge an hour is enough, e.g. a booking made the evening before
    if (kind !== 'booked' && await one("SELECT 1 FROM pack_reminders WHERE assignment_id = $1 AND kind <> $2 AND sent_at > now() - interval '60 minutes'", [r.id, kind])) continue;
    const [title, body] = REMINDER_TEXT[kind](r.venue_name);
    await notify(await officerUser(r.officer_id), {
      kind: 'venue_pack', title, body, link: packLink(r.venue_id), severity: kind === '2h' ? 'warning' : 'info', email: kind !== '2h',
      dedupe: kind === 'booked' ? `pack-booked:${r.venue_id}:${new Date().toISOString().slice(0, 10)}` : `pack-${kind}:${r.id}`, ref: kind === 'booked' ? null : `asg:${r.id}`,
    });
    sent += 1;
  }
  return sent;
}

const reminderRows = (where, params = []) => q(`SELECT a.id, a.officer_id, s.venue_id, v.name AS venue_name FROM shift_assignments a
  JOIN shifts s ON s.id = a.shift_id JOIN venues v ON v.id = s.venue_id WHERE ${BOOKED} AND ${where} LIMIT 500`, params);

/** Right after a booking. Safe to call more than once. */
export async function remindPack(assignmentId, kind = 'booked') {
  try {
    return await sendReminders(await reminderRows('a.id = $1 AND s.ends_at > now()', [assignmentId]), kind);
  } catch (e) {
    console.error('[venuePack] reminder failed', assignmentId, e);
    return 0;
  }
}

/** Every job run: bookings not yet told, the day before (20–26 h), and 2 hours before. */
export async function packReminders() {
  const unclaimed = (k) => `NOT EXISTS (SELECT 1 FROM pack_reminders r WHERE r.assignment_id = a.id AND r.kind = '${k}')`;
  const booked = await sendReminders(await reminderRows(`s.ends_at > now() AND ${unclaimed('booked')}`), 'booked');
  const day = await sendReminders(await reminderRows(`s.starts_at BETWEEN now() + interval '20 hours' AND now() + interval '26 hours' AND ${unclaimed('day')}`), 'day');
  const soon = await sendReminders(await reminderRows(`s.starts_at BETWEEN now() + interval '1 hour' AND now() + interval '135 minutes' AND ${unclaimed('2h')}`), '2h');
  return { booked, day, soon };
}

// ---- The signed PDF ----

/** What renderSigned needs for a pack signing: what was read and when, then every document exactly as signed. */
export async function packInput(row) {
  const items = row.items || [];
  const [settings, o, v, versions] = await Promise.all([
    getSettings(),
    one('SELECT first_name, last_name, email FROM officers WHERE id = $1', [row.officer_id]),
    one('SELECT name FROM venues WHERE id = $1', [row.venue_id]),
    q(`SELECT procedure_id, version, title, body FROM procedure_versions WHERE (procedure_id, version) IN (SELECT (x->>'procedure_id')::uuid, (x->>'version')::int FROM jsonb_array_elements($1::jsonb) x)`, [JSON.stringify(items)]),
  ]);
  const byKey = new Map(versions.map((x) => [`${x.procedure_id}:${x.version}`, x]));
  const intro = ['#! What was read',
    `The officer read each document below in the app and ticked "I have read and understood this" before signing. Documents marked "earlier" were unchanged since an earlier signing for ${v.name}.`,
    ...items.map((i) => `- ${i.title} (version ${i.version}): read ${fmtDateTime(i.read_at)}${i.reread === false ? ' (earlier)' : ''}`)].join('\n\n');
  const blocks = parse(intro);
  for (const i of items) {
    const x = byKey.get(`${i.procedure_id}:${i.version}`);
    if (!x) continue;
    blocks.push({ type: 'break' }, ...parse(`#! ${x.title}\n\n${x.body}`));
  }
  return {
    company: settings,
    doc: {
      kind: 'venue_pack', typeLabel: 'Venue pack', title: `${v.name}: instructions and procedures`, reference: row.reference, issuedAt: row.signed_at,
      officerName: o ? officerName(o) : row.signed_name, blocks, officerOnly: true,
      ackLine: `I have read and understood the assignment instructions and procedures for ${v.name} and agree to follow them.`,
    },
    signers: {
      company: null,
      officer: { name: row.signed_name, png: row.signature, at: row.signed_at, email: o?.email, ip: row.signed_ip, ua: row.signed_ua },
    },
  };
}

const packFile = (row, venueName) => `Venue pack - ${venueName} - ${row.reference}.pdf`;

// ---- AI drafting ----

const PACK_RULES = `You write assignment instructions and site procedures for licensed security officers working for a UK manned-guarding company at a client's site.
Rules:
- Follow UK good practice: BS 7499 and BS 7858 principles, SIA guidance, the Health and Safety at Work etc. Act 1974, the Regulatory Reform (Fire Safety) Order 2005, Licensing Act 2003 where alcohol is sold, Equality Act 2010, UK GDPR / ICO CCTV and body-worn video guidance, ACT / NaCTSO and the Terrorism (Protection of Premises) Act 2025 (Martyn's Law), Ask for Angela / WAVE vulnerability guidance, lone-working guidance.
- Use the site facts you are given. Never invent site details: no door codes, alarm codes, key safe numbers, phone numbers, names, radio channels, times or room names that were not provided. Where something site-specific is needed but unknown, write "[To confirm: what is needed]" so a manager fills it in.
- Never include alarm or door codes even if they appear in the material; write "[Code held by the site manager]" instead.
- Never name or describe members of the public or staff from incident history; use it only to spot risks.
- Plain British English, short sentences, second person ("you"), practical steps in the order the officer does them. An officer reads this on a phone.
- Format: "# Heading" for each numbered section, paragraphs separated by a blank line, "- " for bullet points, **bold** for key words sparingly. No tables, no links, no HTML.
- If uploaded client documents conflict with good practice or the law, follow the client's rule only if it is lawful and safe; otherwise add "[To confirm: the client's document says … which conflicts with …]".`;

const INSTRUCTIONS_OUTLINE = 'Sections, in this order where relevant: Site overview; Your role and duties; Hours, arrival and handover; Access control and searches; Patrols and checks; Keys, alarms, opening and locking up; Emergencies (fire, evacuation, first aid, lockdown); Incidents, reporting and logs; Contacts and escalation; Uniform, equipment and welfare; Site rules and conduct.';

export const QUESTIONS = [
  { key: 'site_type', label: 'What kind of site is it, and what happens there?', hint: 'e.g. nightclub, supermarket, office reception, building site, event' },
  { key: 'hours', label: 'Opening hours, and when officers are on site', hint: 'Including busy times' },
  { key: 'duties', label: 'Main duties for officers', hint: 'Door, patrols, CCTV, reception, searches, car park, deliveries…' },
  { key: 'access', label: 'Access control', hint: 'Who may enter, passes, ID checks, search and refusal policy' },
  { key: 'patrols', label: 'Patrol routes and checks', hint: 'Where, how often, what to check, how it is recorded' },
  { key: 'keys', label: 'Keys, alarms, opening and locking up', hint: 'Do not type codes, just say who holds them' },
  { key: 'emergency', label: 'Fire, evacuation and first aid', hint: 'Fire panel, assembly point, first aid kit, defibrillator' },
  { key: 'contacts', label: 'Who to contact on site and out of hours', hint: 'Roles rather than personal numbers' },
  { key: 'reporting', label: 'Reporting and handover', hint: 'Radios, daily log, incident reports, client reporting' },
  { key: 'welfare', label: 'Uniform, equipment and welfare', hint: 'Breaks, toilets, parking, kit provided' },
  { key: 'risks', label: 'Known risks or recurring problems', hint: 'Theft, anti-social behaviour, lone working, vulnerable people…' },
  { key: 'other', label: 'Anything else the client insists on', hint: '' },
];

const DOCX = /officedocument\.wordprocessingml|msword/;
const MAX_FILE = 8 * 1024 * 1024;

/** Venue documents the manager ticked, as content blocks the model can read (PDF/images as files, Word as text). */
async function sourceBlocks(venueId, ids = []) {
  const docs = ids.length ? await q("SELECT id, title, mime, s3_key FROM documents WHERE owner_type = 'venue' AND owner_id = $1 AND id = ANY($2::uuid[]) AND s3_key IS NOT NULL", [venueId, ids.slice(0, 4)]) : [];
  const blocks = [];
  const used = [];
  const skipped = [];
  for (const d of docs) {
    try {
      const bytes = await getObjectBytes(d.s3_key);
      if (bytes.length > MAX_FILE) { skipped.push({ title: d.title, why: 'larger than 8 MB' }); continue; }
      if (canRead(d.mime)) {
        blocks.push({ type: 'text', text: `Client document: ${d.title}` }, fileBlock(bytes, d.mime));
      } else if (DOCX.test(d.mime || '') || /\.docx$/i.test(d.s3_key)) {
        blocks.push({ type: 'text', text: `Client document: ${d.title}\n\n${docxToMarkup(bytes).slice(0, 60000)}` });
      } else { skipped.push({ title: d.title, why: 'file type cannot be read' }); continue; }
      used.push(d.title);
    } catch (e) {
      console.error('[venuePack] source read failed', d.id, e);
      skipped.push({ title: d.title, why: 'could not be opened' });
    }
  }
  return { blocks, used, skipped };
}

/** Everything the app already knows about the site, with no personal details. */
async function siteFacts(venueId) {
  const [v, roles, incidents, general, own] = await Promise.all([
    one('SELECT v.name, v.address, v.postcode, v.phone, v.instructions, v.notes, c.name AS client FROM venues v LEFT JOIN clients c ON c.id = v.client_id WHERE v.id = $1', [venueId]),
    q(`SELECT r.name AS role, to_char(s.starts_at AT TIME ZONE 'Europe/London', 'Dy HH24:MI') AS from_at, to_char(s.ends_at AT TIME ZONE 'Europe/London', 'HH24:MI') AS to_at, count(*)::int AS n
         FROM shifts s JOIN roles r ON r.code = s.role WHERE s.venue_id = $1 AND s.status = 'published' AND s.starts_at BETWEEN now() - interval '90 days' AND now() + interval '30 days'
        GROUP BY 1, 2, 3 ORDER BY n DESC LIMIT 10`, [venueId]),
    q(`SELECT type, severity, location, to_char(occurred_at, 'Mon YYYY') AS month FROM incidents WHERE venue_id = $1 AND occurred_at > now() - interval '12 months' ORDER BY occurred_at DESC LIMIT 40`, [venueId]),
    q(`SELECT DISTINCT pv.title FROM procedures p JOIN procedure_versions pv ON pv.procedure_id = p.id AND pv.version = p.current_version
        LEFT JOIN procedure_venues x ON x.procedure_id = p.id AND x.venue_id = $1
        WHERE p.scope = 'general' AND p.status = 'published' AND (CASE WHEN p.applies_all THEN NOT COALESCE(x.excluded, false) ELSE x.venue_id IS NOT NULL AND NOT x.excluded END)`, [venueId]),
    q("SELECT title FROM procedures WHERE venue_id = $1 AND kind = 'procedure' AND status <> 'archived'", [venueId]),
  ]);
  need(v, 'Venue not found');
  const lines = [
    `Venue: ${v.name}${v.client ? ` (client: ${v.client})` : ''}`,
    v.address && `Address: ${v.address}${v.postcode ? `, ${v.postcode}` : ''}`,
    v.instructions?.trim() && `Existing short instructions:\n${v.instructions.trim().slice(0, 4000)}`,
    v.notes?.trim() && `Manager notes about the site:\n${v.notes.trim().slice(0, 3000)}`,
    roles.length && `Typical shifts: ${roles.map((r) => `${r.role} ${r.from_at}–${r.to_at} (×${r.n})`).join('; ')}`,
    incidents.length && `Incidents in the last 12 months (type, severity, location, month):\n${incidents.map((i) => `- ${i.type}, ${i.severity}${i.location ? `, ${i.location}` : ''}, ${i.month}`).join('\n')}`,
    general.length && `Company-wide procedures already in this venue's pack (do not repeat them, refer to them by name): ${general.map((g) => g.title).join('; ')}`,
    own.length && `Venue procedures that already exist: ${own.map((g) => g.title).join('; ')}`,
  ].filter(Boolean);
  return { venue: v, text: lines.join('\n\n') };
}

const answersText = (answers = {}) => QUESTIONS.map((x) => (answers[x.key] ? `${x.label}\n${clip(answers[x.key], 2000)}` : null)).filter(Boolean).join('\n\n');

const PACK_TOOL = {
  name: 'save_pack',
  description: 'Save the assignment instructions for the site and suggest procedures to write next',
  input_schema: {
    type: 'object',
    properties: {
      instructions: { type: 'string', description: 'The full assignment instructions in the markup format described' },
      site_facts: { type: 'string', description: 'A factual summary of the site in under 250 words (duties, layout, hours, risks, contacts by role, client rules) used to write the procedures. No codes.' },
      procedures: {
        type: 'array', description: 'Site-specific procedures worth writing as separate documents, 2-6, most important first. Skip anything a company-wide procedure already covers.',
        items: { type: 'object', properties: { title: { type: 'string' }, why: { type: 'string', description: 'One short line' } }, required: ['title', 'why'] },
      },
      to_confirm: { type: 'array', items: { type: 'string' }, description: 'The details a manager must confirm (the [To confirm] gaps), short' },
    },
    required: ['instructions', 'site_facts', 'procedures', 'to_confirm'],
  },
};

const DOC_TOOL = {
  name: 'save_procedure',
  description: 'Save one procedure document',
  input_schema: { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string', description: 'The procedure in the markup format described' } }, required: ['title', 'body'] },
};

const EDIT_TOOL = {
  name: 'save_edit',
  description: 'Save the revised document',
  input_schema: { type: 'object', properties: { body: { type: 'string', description: 'The whole revised document' }, summary: { type: 'string', description: 'One line on what changed' } }, required: ['body', 'summary'] },
};

// ---- Shared read models ----

const bodyOf = async (p) => p.draft_body ?? (p.current_version
  ? (await one('SELECT body FROM procedure_versions WHERE procedure_id = $1 AND version = $2', [p.id, p.current_version]))?.body : '') ?? '';

/** Register for one venue: officers booked from today or who have ever signed, with where they stand. */
async function registerRows(venueId) {
  const people = await q(`SELECT o.id AS officer_id, o.first_name, o.last_name,
      (SELECT min(s.starts_at) FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id WHERE a.officer_id = o.id AND s.venue_id = $1 AND ${BOOKED} AND s.ends_at > now()) AS next_shift,
      (SELECT count(*)::int FROM pack_signings g WHERE g.officer_id = o.id AND g.venue_id = $1) AS signings
    FROM officers o
   WHERE o.id IN (SELECT a.officer_id FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id WHERE s.venue_id = $1 AND ${BOOKED} AND s.ends_at > now()
                  UNION SELECT officer_id FROM pack_signings WHERE venue_id = $1)
   ORDER BY o.last_name, o.first_name`, [venueId]);
  const st = await statusesFor(people.map((p) => ({ officer_id: p.officer_id, venue_id: venueId })));
  return people.map((p) => {
    const s = st.get(pairKey(p.officer_id, venueId));
    return {
      officer_id: p.officer_id, name: officerName(p), next_shift: p.next_shift, signings: p.signings,
      status: s.status, label: STATUS_LABEL[s.status], to_read: s.toRead.length,
      signed_at: s.signing?.signed_at || null, reference: s.signing?.reference || null, signing_id: s.signing?.id || null,
    };
  });
}

const history = (venueId, limit = 500) => q(`SELECT g.id, g.reference, g.signed_at, g.signed_name, g.items, g.officer_id, o.first_name, o.last_name
  FROM pack_signings g JOIN officers o ON o.id = g.officer_id WHERE g.venue_id = $1 ORDER BY g.signed_at DESC LIMIT $2`, [venueId, limit]);

async function signing(user, id) {
  const g = need(await one('SELECT g.*, v.name AS venue_name FROM pack_signings g JOIN venues v ON v.id = g.venue_id WHERE g.id = $1', [id]), 'Signing not found');
  if (user.role === 'officer') { if (g.officer_id !== user.officer_id) fail(403, 'Forbidden'); } else await assertVenue(user, g.venue_id);
  return g;
}

// ---- Actions ----

export const actions = {
  // Library: every general procedure, and the venue documents the user can see
  'procedures.list': def(MGR, async (b, { user }) => {
    const scope = await venueScope(user);
    const rows = await q(`SELECT p.id, p.kind, p.scope, p.venue_id, v.name AS venue_name, p.title, p.status, p.applies_all, p.current_version, p.ai_drafted,
        (p.draft_body IS NOT NULL) AS has_draft, p.updated_at,
        (SELECT published_at FROM procedure_versions x WHERE x.procedure_id = p.id AND x.version = p.current_version) AS published_at,
        (SELECT count(*)::int FROM procedure_suggestions s WHERE s.procedure_id = p.id AND s.status = 'open') AS open_suggestions,
        CASE WHEN p.scope = 'venue' THEN 1 WHEN p.applies_all
          THEN (SELECT count(*)::int FROM venues w WHERE w.active) - (SELECT count(*)::int FROM procedure_venues x JOIN venues w ON w.id = x.venue_id AND w.active WHERE x.procedure_id = p.id AND x.excluded)
          ELSE (SELECT count(*)::int FROM procedure_venues x JOIN venues w ON w.id = x.venue_id AND w.active WHERE x.procedure_id = p.id AND NOT x.excluded) END AS venue_count
      FROM procedures p LEFT JOIN venues v ON v.id = p.venue_id
     WHERE ($1::text IS NULL OR p.scope = $1) AND ($2::uuid IS NULL OR p.venue_id = $2 OR p.scope = 'general')
       AND ($3::text IS NULL OR p.status = $3) AND ($4::text IS NULL OR p.status <> 'archived' OR $3 = 'archived')
       AND ($5::uuid[] IS NULL OR p.scope = 'general' OR p.venue_id = ANY($5))
     ORDER BY p.scope, v.name NULLS FIRST, (p.kind = 'instructions') DESC, p.title`,
    [b.scope || null, b.venue_id || null, b.status || null, b.status ? null : 'hide', scope]);
    return { procedures: rows };
  }),

  'procedures.get': def(MGR, async (b, { user }) => {
    const p = await procedure(b.id);
    await canView(user, p);
    const [versions, venues, suggestions, published] = await Promise.all([
      q(`SELECT x.version, x.title, x.requires_resign, x.note, x.published_at, u.name AS published_by FROM procedure_versions x LEFT JOIN users u ON u.id = x.published_by
          WHERE x.procedure_id = $1 ORDER BY x.version DESC`, [p.id]),
      q(`SELECT v.id, v.name, x.excluded FROM procedure_venues x JOIN venues v ON v.id = x.venue_id WHERE x.procedure_id = $1 ORDER BY v.name`, [p.id]),
      q(`SELECT s.*, u.name AS author_name, u.role AS author_role, v.name AS venue_name FROM procedure_suggestions s LEFT JOIN users u ON u.id = s.author_id LEFT JOIN venues v ON v.id = s.venue_id
          WHERE s.procedure_id = $1 ORDER BY (s.status = 'open') DESC, s.created_at DESC LIMIT 100`, [p.id]),
      p.current_version ? one('SELECT title, body FROM procedure_versions WHERE procedure_id = $1 AND version = $2', [p.id, p.current_version]) : null,
    ]);
    return {
      ...p, versions, venues, suggestions,
      published_body: published?.body ?? null, published_title: published?.title ?? null,
      body: p.draft_body ?? published?.body ?? '', can_edit: p.scope === 'venue' || user.role === 'company',
    };
  }),

  'procedures.save': def(MGR, async (b, { user }) => {
    const title = clip(b.title, 160);
    if (b.body != null && String(b.body).length > 120000) fail(400, 'The document is too long');
    if (!b.id) {
      if (!title) fail(400, 'Give the document a title');
      const kind = b.kind === 'instructions' ? 'instructions' : 'procedure';
      const scope = kind === 'instructions' || b.venue_id ? 'venue' : 'general';
      if (scope === 'venue') { required(b, 'venue_id'); await assertVenue(user, b.venue_id); } else if (user.role !== 'company') fail(403, 'Only company managers can create general procedures');
      if (kind === 'instructions' && await one("SELECT 1 FROM procedures WHERE venue_id = $1 AND kind = 'instructions'", [b.venue_id])) fail(409, 'This venue already has assignment instructions');
      const p = await one(`INSERT INTO procedures (kind, scope, venue_id, title, draft_body, applies_all, ai_drafted, created_by, updated_by)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *`,
      [kind, scope, scope === 'venue' ? b.venue_id : null, title, String(b.body ?? ''), b.applies_all !== false, !!b.ai_drafted, user.id]);
      if (scope === 'general' && Array.isArray(b.venue_ids) && b.applies_all === false) await setChosenVenues(p.id, b.venue_ids);
      await audit(user, 'procedure.create', 'procedure', p.id, { title, scope, venue_id: p.venue_id });
      return p;
    }
    const p = await procedure(b.id);
    await canEdit(user, p);
    if (p.status === 'archived') fail(400, 'Restore this document before editing it');
    const body = b.body != null ? String(b.body) : null;
    const published = p.current_version ? await one('SELECT title, body FROM procedure_versions WHERE procedure_id = $1 AND version = $2', [p.id, p.current_version]) : null;
    const newTitle = title || p.title;
    let draft = body ?? p.draft_body;
    // Wording (or the title) back to exactly what is published: nothing left waiting
    if (published && (draft ?? published.body) === published.body && newTitle === published.title) draft = null;
    else if (published && draft == null) draft = published.body;
    const row = await one(`UPDATE procedures SET title = $2, draft_body = $3, applies_all = COALESCE($4, applies_all), updated_by = $5, updated_at = now() WHERE id = $1 RETURNING *`,
      [p.id, newTitle, draft, p.scope === 'general' && typeof b.applies_all === 'boolean' ? b.applies_all : null, user.id]);
    if (p.scope === 'general' && Array.isArray(b.venue_ids) && row.applies_all === false) await setChosenVenues(p.id, b.venue_ids);
    // Widening where a published procedure applies puts it in new packs
    if (p.scope === 'general' && p.status === 'published' && (b.applies_all !== undefined || b.venue_ids)) await notifyResign(row);
    await audit(user, 'procedure.save', 'procedure', p.id, { title: newTitle });
    return row;
  }),

  // Live preview while editing
  'procedures.preview': def(MGR, async (b) => ({ blocks: parse(String(b.body ?? '').slice(0, 120000)) })),

  // Before publishing: which venues it lands in and how many booked officers it touches
  'procedures.impact': def(MGR, async (b, { user }) => {
    const p = await procedure(b.id);
    await canView(user, p);
    const venues = await venuesOf(p);
    const pairs = venues.length ? await bookedPairs(venues.map((v) => v.id)) : [];
    return { venues, officers: new Set(pairs.map((x) => x.officer_id)).size, first: p.current_version === 0, has_draft: p.draft_body != null };
  }),

  'procedures.publish': def(MGR, async (b, { user }) => {
    const p = await procedure(b.id);
    await canEdit(user, p);
    if (p.status === 'archived') fail(400, 'Restore this document before publishing it');
    const body = String(p.draft_body ?? '').trim();
    if (!body) fail(400, p.current_version ? 'There are no unpublished changes' : 'Write the document before publishing it');
    if (/\[To confirm/i.test(body) && !b.allow_gaps) fail(400, 'Some details are still marked [To confirm]. Fill them in, or confirm you want to publish anyway.', { code: 'to_confirm' });
    const version = p.current_version + 1;
    const resign = version === 1 || b.requires_resign !== false;
    const row = await tx(async (t) => {
      await t.q(`INSERT INTO procedure_versions (procedure_id, version, title, body, requires_resign, note, published_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [p.id, version, p.title, body, resign, clip(b.note, 500), user.id]);
      return t.one(`UPDATE procedures SET status = 'published', current_version = $2, draft_body = NULL, updated_by = $3, updated_at = now() WHERE id = $1 RETURNING *`, [p.id, version, user.id]);
    });
    const notified = resign ? await notifyResign(row) : 0;
    await audit(user, 'procedure.publish', 'procedure', p.id, { title: p.title, version, requires_resign: resign });
    return { ...row, notified };
  }),

  'procedures.discardDraft': def(MGR, async (b, { user }) => {
    const p = await procedure(b.id);
    await canEdit(user, p);
    if (!p.current_version) fail(400, 'This document has never been published. Delete it instead.');
    const v = await one('SELECT title FROM procedure_versions WHERE procedure_id = $1 AND version = $2', [p.id, p.current_version]);
    await q('UPDATE procedures SET draft_body = NULL, title = $2, updated_by = $3, updated_at = now() WHERE id = $1', [p.id, v.title, user.id]);
    return { ok: true };
  }),

  'procedures.archive': def(MGR, async (b, { user }) => {
    const p = await procedure(b.id);
    await canEdit(user, p);
    const restore = !!b.restore;
    await q(`UPDATE procedures SET status = $2, updated_by = $3, updated_at = now() WHERE id = $1`,
      [p.id, restore ? (p.current_version ? 'published' : 'draft') : 'archived', user.id]);
    if (restore && p.current_version) await notifyResign({ ...p, status: 'published' });
    await audit(user, restore ? 'procedure.restore' : 'procedure.archive', 'procedure', p.id, { title: p.title });
    return { ok: true };
  }),

  'procedures.delete': def(MGR, async (b, { user }) => {
    const p = await procedure(b.id);
    await canEdit(user, p);
    if (p.current_version) fail(400, 'Published documents are kept for the record. Archive it instead.');
    await q('DELETE FROM procedures WHERE id = $1', [p.id]);
    await audit(user, 'procedure.delete', 'procedure', p.id, { title: p.title });
    return { ok: true };
  }),

  // An earlier wording exactly as officers signed it
  'procedures.version': def(VIEW, async (b, { user }) => {
    required(b, 'id', 'version');
    const p = await procedure(b.id);
    await canView(user, p);
    const v = need(await one(`SELECT x.*, u.name AS published_by_name FROM procedure_versions x LEFT JOIN users u ON u.id = x.published_by WHERE x.procedure_id = $1 AND x.version = $2`, [p.id, Number(b.version)]), 'Version not found');
    return { ...v, blocks: parse(v.body) };
  }),

  // AI: one procedure from a topic (the venue's site facts, or company-wide)
  'procedures.ai.draft': def(MGR, async (b, { user }) => {
    required(b, 'title');
    const venueId = b.venue_id || null;
    if (venueId) await assertVenue(user, venueId); else if (user.role !== 'company') fail(403, 'Only company managers can create general procedures');
    const facts = venueId ? (b.site_facts ? { text: clip(b.site_facts, 6000) } : await siteFacts(venueId)) : null;
    const { input } = await extract({
      model: SONNET, module: 'venue_packs', max_tokens: 5000, timeout: 120000, tool: DOC_TOOL,
      system: `${PACK_RULES}\nYou are writing one ${venueId ? 'site-specific' : 'company-wide (applies at every venue, so nothing site-specific)'} procedure: the trigger, then what to do step by step, who to tell, what to record. 300-900 words.`,
      messages: [{ role: 'user', content: `Procedure: ${clip(b.title, 200)}${b.why ? `\nWhy it is needed: ${clip(b.why, 400)}` : ''}${b.notes ? `\nManager's notes: ${clip(b.notes, 3000)}` : ''}${facts ? `\n\nSite facts:\n${facts.text}` : ''}` }],
    });
    if (!input?.body) fail(502, 'The AI could not draft this procedure. Try again.');
    const p = await one(`INSERT INTO procedures (kind, scope, venue_id, title, draft_body, ai_drafted, created_by, updated_by) VALUES ('procedure', $1, $2, $3, $4, true, $5, $5) RETURNING *`,
      [venueId ? 'venue' : 'general', venueId, clip(input.title || b.title, 160), input.body, user.id]);
    await audit(user, 'procedure.draft', 'procedure', p.id, { title: p.title, via: 'ai' });
    return p;
  }),

  // AI: change a draft as asked; the previous wording comes back so the editor can undo
  'procedures.ai.edit': def(MGR, async (b, { user }) => {
    required(b, 'id', 'instruction');
    const p = await procedure(b.id);
    await canEdit(user, p);
    const previous = await bodyOf(p);
    const { input } = await extract({
      model: SONNET, module: 'venue_packs', max_tokens: 6000, timeout: 120000, tool: EDIT_TOOL,
      system: `${PACK_RULES}\nYou revise an existing document as the manager asks. Keep everything they did not ask to change, word for word.`,
      messages: [{ role: 'user', content: `Document "${p.title}":\n\n${previous}\n\n---\nChange requested: ${clip(b.instruction, 2000)}` }],
    });
    if (!input?.body) fail(502, 'The AI could not make that change. Try again.');
    await q('UPDATE procedures SET draft_body = $2, updated_by = $3, updated_at = now() WHERE id = $1', [p.id, input.body, user.id]);
    await audit(user, 'procedure.ai_edit', 'procedure', p.id, { instruction: clip(b.instruction, 300) });
    return { body: input.body, summary: input.summary || '', previous };
  }),

  // One venue's pack as managers (and, read-only, the client) see it
  'venuePacks.get': def(VIEW, async (b, { user }) => {
    required(b, 'venue_id');
    await assertVenue(user, b.venue_id);
    const venue = need(await one('SELECT id, name FROM venues WHERE id = $1', [b.venue_id]), 'Venue not found');
    const client = user.role === 'venue';
    const pack = await packFor(b.venue_id, { body: client || !!b.body });
    const docs = client ? [] : await q(`SELECT p.id, p.kind, p.scope, p.title, p.status, p.current_version, p.applies_all, (p.draft_body IS NOT NULL) AS has_draft, p.ai_drafted,
        COALESCE(x.excluded, false) AS excluded, (x.venue_id IS NOT NULL) AS listed
      FROM procedures p LEFT JOIN procedure_venues x ON x.procedure_id = p.id AND x.venue_id = $1
     WHERE p.status <> 'archived' AND (p.venue_id = $1 OR p.scope = 'general')
     ORDER BY (p.kind = 'instructions') DESC, p.scope DESC, p.title`, [b.venue_id]);
    const inPack = new Set(pack.map((d) => d.procedure_id));
    const reg = await registerRows(b.venue_id);
    const upcoming = reg.filter((r) => r.next_shift);
    const open = (await one(`SELECT count(*)::int AS n FROM procedure_suggestions WHERE venue_id = $1 AND status = 'open'`, [b.venue_id])).n;
    return {
      venue,
      pack: pack.map((d) => ({ ...d, blocks: d.body != null ? parse(d.body) : undefined, body: undefined })),
      documents: docs.map((d) => ({ ...d, in_pack: inPack.has(d.id), included: d.scope === 'venue' || (d.applies_all ? !d.excluded : d.listed && !d.excluded) })),
      counts: { booked: upcoming.length, ok: upcoming.filter((r) => OK.has(r.status)).length, action: upcoming.filter((r) => !OK.has(r.status)).length, signed: reg.filter((r) => r.signed_at).length },
      open_suggestions: open,
      questions: client ? undefined : QUESTIONS,
      sources: client ? undefined : await q("SELECT id, title, mime, created_at FROM documents WHERE owner_type = 'venue' AND owner_id = $1 AND s3_key IS NOT NULL ORDER BY created_at DESC", [b.venue_id]),
    };
  }),

  // Order within the pack (instructions always come first)
  'venuePacks.order': def(MGR, async (b, { user }) => {
    required(b, 'venue_id', 'ids');
    await assertVenue(user, b.venue_id);
    const pack = new Set((await packFor(b.venue_id)).map((d) => d.procedure_id));
    const ids = (Array.isArray(b.ids) ? b.ids : []).filter((id) => pack.has(id));
    await tx(async (t) => {
      for (const [i, id] of ids.entries()) {
        await t.q(`INSERT INTO procedure_venues (procedure_id, venue_id, position) VALUES ($1,$2,$3)
          ON CONFLICT (procedure_id, venue_id) DO UPDATE SET position = EXCLUDED.position`, [id, b.venue_id, (i + 1) * 10]);
      }
    });
    return { ok: true };
  }),

  // A general procedure on or off at one venue
  'venuePacks.toggle': def(CO, async (b, { user }) => {
    required(b, 'venue_id', 'procedure_id');
    const p = await procedure(b.procedure_id);
    if (p.scope !== 'general') fail(400, 'Only general procedures can be switched on or off per venue');
    const on = !!b.included;
    if (p.applies_all) {
      await q(`INSERT INTO procedure_venues (procedure_id, venue_id, excluded) VALUES ($1,$2,$3) ON CONFLICT (procedure_id, venue_id) DO UPDATE SET excluded = EXCLUDED.excluded`, [p.id, b.venue_id, !on]);
    } else if (on) {
      await q(`INSERT INTO procedure_venues (procedure_id, venue_id, excluded) VALUES ($1,$2,false) ON CONFLICT (procedure_id, venue_id) DO UPDATE SET excluded = false`, [p.id, b.venue_id]);
    } else await q('DELETE FROM procedure_venues WHERE procedure_id = $1 AND venue_id = $2', [p.id, b.venue_id]);
    if (on && p.status === 'published') await notifyResign(p, [b.venue_id]);
    await audit(user, on ? 'procedure.venue_on' : 'procedure.venue_off', 'procedure', p.id, { venue_id: b.venue_id });
    return { ok: true };
  }),

  // Every venue at a glance: documents, drafts and who is booked without a current signature
  'venuePacks.overview': def(MGR, async (b, { user }) => {
    const scope = await venueScope(user);
    const venues = await q(`SELECT v.id, v.name,
        (SELECT count(*)::int FROM procedures p WHERE p.venue_id = v.id AND p.status <> 'archived' AND (p.draft_body IS NOT NULL)) AS drafts
      FROM venues v WHERE v.active AND ($1::uuid[] IS NULL OR v.id = ANY($1)) ORDER BY v.name`, [scope]);
    const ids = venues.map((v) => v.id);
    const [packs, pairs] = await Promise.all([packsFor(ids), bookedPairs(ids, 14)]);
    const st = await statusesFor(pairs, { packs });
    return {
      venues: venues.map((v) => {
        const mine = pairs.filter((p) => p.venue_id === v.id);
        return {
          ...v, documents: packs.get(v.id).length, has_instructions: packs.get(v.id).some((d) => d.kind === 'instructions'),
          booked: mine.length, action: mine.filter((p) => !OK.has(st.get(pairKey(p.officer_id, p.venue_id)).status)).length,
        };
      }),
    };
  }),

  'venuePacks.ai.questions': def(MGR, async (b, { user }) => {
    required(b, 'venue_id');
    await assertVenue(user, b.venue_id);
    const sources = await q("SELECT id, title, mime, created_at FROM documents WHERE owner_type = 'venue' AND owner_id = $1 AND s3_key IS NOT NULL ORDER BY created_at DESC", [b.venue_id]);
    return { questions: QUESTIONS, sources: sources.map((s) => ({ ...s, readable: canRead(s.mime) || DOCX.test(s.mime || '') })) };
  }),

  // AI: the venue's assignment instructions from everything we know, plus the procedures worth writing next
  'venuePacks.ai.draft': def(MGR, async (b, { user }) => {
    required(b, 'venue_id');
    await assertVenue(user, b.venue_id);
    const [facts, src] = await Promise.all([siteFacts(b.venue_id), sourceBlocks(b.venue_id, Array.isArray(b.document_ids) ? b.document_ids : [])]);
    const answers = answersText(b.answers || {});
    if (!answers && !src.blocks.length && facts.text.split('\n\n').length < 3) fail(400, 'Answer a few questions or choose a client document first, so the AI has something to work from');
    const { input } = await extract({
      model: SONNET, module: 'venue_packs', max_tokens: 9000, timeout: 160000, tool: PACK_TOOL,
      system: `${PACK_RULES}\nYou are writing the assignment instructions for one site: the main document every officer reads before their first shift. ${INSTRUCTIONS_OUTLINE} Typically 900-2000 words.`,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `What the app knows about the site:\n\n${facts.text}` },
          ...(answers ? [{ type: 'text', text: `The manager's answers:\n\n${answers}` }] : []),
          ...src.blocks,
          { type: 'text', text: 'Write the assignment instructions now.' },
        ],
      }],
    });
    if (!input?.instructions) fail(502, 'The AI could not draft the instructions. Try again.');
    const existing = await one("SELECT * FROM procedures WHERE venue_id = $1 AND kind = 'instructions'", [b.venue_id]);
    const p = existing
      ? await one(`UPDATE procedures SET draft_body = $2, ai_drafted = true, status = CASE WHEN status = 'archived' THEN (CASE WHEN current_version > 0 THEN 'published' ELSE 'draft' END) ELSE status END,
          updated_by = $3, updated_at = now() WHERE id = $1 RETURNING *`, [existing.id, input.instructions, user.id])
      : await one(`INSERT INTO procedures (kind, scope, venue_id, title, draft_body, ai_drafted, created_by, updated_by) VALUES ('instructions','venue',$1,'Assignment instructions',$2,true,$3,$3) RETURNING *`,
        [b.venue_id, input.instructions, user.id]);
    await audit(user, 'procedure.draft', 'procedure', p.id, { title: p.title, via: 'ai', sources: src.used });
    return {
      instructions: p, site_facts: input.site_facts || '', to_confirm: (input.to_confirm || []).slice(0, 30),
      suggestions: (input.procedures || []).slice(0, 6), used: src.used, skipped: src.skipped,
    };
  }),

  // Officer: one venue's pack to read and sign
  'venuePacks.mine': def(['officer'], async (b, { user }) => {
    required(b, 'venue_id');
    await officerAtVenue(user.officer_id, b.venue_id);
    const venue = need(await one('SELECT id, name, address, postcode FROM venues WHERE id = $1', [b.venue_id]), 'Venue not found');
    const pack = await packFor(b.venue_id, { body: true });
    const st = await statusFor(user.officer_id, b.venue_id, { packs: new Map([[b.venue_id, pack]]) });
    const reads = pack.length ? await q('SELECT procedure_id, version, read_at FROM pack_reads WHERE officer_id = $1 AND procedure_id = ANY($2::uuid[])', [user.officer_id, pack.map((d) => d.procedure_id)]) : [];
    const readAt = new Map(reads.map((r) => [`${r.procedure_id}:${r.version}`, r.read_at]));
    const toRead = new Set(st.toRead);
    const name = await one('SELECT first_name, last_name FROM officers WHERE id = $1', [user.officer_id]);
    return {
      venue, status: st.status, label: STATUS_LABEL[st.status], default_name: name ? officerName(name) : '',
      signing: st.signing ? { id: st.signing.id, reference: st.signing.reference, signed_at: st.signing.signed_at } : null,
      documents: pack.map((d) => ({
        procedure_id: d.procedure_id, kind: d.kind, scope: d.scope, title: d.title, version: d.version, published_at: d.published_at,
        blocks: parse(d.body), must_read: toRead.has(d.procedure_id), read_at: readAt.get(`${d.procedure_id}:${d.version}`) || null,
      })),
    };
  }),

  // Officer: every venue they are booked at or have signed for, with where they stand
  'venuePacks.myList': def(['officer'], async (b, { user }) => {
    const venues = await q(`SELECT v.id AS venue_id, v.name,
        (SELECT min(s.starts_at) FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id WHERE a.officer_id = $1 AND s.venue_id = v.id AND ${BOOKED} AND s.ends_at > now()) AS next_shift
      FROM venues v WHERE v.id IN (SELECT s.venue_id FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id WHERE a.officer_id = $1 AND ${BOOKED} AND s.ends_at > now()
                                   UNION SELECT venue_id FROM pack_signings WHERE officer_id = $1)
      ORDER BY next_shift NULLS LAST, v.name`, [user.officer_id]);
    const st = await statusesFor(venues.map((v) => ({ officer_id: user.officer_id, venue_id: v.venue_id })));
    return {
      venues: venues.map((v) => {
        const s = st.get(pairKey(user.officer_id, v.venue_id));
        return { ...v, status: s.status, label: STATUS_LABEL[s.status], signed_at: s.signing?.signed_at || null, signing_id: s.signing?.id || null, reference: s.signing?.reference || null };
      }).filter((v) => v.status !== 'none' || v.signing_id),
    };
  }),

  // Officer ticked "I have read and understood this" at the end of a document
  'venuePacks.read': def(['officer'], async (b, { user }) => {
    required(b, 'venue_id', 'procedure_id', 'version');
    await officerAtVenue(user.officer_id, b.venue_id);
    const d = (await packFor(b.venue_id)).find((x) => x.procedure_id === b.procedure_id);
    if (!d) fail(404, 'This document is no longer in the pack');
    if (Number(b.version) !== Number(d.version)) fail(409, 'This document has just been updated. Reopen it to read the latest version.', { code: 'stale' });
    const r = await one(`INSERT INTO pack_reads (officer_id, procedure_id, version) VALUES ($1,$2,$3)
      ON CONFLICT (officer_id, procedure_id, version) DO UPDATE SET read_at = pack_reads.read_at RETURNING read_at`, [user.officer_id, d.procedure_id, d.version]);
    return { ok: true, read_at: r.read_at };
  }),

  'venuePacks.sign': def(['officer'], async (b, { user, ip, event: ev }) => {
    required(b, 'venue_id', 'signature', 'signed_name');
    if (!PNG.test(String(b.signature)) || b.signature.length > 400000) fail(400, 'Invalid signature');
    const name = clip(b.signed_name, 120);
    if (!name) fail(400, 'Type your full name');
    await officerAtVenue(user.officer_id, b.venue_id);
    const pack = await packFor(b.venue_id);
    const st = await statusFor(user.officer_id, b.venue_id, { packs: new Map([[b.venue_id, pack]]) });
    if (OK.has(st.status)) fail(409, st.status === 'none' ? 'There is nothing to sign for this venue yet' : 'Your site pack is already signed and up to date');
    const reads = await q('SELECT procedure_id, version, read_at FROM pack_reads WHERE officer_id = $1 AND procedure_id = ANY($2::uuid[])', [user.officer_id, pack.map((d) => d.procedure_id)]);
    const readAt = new Map(reads.map((r) => [`${r.procedure_id}:${r.version}`, r.read_at]));
    const toRead = new Set(st.toRead);
    const missing = pack.filter((d) => toRead.has(d.procedure_id) && !readAt.has(`${d.procedure_id}:${d.version}`));
    if (missing.length) fail(400, `Read and tick ${missing.length === 1 ? `"${missing[0].title}"` : `${missing.length} more documents`} first`, { missing: missing.map((d) => d.procedure_id) });
    const before = new Map((st.signing?.items || []).map((i) => [i.procedure_id, i]));
    const items = pack.map((d) => {
      const reread = toRead.has(d.procedure_id);
      return {
        procedure_id: d.procedure_id, version: d.version, title: d.title, reread,
        read_at: reread ? readAt.get(`${d.procedure_id}:${d.version}`) : readAt.get(`${d.procedure_id}:${d.version}`) || before.get(d.procedure_id)?.read_at || st.signing?.signed_at,
      };
    });
    const ua = uaOf(ev);
    const row = await tx(async (t) => {
      const reference = await nextReference('venue_pack', t);
      const g = await t.one(`INSERT INTO pack_signings (officer_id, venue_id, items, signature, signed_name, signed_ip, signed_ua, reference)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [user.officer_id, b.venue_id, JSON.stringify(items), b.signature, name, ip, ua, reference]);
      await event('venue_pack', g.id, 'signed', { user, name, ip, ua }, t);
      return g;
    });
    const venue = await one('SELECT name FROM venues WHERE id = $1', [b.venue_id]);
    const out = await sealQuietly('venue_pack', row, await packInput(row), { userId: user.id, filename: packFile(row, venue.name) });
    await notify(await managersFor(b.venue_id), {
      kind: 'venue_pack', title: `Site pack signed: ${venue.name}`, body: `${name} signed the instructions and procedures (${row.reference})`,
      link: `/company/venues/${b.venue_id}?tab=pack`, dedupe: `pack-signed:${row.id}`,
    });
    await audit(user, 'venue_pack.sign', 'pack_signing', row.id, { venue_id: b.venue_id, reference: row.reference, ip });
    return { ok: true, reference: row.reference, id: row.id, filename: out?.filename };
  }),

  'venuePacks.pdf': def(['company', 'security', 'venue', 'officer'], async (b, { user }) => {
    required(b, 'id');
    const g = await signing(user, b.id);
    return pdfFor('venue_pack', { ...g, status: 'signed' }, () => packInput(g), { userId: user.id, filename: packFile(g, g.venue_name) });
  }),

  // The register: who is booked or has signed, where they stand, and every signing
  'venuePacks.register': def(VIEW, async (b, { user }) => {
    required(b, 'venue_id');
    await assertVenue(user, b.venue_id);
    let rows = await registerRows(b.venue_id);
    if (b.filter === 'action') rows = rows.filter((r) => r.next_shift && !OK.has(r.status));
    else if (b.filter === 'current') rows = rows.filter((r) => r.status === 'current');
    else if (b.filter === 'booked') rows = rows.filter((r) => r.next_shift);
    const term = clip(b.q, 80).toLowerCase();
    if (term) rows = rows.filter((r) => r.name.toLowerCase().includes(term) || String(r.reference || '').toLowerCase().includes(term));
    const signings = b.history ? (await history(b.venue_id, 200)).map((g) => ({
      id: g.id, reference: g.reference, signed_at: g.signed_at, officer_id: g.officer_id, name: `${g.first_name} ${g.last_name}`,
      documents: (g.items || []).map((i) => ({ title: i.title, version: i.version, reread: i.reread !== false })),
    })) : undefined;
    return { rows, signings };
  }),

  'venuePacks.export': def(VIEW, async (b, { user }) => {
    required(b, 'venue_id');
    await assertVenue(user, b.venue_id);
    const venue = need(await one('SELECT name FROM venues WHERE id = $1', [b.venue_id]), 'Venue not found');
    const [rows, signings, pack] = await Promise.all([registerRows(b.venue_id), history(b.venue_id, 2000), packFor(b.venue_id)]);
    const stamp = new Date().toISOString().slice(0, 10);
    const base = `Venue pack register - ${venue.name} - ${stamp}`.replace(/[\\/:*?"<>|]/g, '');
    if (b.format === 'csv') {
      const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const csv = [['Officer', 'Status', 'Next shift', 'Signed', 'Reference', 'Documents signed'].join(',')]
        .concat(signings.map((g) => {
          const r = rows.find((x) => x.officer_id === g.officer_id);
          return [`${g.first_name} ${g.last_name}`, r?.signing_id === g.id ? r.label : 'Earlier signing', r?.signing_id === g.id && r.next_shift ? fmtDateTime(r.next_shift) : '',
            fmtDateTime(g.signed_at), g.reference, (g.items || []).map((i) => `${i.title} v${i.version}`).join('; ')].map(esc).join(',');
        }))
        .concat(rows.filter((r) => !r.signing_id).map((r) => [r.name, r.label, r.next_shift ? fmtDateTime(r.next_shift) : '', '', '', ''].map(esc).join(',')))
        .join('\n');
      return { filename: `${base}.csv`, csv };
    }
    const doc = await Doc.create(`${venue.name} - venue pack register`, { unicode: true });
    await doc.header(await getSettings(), 'Venue pack register', venue.name);
    const booked = rows.filter((r) => r.next_shift);
    doc.meta([['Venue', venue.name], ['Printed', fmtDateTime(new Date())]],
      [['Booked officers', String(booked.length)], ['Up to date', String(booked.filter((r) => OK.has(r.status)).length)]]);
    doc.section('Documents in the pack');
    if (pack.length) doc.table([{ label: 'Document', width: 0.6 }, { label: 'Version', width: 0.15 }, { label: 'Published', width: 0.25 }], pack.map((d) => [d.title, `v${d.version}`, fmtDate(d.published_at)]));
    else doc.text('Nothing is published for this venue yet.', { size: 9.5 });
    doc.section('Officers');
    doc.table([{ label: 'Officer', width: 0.3 }, { label: 'Status', width: 0.18 }, { label: 'Signed', width: 0.2 }, { label: 'Reference', width: 0.17 }, { label: 'Next shift', width: 0.15 }],
      rows.map((r) => [r.name, r.label, r.signed_at ? fmtDateTime(r.signed_at) : '-', r.reference || '-', r.next_shift ? fmtDate(r.next_shift) : '-']));
    doc.section('All signings');
    if (signings.length) doc.table([{ label: 'Signed', width: 0.2 }, { label: 'Officer', width: 0.25 }, { label: 'Reference', width: 0.17 }, { label: 'Documents', width: 0.38 }],
      signings.map((g) => [fmtDateTime(g.signed_at), `${g.first_name} ${g.last_name}`, g.reference, (g.items || []).map((i) => `${i.title} v${i.version}`).join(', ')]));
    else doc.text('No one has signed yet.', { size: 9.5 });
    doc.footer('Each signing has a sealed PDF with the full wording read, the signature and a certificate. Check any reference on the verify page.');
    await doc.credit();
    return { filename: `${base}.pdf`, pdf: Buffer.from(await doc.pdf.save()).toString('base64') };
  }),

  // One officer's signings and where they stand at their venues (manager's profile view)
  'venuePacks.officer': def(MGR, async (b, { user }) => {
    required(b, 'officer_id');
    await assertOfficerAccess(user, b.officer_id);
    const scope = await venueScope(user);
    const venues = await q(`SELECT DISTINCT v.id AS venue_id, v.name FROM venues v WHERE ($2::uuid[] IS NULL OR v.id = ANY($2)) AND v.id IN (
        SELECT s.venue_id FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id WHERE a.officer_id = $1 AND ${BOOKED} AND s.ends_at > now()
        UNION SELECT venue_id FROM pack_signings WHERE officer_id = $1) ORDER BY v.name`, [b.officer_id, scope]);
    const st = await statusesFor(venues.map((v) => ({ officer_id: b.officer_id, venue_id: v.venue_id })));
    const signings = await q(`SELECT g.id, g.reference, g.signed_at, g.venue_id, v.name AS venue_name FROM pack_signings g JOIN venues v ON v.id = g.venue_id
      WHERE g.officer_id = $1 AND ($2::uuid[] IS NULL OR g.venue_id = ANY($2)) ORDER BY g.signed_at DESC LIMIT 100`, [b.officer_id, scope]);
    return {
      venues: venues.map((v) => { const s = st.get(pairKey(b.officer_id, v.venue_id)); return { ...v, status: s.status, label: STATUS_LABEL[s.status] }; }).filter((v) => v.status !== 'none'),
      signings,
    };
  }),

  // The client (or a manager) suggests a change; only our managers change and publish
  'venuePacks.suggest': def(VIEW, async (b, { user }) => {
    required(b, 'procedure_id', 'venue_id', 'body');
    await assertVenue(user, b.venue_id);
    const p = await procedure(b.procedure_id);
    if (p.scope === 'venue' && p.venue_id !== b.venue_id) fail(400, 'This document belongs to another venue');
    const s = await one(`INSERT INTO procedure_suggestions (procedure_id, venue_id, section, body, author_id) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [p.id, b.venue_id, clip(b.section, 200), clip(b.body, 4000), user.id]);
    const venue = await one('SELECT name FROM venues WHERE id = $1', [b.venue_id]);
    await notify((await managersFor(b.venue_id)).filter((id) => id !== user.id), {
      kind: 'venue_pack', title: `Suggested change: ${p.title}`, body: `${user.name || 'The client'} (${venue.name}): ${clip(b.body, 160)}`,
      link: `/company/people/procedures/${p.id}`, email: true,
    });
    await audit(user, 'procedure.suggest', 'procedure', p.id, { venue_id: b.venue_id });
    return s;
  }),

  'venuePacks.suggestions': def(VIEW, async (b, { user }) => {
    required(b, 'venue_id');
    await assertVenue(user, b.venue_id);
    return {
      suggestions: await q(`SELECT s.*, p.title AS procedure_title, u.name AS author_name FROM procedure_suggestions s JOIN procedures p ON p.id = s.procedure_id
        LEFT JOIN users u ON u.id = s.author_id WHERE s.venue_id = $1 ORDER BY (s.status = 'open') DESC, s.created_at DESC LIMIT 100`, [b.venue_id]),
    };
  }),

  'venuePacks.resolveSuggestion': def(MGR, async (b, { user }) => {
    required(b, 'id', 'status');
    if (!['accepted', 'dismissed', 'open'].includes(b.status)) fail(400, 'Unknown status');
    const s = need(await one('SELECT s.*, p.title FROM procedure_suggestions s JOIN procedures p ON p.id = s.procedure_id WHERE s.id = $1', [b.id]), 'Suggestion not found');
    if (s.venue_id) await assertVenue(user, s.venue_id);
    await q(`UPDATE procedure_suggestions SET status = $2, reply = $3, resolved_by = $4, resolved_at = CASE WHEN $2 = 'open' THEN NULL ELSE now() END WHERE id = $1`,
      [s.id, b.status, clip(b.reply, 2000), user.id]);
    if (b.status !== 'open' && s.author_id && s.author_id !== user.id) {
      await notify([s.author_id], {
        kind: 'venue_pack', title: `Your suggestion on "${s.title}" was ${b.status === 'accepted' ? 'accepted' : 'not taken forward'}`,
        body: clip(b.reply, 300) || (b.status === 'accepted' ? 'It will appear once the updated document is published.' : ''), link: '/venue/site',
      });
    }
    return { ok: true };
  }),
};

/** A general procedure limited to chosen venues: exactly these, keeping each venue's order. */
async function setChosenVenues(procedureId, venueIds) {
  const ids = [...new Set(venueIds.filter(Boolean))];
  await q('DELETE FROM procedure_venues WHERE procedure_id = $1 AND NOT (venue_id = ANY($2::uuid[]))', [procedureId, ids]);
  for (const v of ids) {
    await q(`INSERT INTO procedure_venues (procedure_id, venue_id, excluded) VALUES ($1,$2,false) ON CONFLICT (procedure_id, venue_id) DO UPDATE SET excluded = false`, [procedureId, v]);
  }
}
