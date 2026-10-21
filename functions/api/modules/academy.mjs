// Orb Academy: courses with lessons, quick checks and an end-of-course quiz.
// AI drafts courses section by section; a company manager edits and publishes. Passing issues an in-house certificate.
import { one, q, tx } from '../lib/db.mjs';
import { fail, need, required } from '../lib/http.mjs';
import { audit } from '../lib/audit.mjs';
import { isManager, requireOfficer } from '../lib/auth.mjs';
import { claude, drawImage, extract, SONNET } from '../lib/ai.mjs';
import { downloadUrl, putObject } from '../lib/storage.mjs';
import crypto from 'node:crypto';
import { notify, officerUser, companyManagers } from '../lib/notify.mjs';
import { requireModule, moduleOn } from '../lib/modules.mjs';
import { CONTENT_RULES, reviewDate, venueTeam } from '../lib/learn.mjs';
import { addDays, fmtDate, londonDate } from '../lib/time.mjs';
import { CO, MGR, def } from './_def.mjs';

const STAFF = ['company', 'security', 'officer'];
const TOPICS = ['law', 'operations', 'first_aid'];

// The starter library a manager can draft in one go (from the spec)
export const STARTER_TOPICS = [
  { topic: 'law', title: 'Your role, the SIA and your licence', notes: 'Licensing, SIA standards of behaviour, displaying the licence, what happens if it is revoked or suspended.' },
  { topic: 'law', title: 'Powers of arrest and detention', notes: 'Any-person arrest under PACE s24A, when it is lawful, how to carry it out safely, handover to police, citizens\' arrest risks.' },
  { topic: 'law', title: 'Use of force and self-defence', notes: 'Criminal Law Act 1967 s3, common law self-defence, reasonable and proportionate force, recording and justifying force.' },
  { topic: 'law', title: 'Searching, entry and ejection', notes: 'Search with consent, conditions of entry, refusing entry and ejecting under the Licensing Act 2003, Equality Act 2010 duties.' },
  { topic: 'law', title: 'Data protection, CCTV and body-worn video', notes: 'UK GDPR basics, ICO guidance, subject access requests, retention, what officers may share.' },
  { topic: 'operations', title: 'Conflict management', notes: 'Recognising triggers and warning signs, de-escalation, communication, exit routes, after an incident.' },
  { topic: 'operations', title: 'Vulnerable people, Ask for Angela and spiking', notes: 'Recognising vulnerability, WAVE, Ask for Angela, suspected spiking, safe handover, under-18s.' },
  { topic: 'operations', title: 'Drugs, weapons and dangerous items', notes: 'Finding drugs or weapons, safe handling, preserving evidence, police contact, venue policy.' },
  { topic: 'operations', title: 'Counter-terrorism awareness and Martyn\'s Law', notes: 'ACT awareness, suspicious behaviour and items, HOT principles, Run Hide Tell, the Terrorism (Protection of Premises) Act 2025.' },
  { topic: 'operations', title: 'Crowd safety and evacuation', notes: 'Crowd density and dynamics, queues, fire alarms, evacuation roles, communication.' },
  { topic: 'operations', title: 'Writing good incident reports', notes: 'Facts not opinions, times, descriptions, use of force records, evidence, body-worn video references.' },
  { topic: 'first_aid', title: 'First aid awareness for security officers', notes: 'Primary survey (DRABC), CPR and defibrillators, recovery position, severe bleeding, choking, seizures, head injury, overdose and intoxication. Awareness level only.' },
];

const OUTLINE_TOOL = {
  name: 'save_outline', description: 'Save the course outline',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      summary: { type: 'string', description: 'Two sentences: what the officer will be able to do afterwards' },
      sections: { type: 'string', description: '4-7 sections in teaching order, one per line, as "Section title :: what it must cover in one or two sentences"' },
      sources: { type: 'string', description: 'Named sources relied on, one per line' },
    },
    required: ['title', 'summary', 'sections', 'sources'],
  },
};

const QUESTION = {
  type: 'object',
  properties: {
    kind: { type: 'string', enum: ['mcq', 'scenario'], description: 'scenario = a short realistic situation followed by "What should you do?"' },
    prompt: { type: 'string' },
    options: { type: 'array', items: { type: 'string' }, description: 'Exactly 4 options, one clearly correct, the others plausible' },
    answer: { type: 'integer', description: 'Index (0-3) of the correct option' },
    explain: { type: 'string', description: 'One or two sentences on why the answer is right' },
  },
  required: ['kind', 'prompt', 'options', 'answer', 'explain'],
};

// Visuals and activities for a section, as one-per-line text (list fields break in tool calls)
const BLOCK_FIELDS = {
  key_facts: { type: 'string', description: '2-4 key numbers or short facts from the lesson, one per line, as "value :: label", e.g. "999 :: Call first in any emergency". Value at most 12 characters.' },
  steps_title: { type: 'string', description: 'Title of the step flow, e.g. "If someone collapses"' },
  steps: { type: 'string', description: '3-7 steps in order, one per line, each under 15 words' },
  dos: { type: 'string', description: '2-5 things to do, one per line, each under 15 words' },
  donts: { type: 'string', description: "2-5 things not to do, one per line, each under 15 words" },
  options_situation: { type: 'string', description: 'A realistic situation an officer meets on shift, 1-3 sentences, ending with "What would you do?"' },
  options: { type: 'string', description: '3-4 possible responses, one per line, as "best|ok|poor :: response :: why (one sentence)". Exactly one best and at least one poor.' },
  image_prompt: { type: 'string', description: 'A picture idea for the section: one scene described in 1-2 sentences (place, people, what is happening). No text in the picture.' },
  image_caption: { type: 'string', description: 'Caption under the picture, under 12 words' },
};
const BLOCKS_REQUIRED = ['key_facts', 'steps_title', 'steps', 'dos', 'donts', 'options_situation', 'options', 'image_prompt', 'image_caption'];
const BLOCKS_TOOL = {
  name: 'save_visuals', description: 'Save the visuals and activities for one lesson section',
  input_schema: { type: 'object', properties: BLOCK_FIELDS, required: BLOCKS_REQUIRED },
};

const str = (x, n) => String(x ?? '').trim().slice(0, n);
const RATINGS = ['best', 'ok', 'poor'];
const BLOCK_ORDER = ['image', 'key_facts', 'steps', 'dos_donts', 'options'];

