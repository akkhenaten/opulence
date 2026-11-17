// AI on incident reports: the officer's draft from photos + rough notes, and the manager's evidence review.
// Suggestions only — nothing is written to a report unless a person accepts it.
import { createHash } from 'node:crypto';
import { one, q } from '../lib/db.mjs';
import { fail, required, need } from '../lib/http.mjs';
import { getObjectBytes, headObject } from '../lib/storage.mjs';
import { assertVenue, venueScope } from '../lib/scope.mjs';
import { extract, fileBlock, canRead, SONNET } from '../lib/ai.mjs';
import { fmtDateTime } from '../lib/time.mjs';
import { audit } from '../lib/audit.mjs';
import { getSettings } from './settings.mjs';
import { loadFull, ownUpload, TYPES, actions as incidentActions } from './incidents.mjs';
import { MGR, def } from './_def.mjs';

const MAX_IMAGES = 12;
const MAX_PDFS = 3;
const MAX_IMAGE_BYTES = 4.5 * 1024 * 1024;
const MAX_TOTAL = 15 * 1024 * 1024;
const aiOn = (s) => (s.ops_jobs || {}).incident_ai !== false;

const RULES = `Rules for photos and documents:
- Describe only what is visible. Never identify anyone, never guess a name, and never state ethnicity, religion or exact age — broad terms only ("a man in a dark jacket", "a young adult").
- You may read visible text: signs, number plates, documents, receipts, screens.
- Never invent facts. If something is unclear, say so or leave it out.
- Write in plain British English, past tense, third person, as an SIA officer would in a formal report.`;

// Load readable files as content blocks within the size limits; files the model cannot read are listed by name
async function loadBlocks(files) {
  const blocks = [];
  const used = [];
  const skipped = [];
  let total = 0;
  let images = 0;
  let pdfs = 0;
  for (const f of files) {
    const isPdf = f.mime === 'application/pdf';
    const ok = canRead(f.mime) && (isPdf ? pdfs < MAX_PDFS : images < MAX_IMAGES)
      && (f.size_bytes == null || ((isPdf || f.size_bytes <= MAX_IMAGE_BYTES) && total + f.size_bytes <= MAX_TOTAL));
    if (!ok) { skipped.push(f); continue; }
    const bytes = await getObjectBytes(f.key);
    if ((!isPdf && bytes.length > MAX_IMAGE_BYTES) || total + bytes.length > MAX_TOTAL) { skipped.push(f); continue; }
    total += bytes.length;
    if (isPdf) pdfs++; else images++;
    used.push(f);
    blocks.push({ type: 'text', text: `File ${used.length}: ${f.name || 'unnamed'}` }, fileBlock(bytes, f.mime));
  }
  return { blocks, used, skipped };
}

const field = (desc, type = 'string') => ({
  type: 'object',
  properties: { value: { type, description: desc }, source: { type: 'string', enum: ['notes', 'photo', 'both'], description: 'Where this came from' } },
  required: ['value', 'source'],
});

const REVIEW_TOOL = {
  name: 'evidence_review',
  description: 'Evidence review of an incident report for the manager.',
  input_schema: {
    type: 'object',
    properties: {
      captions: { type: 'array', items: { type: 'object', properties: { file: { type: 'integer' }, text: { type: 'string', description: 'One sentence on what the file shows' } }, required: ['file', 'text'] } },
      summary: { type: 'string', description: '2–4 sentences: what the evidence shows overall' },
      mismatches: { type: 'array', items: { type: 'string' }, description: 'Where the photos or files contradict the written report. Each item names the file and the report field.' },
      missing: { type: 'array', items: { type: 'string' }, description: 'Information a manager or the police would expect that the report does not give' },
    },
    required: ['captions', 'summary', 'mismatches', 'missing'],
  },
};

