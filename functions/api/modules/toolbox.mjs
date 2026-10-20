// Officer Toolbox: guidance cards (first aid, common situations, law at a glance, venue procedures).
// AI drafts, a company manager approves; officers only ever see published cards.
import { one, q } from '../lib/db.mjs';
import { fail, need, required } from '../lib/http.mjs';
import { audit } from '../lib/audit.mjs';
import { isManager } from '../lib/auth.mjs';
import { extract, SONNET, HAIKU } from '../lib/ai.mjs';
import { requireModule } from '../lib/modules.mjs';
import { CONTENT_RULES, officerVenues, reviewDate } from '../lib/learn.mjs';
import { CO, def } from './_def.mjs';

const STAFF = ['company', 'security', 'officer'];
const CATEGORIES = ['first_aid', 'situations', 'law', 'venue'];
const strList = (x) => (Array.isArray(x) ? x.map((s) => String(s).trim()).filter(Boolean).slice(0, 30) : []);

const CARD_TOOL = {
  name: 'save_card',
  description: 'Save one guidance card for security officers',
  input_schema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short, e.g. "Someone has collapsed and is not breathing"' },
      summary: { type: 'string', description: 'One line: the key thing to do' },
      steps: { type: 'array', items: { type: 'string' }, description: '4-10 numbered steps, in order, each one action' },
      dont: { type: 'array', items: { type: 'string' }, description: '2-6 things not to do' },
      law: { type: 'string', description: 'The law or guidance that applies, plainly, 1-4 sentences. Empty if none.' },
      report_tips: { type: 'string', description: 'What to write in the incident report' },
      escalate: { type: 'string', description: 'When to call 999 / the police / a supervisor or manager' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Search words, e.g. CPR, unconscious, AED' },
      sources: { type: 'array', items: { type: 'string' }, description: 'Named sources relied on' },
    },
    required: ['title', 'summary', 'steps', 'dont', 'law', 'report_tips', 'escalate', 'tags', 'sources'],
  },
};

async function visibleCards(user, { drafts = false } = {}) {
  const venues = user.role === 'officer' ? await officerVenues(user.officer_id) : null;
  return q(`SELECT c.*, v.name AS venue_name, co.title AS course_title, (f.card_id IS NOT NULL) AS favourite
      FROM toolbox_cards c LEFT JOIN venues v ON v.id = c.venue_id LEFT JOIN courses co ON co.id = c.course_id AND co.status = 'published'
      LEFT JOIN toolbox_favourites f ON f.card_id = c.id AND f.user_id = $1
     WHERE ($2::boolean OR c.status = 'published') AND c.status <> 'archived'
       AND ($3::uuid[] IS NULL OR c.venue_id IS NULL OR c.venue_id = ANY($3))
     ORDER BY c.category, c.title`, [user.id, drafts, venues]);
}

function cardFields(b) {
  const f = {};
  if (b.category !== undefined) { if (!CATEGORIES.includes(b.category)) fail(400, 'Unknown category'); f.category = b.category; }
  for (const k of ['title', 'summary', 'law', 'report_tips', 'escalate']) if (b[k] !== undefined) f[k] = String(b[k] || '').trim();
  for (const k of ['steps', 'dont', 'sources']) if (b[k] !== undefined) f[k] = JSON.stringify(strList(b[k]));
  if (b.tags !== undefined) f.tags = strList(b.tags);
  if (b.venue_id !== undefined) f.venue_id = b.venue_id || null;
  if (b.course_id !== undefined) f.course_id = b.course_id || null;
  if (f.title === '') fail(400, 'A card needs a title');
  if (f.category === 'venue' && !(f.venue_id ?? b.venue_id)) fail(400, 'Choose the venue for a venue procedure');
  return f;
}