// Blocks from the AI's text fields; an existing picture is kept (its prompt and caption updated)
function toBlocks(x, old = []) {
  const pair = (l) => l.split('::').map((p) => p.trim());
  const prev = old.find((b) => b.type === 'image');
  return cleanBlocks([
    { ...(prev || { source: 'ai' }), type: 'image', prompt: x.image_prompt, caption: x.image_caption || prev?.caption },
    { type: 'key_facts', facts: lines(x.key_facts).map((l) => { const [value, ...label] = pair(l); return { value, label: label.join(' ') }; }) },
    { type: 'steps', title: x.steps_title, steps: lines(x.steps) },
    { type: 'dos_donts', do: lines(x.dos), dont: lines(x.donts) },
    { type: 'options', situation: x.options_situation, choices: lines(x.options).map((l) => { const [rating, text, ...why] = pair(l); return { rating: String(rating).toLowerCase(), text, why: why.join(' ') }; }) },
  ]);
}

// Validate blocks from the editor or the AI: known types, one of each, sizes capped; a block that is too thin is dropped
export function cleanBlocks(raw) {
  const out = {};
  for (const b of Array.isArray(raw) ? raw : []) {
    if (!b || out[b.type]) continue;
    const list = (a, n) => (Array.isArray(a) ? a : []).map((t) => str(t, 160)).filter(Boolean).slice(0, n);
    if (b.type === 'image') {
      const key = b.key ? str(b.key, 300) : null;
      if (key && !/^docs\/learn\//.test(key)) fail(400, 'That picture is not a lesson upload');
      if (key || str(b.prompt, 1)) out.image = { type: 'image', key, prompt: str(b.prompt, 600), caption: str(b.caption, 140), source: b.source === 'upload' ? 'upload' : 'ai' };
    } else if (b.type === 'key_facts') {
      const facts = (Array.isArray(b.facts) ? b.facts : []).map((f) => ({ value: str(f?.value, 16), label: str(f?.label, 80) })).filter((f) => f.value && f.label).slice(0, 4);
      if (facts.length >= 1) out.key_facts = { type: 'key_facts', facts };
    } else if (b.type === 'steps') {
      const steps = list(b.steps, 8);
      if (steps.length >= 2) out.steps = { type: 'steps', title: str(b.title, 80), steps };
    } else if (b.type === 'dos_donts') {
      const d = { type: 'dos_donts', do: list(b.do, 6), dont: list(b.dont, 6) };
      if (d.do.length || d.dont.length) out.dos_donts = d;
    } else if (b.type === 'options') {
      const choices = (Array.isArray(b.choices) ? b.choices : []).map((c) => ({ text: str(c?.text, 240), rating: RATINGS.includes(c?.rating) ? c.rating : 'ok', why: str(c?.why, 300) })).filter((c) => c.text).slice(0, 5);
      const situation = str(b.situation, 600);
      if (situation && choices.length >= 2 && choices.some((c) => c.rating === 'best') && choices.some((c) => c.rating === 'poor')) out.options = { type: 'options', situation, choices };
    }
  }
  return BLOCK_ORDER.filter((t) => out[t]).map((t) => out[t]);
}

// Signed picture links for the client; officers get the options in a random order
async function viewBlocks(blocks, { mix = false } = {}) {
  return Promise.all((blocks || []).map(async (b) => {
    if (b.type === 'image') return { ...b, url: b.key ? await downloadUrl(b.key) : null };
    if (b.type === 'options' && mix) return { ...b, choices: shuffle(b.choices, 0).options };
    return b;
  }));
}

// Blocks as plain text, for the tutor
const blocksText = (blocks) => (blocks || []).map((b) => {
  if (b.type === 'key_facts') return `Key facts: ${b.facts.map((f) => `${f.value} = ${f.label}`).join('; ')}`;
  if (b.type === 'steps') return `${b.title || 'Steps'}: ${b.steps.map((t, i) => `${i + 1}) ${t}`).join(' ')}`;
  if (b.type === 'dos_donts') return `Do: ${b.do.join('; ')}\nDon't: ${b.dont.join('; ')}`;
  if (b.type === 'options') return `Activity: ${b.situation}\n${b.choices.map((c) => `- ${c.text} — ${c.rating === 'ok' ? 'acceptable' : c.rating}: ${c.why}`).join('\n')}`;
  return '';
}).filter(Boolean).join('\n');

const SECTION_TOOL = {
  name: 'save_section', description: 'Save one lesson section with its quick check and quiz questions',
  input_schema: {
    type: 'object',
    properties: {
      body: { type: 'string', description: 'The lesson, 300-450 words. Format: paragraphs separated by blank lines, "### " for sub-headings, "- " for bullet points, **bold** for key terms. No other markdown.' },
      quick_check: QUESTION,
      questions: { type: 'array', items: QUESTION, description: '3 or 4 quiz questions on this section, at least one scenario' },
      ...BLOCK_FIELDS,
    },
    required: ['body', 'quick_check', 'questions', ...BLOCKS_REQUIRED],
  },
};

const cleanQ = (x) => {
  const options = (Array.isArray(x?.options) ? x.options : []).map((o) => String(o).trim()).filter(Boolean).slice(0, 6);
  const answer = Number(x?.answer);
  if (!String(x?.prompt || '').trim() || options.length < 2 || !(answer >= 0 && answer < options.length)) return null;
  return { kind: x.kind === 'scenario' ? 'scenario' : 'mcq', prompt: String(x.prompt).trim(), ...shuffle(options, answer), explain: String(x.explain || '').trim() };
};

// The AI tends to put the right answer in the same slot, so mix the options (unless one refers to the others, e.g. "All of the above")
export function shuffle(options, answer) {
  if (options.some((o) => /\b(above|below|both|neither)\b/i.test(o))) return { options, answer };
  const order = options.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return { options: order.map((i) => options[i]), answer: order.indexOf(answer) };
}

// A list sent as text, one item per line (numbering and bullets removed); arrays pass through
const lines = (x) => (Array.isArray(x) ? x.map(String) : String(x || '').split('\n'))
  .map((l) => l.replace(/^\s*(\d+[.)]|[-•*])\s*/, '').trim()).filter(Boolean).slice(0, 20);

const plusMonths = (date, n) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