const reportText = (inc) => [
  `Type: ${inc.type}`, `Severity: ${inc.severity}`, `When: ${fmtDateTime(inc.occurred_at)}`, inc.created_at ? `Reported: ${fmtDateTime(inc.created_at)}` : '', `Venue: ${inc.venue_name}`, `Location: ${inc.location || '—'}`,
  `Description: ${inc.description || '—'}`, `People involved: ${inc.people_involved || '—'}`, `Injuries: ${inc.injuries || '—'}`,
  `Actions taken: ${inc.actions_taken || '—'}`, `Force used: ${inc.force_used ? `yes — ${inc.force_justification}` : 'no'}`,
  `Police called: ${inc.police_called ? 'yes' : 'no'}`, `Ambulance called: ${inc.ambulance_called ? 'yes' : 'no'}`,
  `Witnesses: ${(inc.witnesses || []).map((w) => `${w.name}: ${w.statement || ''}`).join('; ') || 'none'}`,
].join('\n');

export const summarySig = (inc) => createHash('sha1').update(`${inc.version}|${inc.attachments.map((a) => a.id).sort().join(',')}`).digest('hex').slice(0, 16);

// Builds and saves the evidence summary. Errors other than the AI cap are saved too, so the scan doesn't retry forever.
export async function reviewIncident(id) {
  const inc = await loadFull(id);
  const sig = summarySig(inc);
  const files = inc.attachments.map((a) => ({ id: a.id, key: a.s3_key, mime: a.mime, name: a.name, size_bytes: a.size_bytes }));
  let summary;
  let credits = 0;
  try {
    const { blocks, used, skipped } = await loadBlocks(files);
    const text = `Written report:\n${reportText(inc)}\n\n${used.length ? `${used.length} file(s) follow.` : 'No readable files.'}${skipped.length ? `\nNot readable here: ${skipped.map((f) => f.name).join(', ')}` : ''}`;
    const r = await extract({
      model: SONNET, max_tokens: 1500,
      system: `You review incident reports for a UK security company manager. Compare the written report with the attached photos and files.\n${RULES}\n- Only list a mismatch when the evidence clearly contradicts the report.`,
      messages: [{ role: 'user', content: [{ type: 'text', text }, ...blocks] }],
      tool: REVIEW_TOOL,
    });
    credits = r.credits;
    const out = r.input || {};
    summary = {
      captions: (out.captions || []).map((c) => ({ attachment_id: used[c.file - 1]?.id, text: c.text })).filter((c) => c.attachment_id),
      summary: out.summary || '', mismatches: out.mismatches || [], missing: out.missing || [],
      skipped: skipped.map((f) => f.name), credits,
    };
  } catch (e) {
    if (e.status === 429) throw e;
    console.error('[incidentAi] review failed', id, e.message);
    summary = { error: e.message || 'AI review failed' };
  }
  await q('UPDATE incidents SET ai_summary = $2, ai_summary_sig = $3, ai_summary_at = now() WHERE id = $1', [id, summary, sig]);
  await raiseEvidenceCard(inc, summary, sig).catch((e) => console.error('[incidentAi] evidence card', id, e.message));
  return { ...summary, sig };
}

/** What to ask the officer for, from the review: contradictions first, then what's missing */
export function evidenceAsk(summary) {
  const lines = [...(summary.mismatches || []).map((m) => `Please check: ${m}`), ...(summary.missing || []).map((m) => `Please add: ${m}`)];
  return lines.slice(0, 6).join('\n');
}

// A report whose files contradict it, or that leaves out what a manager or the police would expect, gets an Orb card
async function raiseEvidenceCard(inc, summary, sig) {
  if (summary.error || inc.status !== 'submitted') return;
  const mismatches = summary.mismatches || [];
  const missing = summary.missing || [];
  if (!mismatches.length && !missing.length) return;
  const { createItem } = await import('./ops.mjs');
  // A newer review replaces the open card for this report
  await q("UPDATE ops_items SET status = 'done', decided_at = now(), result = '{\"auto_closed\":true}' WHERE kind = 'incident' AND status = 'pending' AND payload->>'incident_id' = $1", [inc.id]);
  await createItem({
    kind: 'incident', venue_id: inc.venue_id, officer_id: inc.officer_id || null, quiet: !mismatches.length, severity: 'warning',
    title: `${inc.ref}: ${mismatches.length ? 'the evidence doesn\'t match the report' : 'details missing from the report'}`,
    reason: summary.summary || '',
    payload: { incident_id: inc.id, ref: inc.ref, venue_name: inc.venue_name, officer_name: inc.officer_name, mismatches, missing, ask: evidenceAsk(summary) },
    dedupe: `incident:${inc.id}:${sig}`,
  });
}