export const actions = {
  'toolbox.list': def(STAFF, async (b, { user }) => {
    await requireModule('toolbox');
    const cards = await visibleCards(user, { drafts: isManager(user) && !!b.drafts });
    return { cards, version: cards.reduce((m, c) => Math.max(m, new Date(c.updated_at).getTime()), 0) };
  }),

  'toolbox.get': def(STAFF, async (b, { user }) => {
    await requireModule('toolbox');
    required(b, 'id');
    const card = (await visibleCards(user, { drafts: isManager(user) })).find((c) => c.id === b.id);
    return need(card, 'Card not found');
  }),

  'toolbox.favourite': def(STAFF, async (b, { user }) => {
    required(b, 'id');
    if (b.on) await q('INSERT INTO toolbox_favourites (user_id, card_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [user.id, b.id]);
    else await q('DELETE FROM toolbox_favourites WHERE user_id = $1 AND card_id = $2', [user.id, b.id]);
    return { ok: true };
  }),

  // Create or edit. Edits to a published card go live straight away (only company managers can edit) and bump its version.
  'toolbox.save': def(CO, async (b, { user }) => {
    await requireModule('toolbox');
    const f = cardFields(b);
    let card;
    if (b.id) {
      const keys = Object.keys(f);
      card = need(await one(`UPDATE toolbox_cards SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')}${keys.length ? ',' : ''}
          version = version + CASE WHEN status = 'published' THEN 1 ELSE 0 END, updated_by = $${keys.length + 2}, updated_at = now()
        WHERE id = $1 RETURNING *`, [b.id, ...keys.map((k) => f[k]), user.id]), 'Card not found');
    } else {
      if (!f.title) fail(400, 'A card needs a title');
      const keys = Object.keys(f);
      card = await one(`INSERT INTO toolbox_cards (${keys.join(', ')}, updated_by) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}, $${keys.length + 1}) RETURNING *`,
        [...keys.map((k) => f[k]), user.id]);
    }
    await audit(user, b.id ? 'toolbox.update' : 'toolbox.create', 'toolbox_card', card.id, { title: card.title });
    return card;
  }),

  'toolbox.setStatus': def(CO, async (b, { user }) => {
    required(b, 'id', 'status');
    if (!['draft', 'published', 'archived'].includes(b.status)) fail(400, 'Unknown status');
    const card = need(await one(`UPDATE toolbox_cards SET status = $2, updated_at = now(), updated_by = $3,
        version = version + CASE WHEN $2 = 'published' THEN 1 ELSE 0 END,
        review_by = CASE WHEN $2 = 'published' THEN $4::date ELSE review_by END
      WHERE id = $1 RETURNING *`, [b.id, b.status, user.id, reviewDate()]), 'Card not found');
    await audit(user, `toolbox.${b.status}`, 'toolbox_card', card.id, { title: card.title });
    return card;
  }),

  // AI drafts a card; it is saved as a draft for a manager to check and publish
  'toolbox.draft': def(CO, async (b, { user }) => {
    await requireModule('toolbox');
    required(b, 'topic');
    const category = CATEGORIES.includes(b.category) ? b.category : 'situations';
    const venue = b.venue_id ? await one('SELECT name, address FROM venues WHERE id = $1', [b.venue_id]) : null;
    const { input } = await extract({
      model: SONNET, module: 'toolbox', max_tokens: 2500, tool: CARD_TOOL,
      system: `${CONTENT_RULES}\nYou are writing one Toolbox card: a quick-reference guide an officer reads on their phone in the moment. Steps must be concrete actions in the right order.`,
      messages: [{ role: 'user', content: `Category: ${category.replace('_', ' ')}\nTopic: ${String(b.topic).slice(0, 300)}${venue ? `\nVenue-specific procedure for ${venue.name}` : ''}${b.notes ? `\nManager's notes: ${String(b.notes).slice(0, 2000)}` : ''}` }],
    });
    if (!input?.title || !strList(input.steps).length) fail(502, 'The AI could not draft this card — try again');
    const f = cardFields({ ...input, category, venue_id: b.venue_id || null });
    const keys = Object.keys(f);
    const card = await one(`INSERT INTO toolbox_cards (${keys.join(', ')}, updated_by) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}, $${keys.length + 1}) RETURNING *`,
      [...keys.map((k) => f[k]), user.id]);
    await audit(user, 'toolbox.draft', 'toolbox_card', card.id, { title: card.title, via: 'ai' });
    return card;
  }),

  // "What should I do?": points to published cards only, never improvises steps
  'toolbox.suggest': def(STAFF, async (b, { user }) => {
    await requireModule('toolbox');
    required(b, 'text');
    const cards = await visibleCards(user);
    if (!cards.length) return { matches: [], note: 'No cards are published yet. In an emergency call 999, otherwise call your supervisor.' };
    const { input } = await extract({
      model: HAIKU, module: 'toolbox', max_tokens: 600,
      tool: {
        name: 'pick_cards', description: 'Pick the guidance cards that fit the situation',
        input_schema: {
          type: 'object',
          properties: {
            matches: { type: 'array', items: { type: 'object', properties: { n: { type: 'integer', description: 'Card number from the list' }, why: { type: 'string', description: 'One short line on why it fits' } }, required: ['n', 'why'] }, description: 'Up to 3, best first' },
            emergency: { type: 'boolean', description: 'True if life may be at risk (not breathing, serious bleeding, weapon, fire)' },
          },
          required: ['matches', 'emergency'],
        },
      },
      system: 'You match a security officer\'s situation to guidance cards. Only choose from the numbered list. Never write steps or advice yourself. If nothing fits, return no matches.',
      messages: [{ role: 'user', content: `Situation: ${String(b.text).slice(0, 1000)}\n\nCards:\n${cards.map((c, i) => `${i + 1}. ${c.title} — ${c.summary} [${c.tags.join(', ')}]`).join('\n')}` }],
    });
    const matches = (input?.matches || []).map((m) => cards[m.n - 1] && { card: cards[m.n - 1], why: m.why }).filter(Boolean).slice(0, 3);
    return {
      matches,
      emergency: !!input?.emergency,
      note: matches.length ? '' : 'No card matches that. In an emergency call 999, otherwise call your supervisor.',
    };
  }),
};