async function getCourse(id, user) {
  const c = need(await one('SELECT * FROM courses WHERE id = $1', [id]), 'Course not found');
  if (!isManager(user) && c.status !== 'published') fail(404, 'Course not found');
  return c;
}

const sectionsOf = (courseId) => q('SELECT * FROM course_sections WHERE course_id = $1 ORDER BY position, title', [courseId]);

async function myCourses(officerId) {
  return q(`SELECT co.id, co.title, co.topic, co.summary, co.mandatory, co.pass_mark, co.renew_months,
      (SELECT count(*)::int FROM course_sections s WHERE s.course_id = co.id) AS sections,
      coalesce(array_length(p.done_sections, 1), 0) AS done_sections,
      a.due_date, a.id AS assignment_id,
      (SELECT row_to_json(x) FROM (SELECT c.id, c.ref, c.score, c.issued_at, c.expires_at FROM certificates c
         WHERE c.officer_id = $1 AND c.course_id = co.id ORDER BY c.issued_at DESC LIMIT 1) x) AS certificate,
      (SELECT row_to_json(x) FROM (SELECT t.score, t.passed, t.submitted_at FROM quiz_attempts t
         WHERE t.officer_id = $1 AND t.course_id = co.id AND t.submitted_at IS NOT NULL ORDER BY t.submitted_at DESC LIMIT 1) x) AS last_attempt
    FROM courses co
    LEFT JOIN course_assignments a ON a.course_id = co.id AND a.officer_id = $1
    LEFT JOIN course_progress p ON p.course_id = co.id AND p.officer_id = $1
    WHERE co.status = 'published'
    ORDER BY (a.id IS NULL), a.due_date NULLS LAST, co.topic, co.title`, [officerId]);
}

// passed: a certificate that is valid and still valid on the due date; renew: valid now but lapses by the due date
function courseState(c, today = londonDate(new Date())) {
  const cert = c.certificate;
  const valid = cert && (!cert.expires_at || cert.expires_at >= today);
  if (valid && (!c.due_date || !cert.expires_at || cert.expires_at > c.due_date)) return 'passed';
  if (c.due_date && c.due_date < today) return 'overdue';
  if (valid) return 'renew';
  if (cert) return 'expired';
  if (c.last_attempt && !c.last_attempt.passed) return 'failed';
  if (c.done_sections || c.last_attempt) return 'in_progress';
  return c.assignment_id ? 'assigned' : 'not_started';
}

// Text of a published course, for the tutor
async function courseText(c) {
  const secs = await sectionsOf(c.id);
  return `# ${c.title}\n${c.summary}\n\n${secs.map((s) => `## ${s.title}\n${s.body}\n${blocksText(s.blocks)}`).join('\n\n')}`;
}

async function saveCourse(b, user) {
  const meta = {};
  if (b.title !== undefined) { meta.title = String(b.title).trim(); if (!meta.title) fail(400, 'A course needs a title'); }
  if (b.topic !== undefined) { if (!TOPICS.includes(b.topic)) fail(400, 'Unknown topic'); meta.topic = b.topic; }
  if (b.summary !== undefined) meta.summary = String(b.summary || '').trim();
  for (const [k, lo, hi] of [['pass_mark', 50, 100], ['quiz_size', 3, 40], ['cooldown_hours', 0, 720]]) {
    if (b[k] !== undefined) { const n = Number(b[k]); if (!(n >= lo && n <= hi)) fail(400, `${k.replace('_', ' ')} must be between ${lo} and ${hi}`); meta[k] = Math.round(n); }
  }
  if (b.mandatory !== undefined) meta.mandatory = !!b.mandatory;
  if (b.renew_months !== undefined) { const n = b.renew_months ? Number(b.renew_months) : null; if (n !== null && !(n >= 1 && n <= 60)) fail(400, 'Renewal must be 1-60 months'); meta.renew_months = n; }
  if (b.sources !== undefined) meta.sources = JSON.stringify((b.sources || []).map(String).filter(Boolean).slice(0, 20));

  return tx(async (db) => {
    let course;
    if (b.id) {
      course = need(await db.one('SELECT * FROM courses WHERE id = $1 FOR UPDATE', [b.id]), 'Course not found');
    } else {
      course = await db.one("INSERT INTO courses (title, topic, created_by) VALUES ($1, $2, $3) RETURNING *", [meta.title || 'Untitled course', meta.topic || 'operations', user.id]);
    }
    const keys = Object.keys(meta);
    await db.q(`UPDATE courses SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}${keys.length ? ',' : ''} updated_at = now(),
      version = version + CASE WHEN status = 'published' THEN 1 ELSE 0 END WHERE id = $1`, [course.id, ...keys.map((k) => meta[k])]);

    const idMap = {};
    if (Array.isArray(b.sections)) {
      const keep = [];
      for (const [i, s] of b.sections.entries()) {
        const title = String(s.title || '').trim() || `Section ${i + 1}`;
        const check = s.quick_check ? cleanQ(s.quick_check) : null;
        const blocks = JSON.stringify(cleanBlocks(s.blocks));
        const row = s.id
          ? await db.one('UPDATE course_sections SET position = $3, title = $4, body = $5, quick_check = $6, blocks = $7 WHERE id = $1 AND course_id = $2 RETURNING id', [s.id, course.id, i, title, String(s.body || ''), check, blocks])
          : await db.one('INSERT INTO course_sections (course_id, position, title, body, quick_check, blocks) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id', [course.id, i, title, String(s.body || ''), check, blocks]);
        if (!row) fail(400, 'Section not found');
        if (s.tmp) idMap[s.tmp] = row.id;
        keep.push(row.id);
      }
      await db.q('DELETE FROM course_sections WHERE course_id = $1 AND NOT (id = ANY($2::uuid[]))', [course.id, keep]);
    }
    if (Array.isArray(b.questions)) {
      const keep = [];
      for (const raw of b.questions) {
        const x = cleanQ(raw);
        if (!x) fail(400, `Question "${String(raw.prompt || '').slice(0, 40) || 'untitled'}" needs a prompt, at least 2 options and a correct answer`);
        const sectionId = idMap[raw.section_id] || raw.section_id || null;
        const row = raw.id
          ? await db.one('UPDATE course_questions SET section_id = $3, kind = $4, prompt = $5, options = $6, answer = $7, explain = $8, active = $9 WHERE id = $1 AND course_id = $2 RETURNING id',
            [raw.id, course.id, sectionId, x.kind, x.prompt, JSON.stringify(x.options), x.answer, x.explain, raw.active !== false])
          : await db.one('INSERT INTO course_questions (course_id, section_id, kind, prompt, options, answer, explain, active) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',
            [course.id, sectionId, x.kind, x.prompt, JSON.stringify(x.options), x.answer, x.explain, raw.active !== false]);
        if (!row) fail(400, 'Question not found');
        keep.push(row.id);
      }
      await db.q('DELETE FROM course_questions WHERE course_id = $1 AND NOT (id = ANY($2::uuid[]))', [course.id, keep]);
    }
    return db.one('SELECT * FROM courses WHERE id = $1', [course.id]);
  });
}