/** Orb's evidence card: send the report back to the officer with what's needed, or just mark it reviewed */
export async function decideIncident(it, b, user) {
  const inc = need(await one('SELECT id, officer_id, status, ref FROM incidents WHERE id = $1', [it.payload.incident_id]), 'Report not found');
  const ask = String(b.edits?.ask ?? it.payload.ask ?? '').trim().slice(0, 2000);
  if (b.edits?.send === false || !inc.officer_id || !ask) return { reviewed: true };
  if (inc.status === 'closed') fail(409, 'This report is already closed');
  await incidentActions['incidents.review'].fn({ id: inc.id, decision: 'changes_requested', comment: ask }, { user });
  return { sent_back: true };
}

// Ops job: review up to 2 submitted reports that have never been reviewed. Edits after that don't queue another AI run;
// the manager's Check again (incidents.aiReview) does, and the page says when the summary is older than the report
export async function evidenceScan(s) {
  if (!aiOn(s)) return 'off';
  const rows = await q(
    `SELECT i.id FROM incidents i
      WHERE i.status = 'submitted' AND i.updated_at > now() - interval '30 days'
        AND EXISTS (SELECT 1 FROM incident_attachments x WHERE x.incident_id = i.id AND x.removed_at IS NULL)
        AND i.ai_summary_at IS NULL
      ORDER BY i.updated_at DESC LIMIT 2`);
  let n = 0;
  for (const r of rows) {
    try {
      await reviewIncident(r.id);
      n++;
    } catch (e) {
      if (e.status === 429) return `${n} (AI cap reached)`;
      throw e;
    }
  }
  return n;
}

// The officer's files (their own uploads, or ones already on the report) and the shift, checked against who is asking
async function gather(b, user, keys) {
  const officer = user.role === 'officer';
  let own = [];
  if (b.incident_id) {
    const inc = need(await one('SELECT id, officer_id, venue_id FROM incidents WHERE id = $1', [b.incident_id]));
    if (!officer) await assertVenue(user, inc.venue_id);
    else if (inc.officer_id !== user.officer_id) fail(403, 'Forbidden');
    own = await q('SELECT s3_key, mime, name, size_bytes FROM incident_attachments WHERE incident_id = $1 AND removed_at IS NULL', [inc.id]);
  }
  const files = [];
  for (const key of keys) {
    const saved = own.find((a) => a.s3_key === key);
    if (saved) { files.push({ key, mime: saved.mime, name: saved.name, size_bytes: saved.size_bytes }); continue; }
    if (!ownUpload(user, key)) fail(400, 'Invalid file');
    const head = await headObject(key);
    if (head) files.push({ key, mime: head.mime, name: key.split('/').pop().replace(/^[0-9a-f-]{36}-/, ''), size_bytes: head.size });
  }
  const shift = b.shift_id ? await one(
    `SELECT s.starts_at, s.ends_at, v.name AS venue_name, r.name AS role_name FROM shifts s JOIN venues v ON v.id = s.venue_id JOIN roles r ON r.code = s.role
      WHERE s.id = $1 AND ($3::uuid[] IS NULL OR s.venue_id = ANY($3))
        AND ($2::uuid IS NULL OR EXISTS (SELECT 1 FROM shift_assignments a WHERE a.shift_id = s.id AND a.officer_id = $2))`,
    [b.shift_id, officer ? user.officer_id : null, officer ? null : await venueScope(user)]) : null;
  return { shift, ...(await loadBlocks(files)) };
}