async function issueCertificate(attempt, course, officerId) {
  const today = londonDate(new Date());
  const cert = await one(`INSERT INTO certificates (officer_id, course_id, attempt_id, score, expires_at) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [officerId, course.id, attempt.id, attempt.score, course.renew_months ? plusMonths(today, course.renew_months) : null]);
  await notify(await officerUser(officerId), {
    kind: 'training', title: `You passed ${course.title}`, body: `Score ${attempt.score}%. Your certificate ${cert.ref} is on your profile.`, link: `/officer/learn/certificates/${cert.id}`,
  });
  return cert;
}

export const actions = {
  // ---------- Officer ----------
  'academy.my': def(STAFF, async (_b, { user }) => {
    await requireModule('academy');
    if (!user.officer_id) return { courses: [], certificates: [] };
    const today = londonDate(new Date());
    const courses = (await myCourses(user.officer_id)).map((c) => ({ ...c, state: courseState(c, today) }));
    const certificates = await q(`SELECT c.*, co.title FROM certificates c JOIN courses co ON co.id = c.course_id WHERE c.officer_id = $1 ORDER BY c.issued_at DESC`, [user.officer_id]);
    return { courses, certificates };
  }),

  'academy.course': def(STAFF, async (b, { user }) => {
    await requireModule('academy');
    required(b, 'id');
    const course = await getCourse(b.id, user);
    const sections = await Promise.all((await sectionsOf(course.id)).map(async (s) => ({
      ...s, blocks: await viewBlocks(s.blocks, { mix: true }),
      quick_check: s.quick_check ? { prompt: s.quick_check.prompt, options: s.quick_check.options } : null,
    })));
    const progress = user.officer_id ? await one('SELECT done_sections FROM course_progress WHERE officer_id = $1 AND course_id = $2', [user.officer_id, course.id]) : null;
    const extra = user.officer_id ? (await myCourses(user.officer_id)).find((c) => c.id === course.id) : null;
    const questions = (await one('SELECT count(*)::int AS n FROM course_questions WHERE course_id = $1 AND active', [course.id])).n;
    const lastFail = user.officer_id ? await one(`SELECT submitted_at FROM quiz_attempts WHERE officer_id = $1 AND course_id = $2 AND submitted_at IS NOT NULL AND NOT passed ORDER BY submitted_at DESC LIMIT 1`, [user.officer_id, course.id]) : null;
    const retryAt = lastFail ? new Date(new Date(lastFail.submitted_at).getTime() + course.cooldown_hours * 3600000) : null;
    return {
      course, sections, questions, done_sections: progress?.done_sections || [],
      certificate: extra?.certificate || null, last_attempt: extra?.last_attempt || null, due_date: extra?.due_date || null,
      retry_at: retryAt && retryAt > new Date() ? retryAt : null,
    };
  }),

  // Quick check after a section: reveals the answer once the officer has picked
  'academy.check': def(STAFF, async (b) => {
    required(b, 'section_id');
    const s = need(await one('SELECT quick_check FROM course_sections WHERE id = $1', [b.section_id]), 'Section not found');
    if (!s.quick_check) fail(404, 'No check for this section');
    return { correct: Number(b.choice) === s.quick_check.answer, answer: s.quick_check.answer, explain: s.quick_check.explain };
  }),

  'academy.sectionDone': def(STAFF, async (b, { user }) => {
    required(b, 'course_id', 'section_id');
    if (!user.officer_id) return { ok: true };
    await q(`INSERT INTO course_progress (officer_id, course_id, done_sections) VALUES ($1, $2, ARRAY[$3::uuid])
      ON CONFLICT (officer_id, course_id) DO UPDATE SET updated_at = now(),
        done_sections = CASE WHEN $3::uuid = ANY(course_progress.done_sections) THEN course_progress.done_sections ELSE course_progress.done_sections || $3::uuid END`,
    [user.officer_id, b.course_id, b.section_id]);
    return { ok: true };
  }),

  'academy.quizStart': def(STAFF, async (b, { user }) => {
    await requireModule('academy');
    required(b, 'course_id');
    const officerId = requireOfficer(user);
    const course = await getCourse(b.course_id, { role: 'officer' });
    const lastFail = await one(`SELECT submitted_at FROM quiz_attempts WHERE officer_id = $1 AND course_id = $2 AND submitted_at IS NOT NULL AND NOT passed ORDER BY submitted_at DESC LIMIT 1`, [officerId, course.id]);
    const retryAt = lastFail ? new Date(new Date(lastFail.submitted_at).getTime() + course.cooldown_hours * 3600000) : null;
    if (retryAt && retryAt > new Date()) fail(409, `You can retake this quiz from ${retryAt.toLocaleString('en-GB', { timeZone: 'Europe/London', weekday: 'short', hour: '2-digit', minute: '2-digit' })}`, { retry_at: retryAt });
    let attempt = await one(`SELECT * FROM quiz_attempts WHERE officer_id = $1 AND course_id = $2 AND submitted_at IS NULL AND started_at > now() - interval '3 hours' ORDER BY started_at DESC LIMIT 1`, [officerId, course.id]);
    if (!attempt) {
      const picked = await q('SELECT id FROM course_questions WHERE course_id = $1 AND active ORDER BY random() LIMIT $2', [course.id, course.quiz_size]);
      if (!picked.length) fail(409, 'This course has no quiz questions yet');
      attempt = await one('INSERT INTO quiz_attempts (officer_id, course_id, course_version, question_ids) VALUES ($1,$2,$3,$4) RETURNING *', [officerId, course.id, course.version, picked.map((p) => p.id)]);
    }
    const qs = await q('SELECT id, kind, prompt, options FROM course_questions WHERE id = ANY($1::uuid[])', [attempt.question_ids]);
    const order = attempt.question_ids.map((id) => qs.find((x) => x.id === id)).filter(Boolean);
    return { attempt: { id: attempt.id, answers: attempt.answers }, course: { id: course.id, title: course.title, pass_mark: course.pass_mark }, questions: order };
  }),

  'academy.quizAnswer': def(STAFF, async (b, { user }) => {
    required(b, 'attempt_id', 'question_id');
    const officerId = requireOfficer(user);
    const a = need(await one('SELECT * FROM quiz_attempts WHERE id = $1 AND officer_id = $2', [b.attempt_id, officerId]), 'Quiz not found');
    if (a.submitted_at) fail(409, 'This quiz is already finished');
    if (!a.question_ids.includes(b.question_id)) fail(400, 'That question is not in this quiz');
    if (b.question_id in a.answers) fail(409, 'You have already answered this question');
    const x = await one(`SELECT qu.answer, qu.explain, qu.section_id, s.title AS section_title FROM course_questions qu LEFT JOIN course_sections s ON s.id = qu.section_id WHERE qu.id = $1`, [b.question_id]);
    await q('UPDATE quiz_attempts SET answers = answers || $2::jsonb WHERE id = $1', [a.id, JSON.stringify({ [b.question_id]: Number(b.choice) })]);
    return { correct: Number(b.choice) === x.answer, answer: x.answer, explain: x.explain, section_id: x.section_id, section_title: x.section_title };
  }),

  'academy.quizSubmit': def(STAFF, async (b, { user }) => {
    required(b, 'attempt_id');
    const officerId = requireOfficer(user);
    const a = need(await one('SELECT * FROM quiz_attempts WHERE id = $1 AND officer_id = $2', [b.attempt_id, officerId]), 'Quiz not found');
    if (a.submitted_at) fail(409, 'This quiz is already finished');
    const course = await one('SELECT * FROM courses WHERE id = $1', [a.course_id]);
    const qs = await q('SELECT id, answer FROM course_questions WHERE id = ANY($1::uuid[])', [a.question_ids]);
    const right = qs.filter((x) => a.answers[x.id] === x.answer).length;
    const score = Math.round((right / Math.max(1, a.question_ids.length)) * 100);
    const passed = score >= course.pass_mark;
    const done = await one('UPDATE quiz_attempts SET score = $2, passed = $3, submitted_at = now() WHERE id = $1 AND submitted_at IS NULL RETURNING *', [a.id, score, passed]);
    if (!done) fail(409, 'This quiz is already finished');
    const certificate = passed ? await issueCertificate(done, course, officerId) : null;
    return {
      score, passed, right, total: a.question_ids.length, pass_mark: course.pass_mark, certificate,
      retry_at: passed ? null : new Date(Date.now() + course.cooldown_hours * 3600000),
    };
  }),

  'academy.certificate': def(STAFF, async (b, { user }) => {
    required(b, 'id');
    const c = need(await one(`SELECT c.*, co.title, co.summary, o.first_name, o.last_name, s.company_name, s.logo_url, s.brand_color
        FROM certificates c JOIN courses co ON co.id = c.course_id JOIN officers o ON o.id = c.officer_id CROSS JOIN settings s
       WHERE c.id = $1 AND s.id = 1`, [b.id]), 'Certificate not found');
    if (!isManager(user) && c.officer_id !== user.officer_id) fail(404, 'Certificate not found');
    return c;
  }),

  // Tutor chat: answers from the course's published text only
  'academy.tutor': def(STAFF, async (b, { user }) => {
    await requireModule('academy');
    required(b, 'course_id');
    const course = await getCourse(b.course_id, user);
    const messages = (b.messages || []).slice(-12).map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 2000) })).filter((m) => m.content);
    if (!messages.length || messages[messages.length - 1].role !== 'user') fail(400, 'Ask a question');
    const r = await claude({
      model: SONNET, module: 'academy', max_tokens: 700, messages,
      system: `You are the tutor for one course in a UK security company's training app. Answer the officer's questions using ONLY the course text below.
- If the answer is not in the course, say so plainly ("That isn't covered in this course") and suggest they check the Toolbox or ask their manager. Do not answer from general knowledge.
- In an emergency, tell them to call 999 first.
- Be short and practical (under 150 words), British English, use "they" for people, no markdown headings.

COURSE TEXT:
${await courseText(course)}`,
    });
    return { reply: (r.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim() };
  }),

  // ---------- Managers ----------
  'academy.courses': def(MGR, async (b) => {
    await requireModule('academy');
    return q(`SELECT c.*, (SELECT count(*)::int FROM course_sections s WHERE s.course_id = c.id) AS sections,
        (SELECT count(*)::int FROM course_sections s WHERE s.course_id = c.id AND s.body = '') AS empty_sections,
        (SELECT count(*)::int FROM course_questions x WHERE x.course_id = c.id AND x.active) AS questions,
        (SELECT count(*)::int FROM course_assignments a WHERE a.course_id = c.id) AS assigned,
        (SELECT count(DISTINCT officer_id)::int FROM certificates x WHERE x.course_id = c.id) AS passed
      FROM courses c WHERE c.status <> 'archived' OR $1::boolean ORDER BY c.status = 'published' DESC, c.topic, c.title`, [!!b.archived]);
  }),

  'academy.edit': def(MGR, async (b) => {
    required(b, 'id');
    const course = need(await one('SELECT * FROM courses WHERE id = $1', [b.id]), 'Course not found');
    const [sections, questions] = await Promise.all([sectionsOf(course.id), q('SELECT * FROM course_questions WHERE course_id = $1 ORDER BY section_id, id', [course.id])]);
    for (const s of sections) s.blocks = await viewBlocks(s.blocks);
    return { course, sections, questions };
  }),

  'academy.save': def(CO, async (b, { user }) => {
    await requireModule('academy');
    const course = await saveCourse(b, user);
    await audit(user, b.id ? 'academy.update' : 'academy.create', 'course', course.id, { title: course.title });
    return course;
  }),

  'academy.setStatus': def(CO, async (b, { user }) => {
    required(b, 'id', 'status');
    if (!['draft', 'published', 'archived'].includes(b.status)) fail(400, 'Unknown status');
    if (b.status === 'published') {
      const secs = await sectionsOf(b.id);
      if (!secs.length || secs.some((s) => !s.body.trim())) fail(400, 'Every section needs its lesson text before publishing');
      const n = (await one('SELECT count(*)::int AS n FROM course_questions WHERE course_id = $1 AND active', [b.id])).n;
      if (n < 5) fail(400, 'Add at least 5 quiz questions before publishing');
    }
    const c = need(await one(`UPDATE courses SET status = $2, updated_at = now(),
        version = version + CASE WHEN $2 = 'published' THEN 1 ELSE 0 END,
        published_by = CASE WHEN $2 = 'published' THEN $3::uuid ELSE published_by END,
        published_at = CASE WHEN $2 = 'published' THEN now() ELSE published_at END,
        review_by = CASE WHEN $2 = 'published' THEN $4::date ELSE review_by END
      WHERE id = $1 RETURNING *`, [b.id, b.status, user.id, reviewDate()]), 'Course not found');
    await audit(user, `academy.${b.status}`, 'course', c.id, { title: c.title });
    return c;
  }),

  'academy.starterTopics': def(CO, async () => {
    const have = (await q("SELECT lower(title) AS t FROM courses WHERE status <> 'archived'")).map((r) => r.t);
    return STARTER_TOPICS.map((t) => ({ ...t, exists: have.includes(t.title.toLowerCase()) }));
  }),

  // Step 1 of an AI draft: the outline becomes a draft course with empty sections
  'academy.draftOutline': def(CO, async (b, { user }) => {
    await requireModule('academy');
    required(b, 'title');
    const topic = TOPICS.includes(b.topic) ? b.topic : 'operations';
    const { input } = await extract({
      model: SONNET, module: 'academy', max_tokens: 1500, tool: OUTLINE_TOOL,
      system: `${CONTENT_RULES}\nYou are planning a short online course (15-25 minutes) for officers to take on their phone.`,
      messages: [{ role: 'user', content: `Course: ${String(b.title).slice(0, 200)}\nArea: ${topic.replace('_', ' ')}${b.notes ? `\nMust cover: ${String(b.notes).slice(0, 2000)}` : ''}` }],
    });
    const outline = lines(input?.sections).map((l) => { const [title, ...aims] = l.split('::'); return { title: title.trim(), aims: aims.join('::').trim() }; }).filter((x) => x.title);
    if (!input?.title || outline.length < 2) fail(502, 'The AI could not outline this course — try again');
    const course = await saveCourse({
      title: input.title || b.title, topic, summary: input.summary, sources: lines(input.sources),
      mandatory: topic === 'law' || topic === 'first_aid', renew_months: topic === 'first_aid' ? 12 : null,
      sections: outline.slice(0, 8).map((s) => ({ title: s.title, body: '' })),
    }, user);
    const sections = await sectionsOf(course.id);
    await audit(user, 'academy.draft', 'course', course.id, { title: course.title, via: 'ai' });
    return { course, sections: sections.map((s, i) => ({ ...s, aims: outline[i]?.aims || '' })) };
  }),

  // Step 2, one call per section: lesson text, quick check and 3-4 quiz questions
  'academy.draftSection': def(CO, async (b, { user }) => {
    await requireModule('academy');
    required(b, 'section_id');
    const s = need(await one('SELECT * FROM course_sections WHERE id = $1', [b.section_id]), 'Section not found');
    const course = await one('SELECT * FROM courses WHERE id = $1', [s.course_id]);
    const all = await sectionsOf(course.id);
    const { input } = await extract({
      model: SONNET, module: 'academy', max_tokens: 3600, tool: SECTION_TOOL,
      system: `${CONTENT_RULES}\nYou are writing one section of a short course. Keep to this section's scope; other sections cover the rest.`,
      messages: [{ role: 'user', content: `Course: ${course.title}\n${course.summary}\nSections: ${all.map((x, i) => `${i + 1}. ${x.title}`).join('; ')}\n\nWrite section: ${s.title}${b.aims ? `\nIt must cover: ${String(b.aims).slice(0, 600)}` : ''}${b.notes ? `\nManager's notes: ${String(b.notes).slice(0, 1500)}` : ''}` }],
    });
    if (!input?.body) fail(502, 'The AI could not write this section — try again');
    const check = cleanQ(input.quick_check);
    const qs = (input.questions || []).map(cleanQ).filter(Boolean).slice(0, 5);
    await tx(async (db) => {
      await db.q('UPDATE course_sections SET body = $2, quick_check = $3, blocks = $4 WHERE id = $1', [s.id, String(input.body).trim(), check, JSON.stringify(toBlocks(input, s.blocks))]);
      await db.q('DELETE FROM course_questions WHERE section_id = $1', [s.id]);
      for (const x of qs) {
        await db.q('INSERT INTO course_questions (course_id, section_id, kind, prompt, options, answer, explain) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [course.id, s.id, x.kind, x.prompt, JSON.stringify(x.options), x.answer, x.explain]);
      }
      await db.q("UPDATE courses SET updated_at = now(), version = version + CASE WHEN status = 'published' THEN 1 ELSE 0 END WHERE id = $1", [course.id]);
    });
    await audit(user, 'academy.draftSection', 'course', course.id, { section: s.title, via: 'ai' });
    return { section: await one('SELECT * FROM course_sections WHERE id = $1', [s.id]), questions: qs.length };
  }),

  // Visuals and activities for a section that already has its lesson; the lesson, check and quiz stay as they are
  'academy.enrichSection': def(CO, async (b, { user }) => {
    await requireModule('academy');
    required(b, 'section_id');
    const s = need(await one('SELECT * FROM course_sections WHERE id = $1', [b.section_id]), 'Section not found');
    if (!s.body.trim()) fail(400, 'Write the lesson first');
    const course = await one('SELECT * FROM courses WHERE id = $1', [s.course_id]);
    const { input, credits } = await extract({
      model: SONNET, module: 'academy', max_tokens: 1500, tool: BLOCKS_TOOL,
      system: `${CONTENT_RULES}\nYou are adding visuals and a short activity to one lesson section. Use only what the lesson says; do not add new facts, numbers or law.`,
      messages: [{ role: 'user', content: `Course: ${course.title}\nSection: ${s.title}\n\nLesson:\n${s.body}` }],
    });
    const blocks = input ? toBlocks(input, s.blocks) : [];
    if (blocks.length < 3) fail(502, 'The AI could not add visuals to this section — try again');
    await q('UPDATE course_sections SET blocks = $2 WHERE id = $1', [s.id, JSON.stringify(blocks)]);
    await q("UPDATE courses SET updated_at = now(), version = version + CASE WHEN status = 'published' THEN 1 ELSE 0 END WHERE id = $1", [course.id]);
    await audit(user, 'academy.enrichSection', 'course', course.id, { section: s.title, via: 'ai' });
    return { blocks: await viewBlocks(blocks), credits };
  }),

  // One AI picture for a section (one call each, so it stays inside the time limit)
  'academy.drawImage': def(CO, async (b, { user }) => {
    await requireModule('academy');
    required(b, 'section_id');
    const s = need(await one('SELECT * FROM course_sections WHERE id = $1', [b.section_id]), 'Section not found');
    const course = await one('SELECT title FROM courses WHERE id = $1', [s.course_id]);
    const prev = (s.blocks || []).find((x) => x.type === 'image');
    const idea = str(b.prompt, 600) || prev?.prompt || `A security officer at a UK venue, illustrating "${s.title}"`;
    const { bytes, mime, credits } = await drawImage({ module: 'academy', prompt: `Illustration for a security officer training course "${course.title}", lesson "${s.title}". Scene: ${idea}` });
    const key = await putObject(`docs/learn/ai/${s.course_id.slice(0, 8)}/${crypto.randomUUID()}.${mime.includes('jpeg') ? 'jpg' : 'png'}`, bytes, mime);
    const blocks = cleanBlocks([{ type: 'image', key, prompt: idea, caption: prev?.caption || '', source: 'ai' }, ...(s.blocks || []).filter((x) => x.type !== 'image')]);
    await q('UPDATE course_sections SET blocks = $2 WHERE id = $1', [s.id, JSON.stringify(blocks)]);
    await q('UPDATE courses SET updated_at = now() WHERE id = $1', [s.course_id]);
    await audit(user, 'academy.drawImage', 'course', s.course_id, { section: s.title, via: 'ai' });
    return { blocks: await viewBlocks(blocks), credits };
  }),

  'academy.assign': def(MGR, async (b, { user }) => {
    await requireModule('academy');
    required(b, 'course_id', 'target');
    const course = need(await one("SELECT * FROM courses WHERE id = $1 AND status = 'published'", [b.course_id]), 'Publish the course before assigning it');
    let ids;
    if (b.target === 'all') ids = (await q("SELECT id FROM officers WHERE status = 'active'")).map((r) => r.id);
    else if (b.target === 'role') ids = (await q("SELECT id FROM officers WHERE status = 'active' AND roles && $1::text[]", [b.ids || []])).map((r) => r.id);
    else if (b.target === 'venue') ids = [...new Set((await Promise.all((b.ids || []).map(venueTeam))).flat())];
    else if (b.target === 'officers') ids = (await q("SELECT id FROM officers WHERE id = ANY($1::uuid[]) AND status IN ('active','onboarding')", [b.ids || []])).map((r) => r.id);
    else fail(400, 'Choose who to assign it to');
    if (!ids.length) fail(400, 'Nobody matches that choice');
    const due = b.due_date || null;
    const rows = await q(`INSERT INTO course_assignments (course_id, officer_id, due_date, assigned_by) SELECT $1, unnest($2::uuid[]), $3, $4
      ON CONFLICT (course_id, officer_id) DO UPDATE SET due_date = EXCLUDED.due_date, assigned_by = EXCLUDED.assigned_by, assigned_at = now() RETURNING officer_id`,
    [course.id, ids, due, user.id]);
    const users = (await q('SELECT user_id FROM officers WHERE id = ANY($1::uuid[]) AND user_id IS NOT NULL', [rows.map((r) => r.officer_id)])).map((r) => r.user_id);
    await notify(users, {
      kind: 'training', title: `New training: ${course.title}`, body: due ? `Please complete it by ${fmtDate(due)}.` : 'Complete it when you can.',
      link: `/officer/learn/academy/${course.id}`, dedupe: `assign:${course.id}:${due || 'none'}`,
    });
    await audit(user, 'academy.assign', 'course', course.id, { target: b.target, officers: rows.length, due_date: due });
    return { assigned: rows.length };
  }),

  'academy.unassign': def(MGR, async (b, { user }) => {
    required(b, 'course_id', 'officer_id');
    await q('DELETE FROM course_assignments WHERE course_id = $1 AND officer_id = $2', [b.course_id, b.officer_id]);
    await audit(user, 'academy.unassign', 'course', b.course_id, { officer_id: b.officer_id });
    return { ok: true };
  }),

  // Officer × course matrix plus the questions most often answered wrong
  'academy.results': def(MGR, async () => {
    await requireModule('academy');
    const today = londonDate(new Date());
    const [courses, officers, assignments, certs, attempts, progress] = await Promise.all([
      q("SELECT id, title, topic, mandatory, pass_mark FROM courses WHERE status = 'published' ORDER BY topic, title"),
      q("SELECT id, first_name, last_name, photo_key FROM officers WHERE status IN ('active','onboarding') ORDER BY first_name, last_name"),
      q('SELECT course_id, officer_id, due_date FROM course_assignments'),
      q('SELECT DISTINCT ON (course_id, officer_id) course_id, officer_id, id, score, issued_at, expires_at FROM certificates ORDER BY course_id, officer_id, issued_at DESC'),
      q(`SELECT course_id, officer_id, max(score) AS best, count(*)::int AS tries, bool_or(passed) AS passed FROM quiz_attempts WHERE submitted_at IS NOT NULL GROUP BY 1, 2`),
      q('SELECT course_id, officer_id FROM course_progress'),
    ]);
    const key = (r) => `${r.course_id}:${r.officer_id}`;
    const A = new Map(assignments.map((r) => [key(r), r]));
    const C = new Map(certs.map((r) => [key(r), r]));
    const T = new Map(attempts.map((r) => [key(r), r]));
    const P = new Set(progress.map(key));
    const rows = (await Promise.all(officers.map(async ({ photo_key, ...o }) => ({ ...o, photo_url: await downloadUrl(photo_key) })))).map((o) => ({
      officer: o,
      cells: Object.fromEntries(courses.map((c) => {
        const k = `${c.id}:${o.id}`;
        const a = A.get(k); const cert = C.get(k); const t = T.get(k);
        const valid = cert && (!cert.expires_at || cert.expires_at >= today);
        let state = 'none';
        if (valid && (!a?.due_date || !cert.expires_at || cert.expires_at > a.due_date)) state = 'passed';
        else if (a?.due_date && a.due_date < today) state = 'overdue';
        else if (valid) state = 'renew';
        else if (cert) state = 'expired';
        else if (t) state = 'failed';
        else if (P.has(k)) state = 'in_progress';
        else if (a) state = 'assigned';
        return [c.id, { state, score: cert?.score ?? t?.best ?? null, tries: t?.tries || 0, due_date: a?.due_date || null, assigned: !!a, certificate_id: cert?.id || null, expires_at: cert?.expires_at || null }];
      })),
    }));
    const missed = await q(`WITH ans AS (
        SELECT t.course_id, (e.key)::uuid AS question_id, (e.value)::int AS choice FROM quiz_attempts t, jsonb_each_text(t.answers) e WHERE t.submitted_at IS NOT NULL)
      SELECT qu.id, qu.prompt, co.title AS course_title, count(*)::int AS answered, count(*) FILTER (WHERE ans.choice <> qu.answer)::int AS wrong
        FROM ans JOIN course_questions qu ON qu.id = ans.question_id JOIN courses co ON co.id = ans.course_id
       GROUP BY qu.id, co.title HAVING count(*) FILTER (WHERE ans.choice <> qu.answer) > 0
       ORDER BY count(*) FILTER (WHERE ans.choice <> qu.answer)::float / count(*) DESC, count(*) DESC LIMIT 10`);
    return { courses, rows, missed };
  }),

  // Training tab on a staff profile
  'academy.officer': def(MGR, async (b) => {
    required(b, 'officer_id');
    const today = londonDate(new Date());
    const courses = (await myCourses(b.officer_id)).filter((c) => c.assignment_id || c.certificate || c.last_attempt || c.done_sections)
      .map((c) => ({ ...c, state: courseState(c, today) }));
    const certificates = await q('SELECT c.*, co.title FROM certificates c JOIN courses co ON co.id = c.course_id WHERE c.officer_id = $1 ORDER BY c.issued_at DESC', [b.officer_id]);
    return { courses, certificates };
  }),
};