const para = (desc) => ({ type: 'string', description: desc });
const WRITE_TOOL = {
  name: 'incident_report',
  description: 'The finished incident report, written from the officer\'s notes and photos',
  input_schema: {
    type: 'object',
    properties: {
      title: para('A short neutral title, 4–9 words, e.g. "Refused entry and assault at main door"'),
      sections: {
        type: 'object',
        properties: {
          what: para('What happened, in time order, in short paragraphs separated by a blank line'),
          people: para('People involved and witnesses, broad descriptions; names only where the officer gave them'),
          injuries: para('Injuries seen or reported, or "None reported"'),
          actions: para('What the officers did, including police or ambulance contact'),
          force_justification: para('Only if force was used: why it was necessary, reasonable and proportionate, from the notes. Otherwise empty.'),
        },
        required: ['what', 'people', 'injuries', 'actions'],
      },
      photos: {
        type: 'array',
        description: 'One entry per photo file, in file order',
        items: {
          type: 'object',
          properties: {
            file: { type: 'integer', description: 'The file number as given ("File 1" is 1)' },
            section: { type: 'string', enum: ['what', 'people', 'injuries', 'actions'], description: 'The section the photo supports' },
            caption: para('A factual caption, one short sentence, what is visible only'),
          },
          required: ['file', 'section', 'caption'],
        },
      },
      chips: {
        type: 'object',
        description: 'Facts for the report header; leave out any the notes and photos do not show',
        properties: {
          type: field(`One of: ${TYPES.join(', ')}`),
          severity: field('One of: low, medium, high, critical'),
          location: field('Where in or near the venue'),
          police_called: field('Whether police were called', 'boolean'),
          ambulance_called: field('Whether an ambulance was called', 'boolean'),
          force_used: field('Whether any officer used force', 'boolean'),
        },
      },
      questions: { type: 'array', items: { type: 'string' }, description: 'Short questions for the officer where facts a report needs are missing or the notes and photos disagree. At most 4.' },
    },
    required: ['title', 'sections', 'questions'],
  },
};
const SECTION_KEYS = ['what', 'people', 'injuries', 'actions', 'force_justification'];

export const actions = {
  // The writing page: Orb writes the whole report (or redoes one section) from the officer's notes, people, facts and photos
  'incidents.aiWrite': def(['officer', 'company', 'security'], async (b, { user }) => {
    const officer = user.role === 'officer';
    if (!aiOn(await getSettings())) fail(400, 'AI on incidents is switched off by your company');
    const keys = [...new Set(b.keys || [])].slice(0, 20);
    const notes = String(b.notes || '').slice(0, 12000);
    if (!keys.length && !notes.trim()) fail(400, 'Write a few notes or add a photo first');
    const section = SECTION_KEYS.includes(b.section) ? b.section : null;
    const instruction = String(b.instruction || '').slice(0, 1000);
    const { shift, blocks, used, skipped } = await gather(b, user, keys);
    const captions = b.captions && typeof b.captions === 'object' ? b.captions : {};
    const people = (Array.isArray(b.people) ? b.people : []).slice(0, 20).filter((p) => p && typeof p === 'object')
      .map((p) => ['name', 'role', 'statement', 'injuries'].map((k) => (p[k] ? `${k}: ${String(p[k]).slice(0, 1500)}` : '')).filter(Boolean).join('; '))
      .filter(Boolean);
    const chips = Object.entries(b.chips || {}).filter(([, v]) => v !== '' && v != null).map(([k, v]) => `${k}: ${String(v).slice(0, 500)}`).join('\n');
    const answers = (Array.isArray(b.answers) ? b.answers : []).slice(0, 8).filter((a) => a?.answer)
      .map((a) => `Q: ${String(a.question || '').slice(0, 300)}\nA: ${String(a.answer).slice(0, 1000)}`).join('\n');
    const current = b.current && typeof b.current === 'object'
      ? SECTION_KEYS.filter((k) => b.current[k]).map((k) => `[${k}]\n${String(b.current[k]).slice(0, 6000)}`).join('\n\n') : '';
    const text = [
      officer ? `Officer: ${user.name}.` : `Written by ${user.name} from the office, not the officer on the door.`,
      shift ? `Shift: ${shift.role_name} at ${shift.venue_name}, ${fmtDateTime(shift.starts_at)} to ${fmtDateTime(shift.ends_at)}.` : '',
      b.occurred_at ? `Incident time given: ${fmtDateTime(b.occurred_at)}.` : '',
      `Officer's notes:\n${notes || '(none)'}`,
      people.length ? `People the officer added:\n${people.map((p) => `- ${p}`).join('\n')}` : '',
      chips ? `Facts the officer set:\n${chips}` : '',
      answers ? `The officer answered your questions:\n${answers}` : '',
      current ? `The current version of the report:\n${current}` : '',
      section ? `Rewrite only the "${section}" section${instruction ? `, following this instruction from the officer: ${instruction}` : ''}. Return the other sections exactly as they are in the current version.` : '',
      used.length ? `${used.length} photo(s)/file(s) follow.${used.some((f) => captions[f.key]?.caption) ? ` Captions the officer wrote: ${used.map((f, i) => (captions[f.key]?.caption ? `File ${i + 1}: ${String(captions[f.key].caption).slice(0, 300)}` : '')).filter(Boolean).join('; ')}` : ''}` : 'No photos.',
      skipped.length ? `Not readable here: ${skipped.map((f) => f.name).join(', ')}` : '',
    ].filter(Boolean).join('\n\n');
    const r = await extract({
      model: SONNET, max_tokens: 3000, timeout: 90000,
      system: `You write the final incident report for a UK SIA-licensed security officer from their notes and photos. The officer reads and edits it, then signs it as their own account, so it must be factual and neutral.\n${RULES}\n- The officer's notes and answers are the main source; photos add detail. Never add facts that are not in them.\n- Neutral wording: no opinions, no blame, no emotive words. Quote what people said only if the notes do.\n- Don't contradict the officer; raise it as a question instead.\n- Place each photo under the section it best supports and caption it with what is visible.`,
      messages: [{ role: 'user', content: [{ type: 'text', text }, ...blocks] }],
      tool: WRITE_TOOL,
    });
    const out = r.input || {};
    const sections = Object.fromEntries(SECTION_KEYS.map((k) => [k, String(out.sections?.[k] || '').trim()]));
    if (section && b.current) for (const k of SECTION_KEYS) if (k !== section) sections[k] = String(b.current[k] || '');
    const photos = (Array.isArray(out.photos) ? out.photos : [])
      .map((p) => ({ key: used[(Number(p.file) || 0) - 1]?.key, section: ['what', 'people', 'injuries', 'actions'].includes(p.section) ? p.section : 'what', caption: String(p.caption || '').slice(0, 300) }))
      .filter((p) => p.key && !String(used.find((f) => f.key === p.key)?.mime).includes('pdf'));
    const outChips = Object.fromEntries(Object.entries(out.chips || {}).filter(([, v]) => v && v.value !== undefined && v.value !== ''));
    if (outChips.type && !TYPES.includes(outChips.type.value)) delete outChips.type;
    if (outChips.severity && !['low', 'medium', 'high', 'critical'].includes(outChips.severity.value)) delete outChips.severity;
    await audit(user, 'incident.ai_write', 'incident', b.incident_id || null, { files: used.length, section, credits: r.credits });
    return {
      title: String(out.title || '').slice(0, 200), sections, photos, chips: outChips,
      questions: (Array.isArray(out.questions) ? out.questions : []).slice(0, 4).map(String),
      skipped: skipped.map((f) => f.name), credits: r.credits,
    };
  }),

  // Manager: build or refresh the evidence summary now
  'incidents.aiReview': def(MGR, async (b, { user }) => {
    required(b, 'id');
    if (!aiOn(await getSettings())) fail(400, 'AI on incidents is switched off in Live operations › Settings');
    const inc = await loadFull(b.id);
    await assertVenue(user, inc.venue_id);
    if (!b.force && inc.ai_summary && inc.ai_summary_sig === summarySig(inc)) return inc.ai_summary;
    const out = await reviewIncident(inc.id);
    await audit(user, 'incident.ai_review', 'incident', inc.id, { credits: out.credits || 0 });
    return out;
  }),
};