// ---------- Scheduled (from jobs.mjs) ----------
export async function learnJobs() {
  if (!(await moduleOn('academy'))) return { skipped: true };
  const today = londonDate(new Date());
  // Due soon and overdue reminders
  const due = await q(`SELECT a.course_id, a.officer_id, a.due_date, co.title, o.user_id FROM course_assignments a
      JOIN courses co ON co.id = a.course_id AND co.status = 'published' JOIN officers o ON o.id = a.officer_id AND o.status = 'active' AND o.user_id IS NOT NULL
     WHERE a.due_date IN ($1::date, $2::date)
       AND NOT EXISTS (SELECT 1 FROM certificates c WHERE c.officer_id = a.officer_id AND c.course_id = a.course_id AND (c.expires_at IS NULL OR c.expires_at > a.due_date))`,
  [addDays(today, 3), addDays(today, -1)]);
  for (const r of due) {
    const overdue = r.due_date < today;
    await notify([r.user_id], {
      kind: 'training', severity: overdue ? 'warning' : 'info',
      title: overdue ? `Training overdue: ${r.title}` : `Training due ${fmtDate(r.due_date)}: ${r.title}`,
      body: overdue ? 'This was due yesterday. Please complete it as soon as you can.' : 'You have 3 days left to complete it.',
      link: `/officer/learn/academy/${r.course_id}`, dedupe: `due:${r.course_id}:${r.due_date}:${overdue ? 'late' : 'soon'}`,
    });
  }
  // Mandatory renewals: a certificate expiring within 30 days gets a fresh assignment due on the expiry date
  const renew = await q(`SELECT DISTINCT ON (c.officer_id, c.course_id) c.officer_id, c.course_id, c.expires_at FROM certificates c
      JOIN courses co ON co.id = c.course_id AND co.mandatory AND co.status = 'published' JOIN officers o ON o.id = c.officer_id AND o.status = 'active'
     WHERE c.expires_at IS NOT NULL ORDER BY c.officer_id, c.course_id, c.issued_at DESC`);
  let renewed = 0;
  for (const r of renew.filter((x) => x.expires_at <= addDays(today, 30))) {
    const row = await one(`INSERT INTO course_assignments (course_id, officer_id, due_date) VALUES ($1,$2,$3)
      ON CONFLICT (course_id, officer_id) DO UPDATE SET due_date = EXCLUDED.due_date, assigned_at = now()
        WHERE course_assignments.due_date IS DISTINCT FROM EXCLUDED.due_date RETURNING officer_id`, [r.course_id, r.officer_id, r.expires_at]);
    if (row) renewed++;
  }
  // Content past its review date
  const stale = await q(`SELECT 'course' AS kind, title FROM courses WHERE status = 'published' AND review_by < $1
    UNION ALL SELECT 'card', title FROM toolbox_cards WHERE status = 'published' AND review_by < $1`, [today]);
  if (stale.length) {
    await notify(await companyManagers(), {
      kind: 'training', severity: 'info', title: `${stale.length} training item${stale.length === 1 ? '' : 's'} due for review`,
      body: `${stale.slice(0, 4).map((s) => s.title).join(', ')}${stale.length > 4 ? '…' : ''}. Check they are still accurate, then publish again to reset the review date.`,
      link: '/company/team/academy', dedupe: `review:${today.slice(0, 7)}`,
    });
  }
  return { reminders: due.length, renewed, review: stale.length };
}

// For the compliance run: mandatory training that is overdue or lapsed
export async function trainingStatus(officerId = null) {
  return q(`SELECT a.officer_id, a.course_id, a.due_date, co.title,
      (SELECT row_to_json(x) FROM (SELECT c.id, c.expires_at FROM certificates c WHERE c.officer_id = a.officer_id AND c.course_id = a.course_id ORDER BY c.issued_at DESC LIMIT 1) x) AS cert
    FROM course_assignments a JOIN courses co ON co.id = a.course_id AND co.mandatory AND co.status = 'published'
    WHERE ($1::uuid IS NULL OR a.officer_id = $1)`, [officerId]);
}
