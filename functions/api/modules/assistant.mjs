// Ask Orb: the managers' assistant. It looks things up with tools and prepares actions;
// nothing changes until the person taps Confirm, which runs the real action with their own permissions.
import { one, q } from '../lib/db.mjs';
import { fail, required, need, HttpError } from '../lib/http.mjs';
import { canSeePay } from '../lib/auth.mjs';
import { venueScope } from '../lib/scope.mjs';
import { fmtDate, fmtDateTime, fmtTime, londonDate, londonParts } from '../lib/time.mjs';
import { gbp } from '../lib/rates.mjs';
import { audit } from '../lib/audit.mjs';
import { claude, SONNET } from '../lib/ai.mjs';
import { getSettings } from './settings.mjs';
import { CHAT_TOOLS, runTool, jobOn, logActivity } from './ops.mjs';
import { MGR, def } from './_def.mjs';

let ACTIONS = {};
/** index.mjs hands over the action table so Confirm goes through the same code as the app. */
export const useActions = (table) => { ACTIONS = table; };

const MONEY = /^(pay|payRuns|invoices)\./;
const range = (a, b) => `${fmtDate(a)} – ${fmtDate(b)}`;

// ---------- Tools ----------
const PAY_READ = [
  { name: 'pay_preview', description: 'Signed timesheets in a pay period that are not yet paid or invoiced, plus unsigned ones. Without dates uses the suggested pay period (last completed week/fortnight/month).',
    input_schema: { type: 'object', properties: { start: { type: 'string', description: 'YYYY-MM-DD' }, end: { type: 'string', description: 'YYYY-MM-DD inclusive' } } } },
  { name: 'pay_run_status', description: 'Without pay_run_id: the 8 most recent pay runs with review counts. With pay_run_id: that run\'s statements (officer, total, review status), open queries and invoices.',
    input_schema: { type: 'object', properties: { pay_run_id: { type: 'string' } } } },
  { name: 'list_disputes', description: 'Pay queries raised by officers on their statements.',
    input_schema: { type: 'object', properties: { status: { type: 'string', enum: ['open', 'resolved', 'all'] } } } },
  { name: 'list_invoices', description: 'Venue invoices and credit notes, newest first.',
    input_schema: { type: 'object', properties: { status: { type: 'string', enum: ['draft', 'issued', 'paid', 'overdue', 'void'] }, venue: { type: 'string', description: 'Venue name (partial ok)' } } } },
];
const SHARED_READ = [
  { name: 'search_messages', description: 'Search the messages this person can see in Messages (their own conversations).',
    input_schema: { type: 'object', properties: { text: { type: 'string' }, days: { type: 'integer', description: 'How far back, default 30' } }, required: ['text'] } },
];
const MONEY_ACTIONS = [
  { name: 'create_pay_run', description: 'Prepare a pay run (draft statements for every officer with signed hours) for a period. Needs Confirm.',
    input_schema: { type: 'object', properties: { start: { type: 'string' }, end: { type: 'string' } }, required: ['start', 'end'] } },
  { name: 'send_for_review', description: 'Prepare sending a draft pay run to officers to approve or query, with a deadline of 1–7 days. Needs Confirm.',
    input_schema: { type: 'object', properties: { pay_run_id: { type: 'string' }, deadline_days: { type: 'integer', minimum: 1, maximum: 7 } }, required: ['pay_run_id'] } },
  { name: 'resolve_dispute', description: 'Prepare an answer to an officer\'s pay query, optionally correcting the hours on the queried line or adding a bonus/expense/deduction. Needs Confirm.',
    input_schema: { type: 'object', properties: {
      dispute_id: { type: 'string' }, resolution: { type: 'string', description: 'Reply the officer will read' }, line_hours: { type: 'number' },
      adjustment: { type: 'object', properties: { kind: { type: 'string', enum: ['bonus', 'expense', 'deduction'] }, amount: { type: 'number' }, description: { type: 'string' } } } },
    required: ['dispute_id', 'resolution'] } },
  { name: 'finalise_pay_run', description: 'Prepare closing the review on a pay run and running the reconciliation. If some officers did not respond, no_response must be "approve" (approve on their behalf) or "hold" (hold them back). Needs Confirm.',
    input_schema: { type: 'object', properties: { pay_run_id: { type: 'string' }, no_response: { type: 'string', enum: ['approve', 'hold'] } }, required: ['pay_run_id'] } },
  { name: 'issue_pay_run', description: 'Prepare issuing the statements of a finalised pay run to officers (saves each PDF). Needs Confirm.',
    input_schema: { type: 'object', properties: { pay_run_id: { type: 'string' } }, required: ['pay_run_id'] } },
  { name: 'generate_invoices', description: 'Prepare draft venue invoices for a period, from hours officers approved in finalised pay runs. Needs Confirm.',
    input_schema: { type: 'object', properties: { start: { type: 'string' }, end: { type: 'string' }, venue: { type: 'string' }, pay_run_id: { type: 'string' } }, required: ['start', 'end'] } },
  { name: 'issue_invoices', description: 'Prepare issuing draft invoices to venues (numbers them, saves each PDF, emails the venue). Needs Confirm.',
    input_schema: { type: 'object', properties: { invoice_ids: { type: 'array', items: { type: 'string' } } }, required: ['invoice_ids'] } },
  { name: 'mark_paid', description: 'Prepare marking a pay run (all issued statements) or an invoice as paid. Needs Confirm.',
    input_schema: { type: 'object', properties: { kind: { type: 'string', enum: ['pay_run', 'invoice'] }, id: { type: 'string' } }, required: ['kind', 'id'] } },
];
const MESSAGE_ACTION = [
  { name: 'draft_message', description: 'Prepare a direct message to one person in Messages. The person sees the draft and taps Confirm to send it.',
    input_schema: { type: 'object', properties: { to: { type: 'string', description: 'Person\'s name' }, body: { type: 'string' } }, required: ['to', 'body'] } },
];

function toolsFor(user) {
  return [
    ...CHAT_TOOLS, ...SHARED_READ, ...MESSAGE_ACTION,
    ...(canSeePay(user) ? PAY_READ : []),
    ...(user.role === 'company' ? MONEY_ACTIONS : []),
  ];
}

async function runRead(name, input, user) {
  const ctx = { user };
  switch (name) {
    case 'pay_preview': {
      if (!canSeePay(user)) return { error: 'No access to pay' };
      let { start, end } = input;
      if (!start || !end) ({ start, end } = (await ACTIONS['pay.suggestPeriod'].fn({}, ctx)).pay);
      const p = await ACTIONS['pay.preview'].fn({ start, end }, ctx);
      return { start, end, ...p };
    }
    case 'pay_run_status': {
      if (!canSeePay(user)) return { error: 'No access to pay' };
      if (!input.pay_run_id) {
        const runs = await ACTIONS['payRuns.list'].fn({ limit: 8 }, ctx);
        return runs.map((r) => ({ id: r.id, period: range(r.period_start, r.period_end), status: r.status, statements: r.statements, total: r.total,
          pending: r.pending, approved: r.approved, disputed: r.disputed, no_response: r.no_response, open_queries: r.open_disputes, review_deadline: r.review_deadline && fmtDateTime(r.review_deadline) }));
      }
      const r = await ACTIONS['payRuns.get'].fn({ id: input.pay_run_id }, ctx);
      return { id: r.id, period: range(r.period_start, r.period_end), status: r.status, review_deadline: r.review_deadline && fmtDateTime(r.review_deadline),
        statements: r.statements.map((s) => ({ officer: s.officer_name, total: s.total, hours: s.hours, review: s.review_status, held: s.held, status: s.status })),
        open_queries: r.disputes.filter((d) => d.status === 'open').map((d) => ({ id: d.id, officer: d.officer_name, line: d.line_description, comment: d.comment })),
        invoices: r.invoices.map((i) => ({ id: i.id, venue: i.venue_name, number: i.number, status: i.status, gross: i.gross })) };
    }
    case 'list_disputes': {
      if (!canSeePay(user)) return { error: 'No access to pay' };
      const st = input.status || 'open';
      return q(
        `SELECT d.id, d.status, d.line_description AS line, d.comment, d.resolution, d.created_at, o.first_name || ' ' || o.last_name AS officer, st.pay_run_id
           FROM statement_disputes d JOIN statements st ON st.id = d.statement_id JOIN officers o ON o.id = st.officer_id
          WHERE ($1 = 'all' OR d.status = $1) ORDER BY d.created_at DESC LIMIT 30`, [st]);
    }
    case 'list_invoices': {
      if (!canSeePay(user)) return { error: 'No access to pay' };
      if (user.role !== 'company') return { error: 'Invoices are only available to the company' };
      const rows = await ACTIONS['invoices.list'].fn({ status: input.status }, ctx);
      return rows.filter((i) => !input.venue || i.venue_name.toLowerCase().includes(String(input.venue).toLowerCase())).slice(0, 30)
        .map((i) => ({ id: i.id, number: i.number, kind: i.kind, venue: i.venue_name, status: i.status, gross: i.gross, period: i.period_start && range(i.period_start, i.period_end), due: i.due_date && fmtDate(i.due_date) }));
    }
    case 'search_messages': {
      const days = Math.min(Math.max(Number(input.days) || 30, 1), 365);
      return q(
        `SELECT m.body, m.created_at, u.name AS sender, COALESCE(NULLIF(c.title, ''), c.kind) AS conversation
           FROM messages m JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = $1
           JOIN conversations c ON c.id = m.conversation_id JOIN users u ON u.id = m.sender_id
          WHERE m.deleted_at IS NULL AND m.body ILIKE $2 AND m.created_at > now() - make_interval(days => $3)
          ORDER BY m.created_at DESC LIMIT 20`, [user.id, `%${String(input.text).slice(0, 100)}%`, days]);
    }
    default:
      return undefined;
  }
}

// Action tools only describe the change. The summary is written here from the data, not by the model.
async function prepare(name, input, user) {
  if (MONEY_ACTIONS.some((t) => t.name === name) && user.role !== 'company') return { error: 'Only the company can make pay and invoice changes' };
  const run = async (id) => need(await one('SELECT * FROM pay_runs WHERE id = $1', [id]), 'Pay run not found');
  switch (name) {
    case 'create_pay_run': {
      const p = await ACTIONS['pay.preview'].fn({ start: input.start, end: input.end }, { user });
      if (!Number(p.unpaid.n)) return { error: `No signed, unpaid timesheets between ${range(input.start, input.end)}` };
      return { summary: `Create a pay run for ${range(input.start, input.end)}: ${p.unpaid.n} signed timesheets, ${Number(p.unpaid.hours).toFixed(1)} hours${p.unsigned ? ` (${p.unsigned} not yet signed are left out)` : ''}.`,
        steps: [{ action: 'pay.generate', body: { start: input.start, end: input.end, via: 'ai' } }] };
    }
    case 'send_for_review': {
      const r = await run(input.pay_run_id);
      const days = Math.min(Math.max(Math.round(Number(input.deadline_days) || 3), 1), 7);
      return { summary: `Send the ${range(r.period_start, r.period_end)} pay run to officers to check, with ${days} ${days === 1 ? 'day' : 'days'} to respond.`,
        steps: [{ action: 'payRuns.sendForReview', body: { id: r.id, deadline_days: days, via: 'ai' } }] };
    }
    case 'resolve_dispute': {
      const d = need(await one(`SELECT d.*, o.first_name || ' ' || o.last_name AS officer FROM statement_disputes d JOIN statements st ON st.id = d.statement_id
                                  JOIN officers o ON o.id = st.officer_id WHERE d.id = $1`, [input.dispute_id]), 'Query not found');
      const extra = [input.line_hours != null && `set the hours on "${d.line_description}" to ${input.line_hours}`,
        input.adjustment?.amount && `add a ${input.adjustment.kind || 'bonus'} of ${gbp(Math.abs(input.adjustment.amount))}`].filter(Boolean);
      return { summary: `Answer ${d.officer}'s pay query${extra.length ? `, ${extra.join(' and ')}` : ''}, and reply: "${input.resolution}"`,
        steps: [{ action: 'payRuns.resolveDispute', body: { dispute_id: d.id, resolution: input.resolution, line_hours: input.line_hours ?? null, adjustment: input.adjustment || null, via: 'ai' } }] };
    }
    case 'finalise_pay_run': {
      const r = await run(input.pay_run_id);
      const nr = input.no_response === 'hold' ? ' Officers who did not respond are held back.' : input.no_response === 'approve' ? ' Officers who did not respond are approved on their behalf.' : '';
      return { summary: `Finalise the ${range(r.period_start, r.period_end)} pay run and check the figures.${nr}`,
        steps: [{ action: 'payRuns.finalise', body: { id: r.id, no_response: input.no_response || null, via: 'ai' } }] };
    }
    case 'issue_pay_run': {
      const r = await run(input.pay_run_id);
      const n = await one("SELECT count(*)::int AS n, COALESCE(sum(total),0) AS total FROM statements WHERE pay_run_id = $1 AND status = 'draft' AND NOT held", [r.id]);
      return { summary: `Issue ${n.n} pay ${n.n === 1 ? 'statement' : 'statements'} for ${range(r.period_start, r.period_end)}, total ${gbp(n.total)}. Each officer is notified and the PDF is saved to their documents.`,
        steps: [{ action: 'payRuns.issue', body: { id: r.id, via: 'ai' } }] };
    }
    case 'generate_invoices': {
      let venueId = null;
      if (input.venue) {
        const scope = await venueScope(user);
        venueId = need(await one('SELECT id FROM venues WHERE name ILIKE $1 AND ($2::uuid[] IS NULL OR id = ANY($2)) LIMIT 1', [`%${input.venue}%`, scope]), `No venue called ${input.venue}`).id;
      }
      return { summary: `Create draft invoices for ${range(input.start, input.end)}${input.venue ? ` for ${input.venue}` : ' for every venue'}, from hours officers have approved.`,
        steps: [{ action: 'invoices.generate', body: { start: input.start, end: input.end, venue_id: venueId, pay_run_id: input.pay_run_id || null, via: 'ai' } }] };
    }
    case 'issue_invoices': {
      const inv = await q("SELECT i.id, i.gross, v.name FROM invoices i JOIN venues v ON v.id = i.venue_id WHERE i.id = ANY($1::uuid[]) AND i.status = 'draft'", [input.invoice_ids || []]);
      if (!inv.length) return { error: 'None of those invoices are drafts' };
      return { summary: `Issue ${inv.length} ${inv.length === 1 ? 'invoice' : 'invoices'}: ${inv.map((i) => `${i.name} ${gbp(i.gross)}`).join(', ')}. Each venue is emailed and the PDF is saved to its documents.`,
        steps: inv.map((i) => ({ action: 'invoices.issue', body: { id: i.id, via: 'ai' } })) };
    }
    case 'mark_paid': {
      if (input.kind === 'invoice') {
        const i = need(await one('SELECT i.number, i.gross, v.name FROM invoices i JOIN venues v ON v.id = i.venue_id WHERE i.id = $1', [input.id]), 'Invoice not found');
        return { summary: `Mark invoice ${i.number} (${i.name}, ${gbp(i.gross)}) as paid.`, steps: [{ action: 'invoices.markPaid', body: { id: input.id, via: 'ai' } }] };
      }
      const r = await run(input.id);
      return { summary: `Mark every issued statement in the ${range(r.period_start, r.period_end)} pay run as paid. Officers are told the money is on its way.`,
        steps: [{ action: 'payRuns.markPaid', body: { id: r.id, via: 'ai' } }] };
    }
    case 'draft_message': {
      const to = need(await one(
        "SELECT id, name FROM users WHERE status = 'active' AND NOT system AND id <> $2 AND name ILIKE $1 ORDER BY role = 'officer' DESC, name LIMIT 1",
        [`%${String(input.to).slice(0, 80)}%`, user.id]), `No one called ${input.to}`);
      const body = String(input.body || '').trim().slice(0, 4000);
      if (!body) return { error: 'The message is empty' };
      return { summary: `Send ${to.name} a message: "${body}"`,
        steps: [{ action: 'messages.startDirect', body: { user_id: to.id } }, { action: 'messages.send', body: { body }, conversationFromPrevious: true }] };
    }
    default:
      return undefined;
  }
}

// Read tools answer; action tools return { summary, steps } for a card; Ops tools (incl. propose_change) as before
async function callTool(name, input, user, tools, created) {
  if (!tools.some((t) => t.name === name)) return { error: 'Not available to this person' };
  const read = await runRead(name, input, user);
  if (read !== undefined) return read;
  const prepared = await prepare(name, input, user);
  if (prepared !== undefined) return prepared;
  return runTool(name, input, user, created);
}

function systemPrompt(user, page) {
  const now = new Date();
  const pay = canSeePay(user);
  return `You are Ask Orb, the assistant inside Orb Security, a UK manned-security company. You are helping ${user.name}, ${user.role === 'company' ? 'a company manager' : 'a security manager'}.
Today is ${londonParts(now).weekday} ${londonDate(now)}, time ${fmtTime(now)} Europe/London. Weeks run Monday to Sunday.
What this person can do: rotas, cover, attendance, hours, compliance and Messages.${pay ? ' They can see pay.' : ' They CANNOT see pay, pay statements or invoices: refuse those questions politely and say the company can give them access.'}${user.role === 'company' ? ' They can run pay and invoices.' : ' They cannot run pay or invoices; only the company can.'}
${page?.name ? `They are looking at: ${page.name}${page.id ? ` (id ${page.id})` : ''}. "This" or "here" usually means that.` : ''}
How you work:
- Use the tools to look things up. Never guess names, figures, dates or ids.
- You never change anything yourself. Action tools (create_pay_run, send_for_review, resolve_dispute, finalise_pay_run, issue_pay_run, generate_invoices, issue_invoices, mark_paid, draft_message) only prepare a card; the person taps Confirm to do it. Prepare at most one action per reply, then say in one sentence what the card will do and that they need to tap Confirm. Rota and cover changes go through propose_change, which puts a card in the Ops AI inbox.
- The pay workflow is: create the pay run → send it to officers to review (1–7 days) → resolve any queries → finalise → issue → mark paid; invoices are made from approved hours after finalising. When asked to "do the pay run", check pay_run_status and pay_preview first and prepare the next step.
- Answer in short, plain British business English. Use names, dates like "Sat 24 Oct" and 24-hour times. Money in pounds. No markdown tables; short lists are fine.`;
}

// Prior turns as plain text; the tool calls of earlier turns are not replayed
async function historyFor(convId) {
  const rows = await q('SELECT role, content, pending_action, action_status FROM assistant_messages WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 20', [convId]);
  return rows.reverse().map((m) => {
    let text = m.content?.text || '';
    if (m.pending_action) text += `\n[Action card: ${m.pending_action.summary} — ${m.action_status}]`;
    if (m.content?.result) text += `\n[Result: ${m.content.result}]`;
    return { role: m.role, content: text || '…' };
  }).reduce((acc, m) => {
    // The API needs alternating roles
    if (acc.length && acc[acc.length - 1].role === m.role) acc[acc.length - 1].content += `\n${m.content}`;
    else acc.push(m);
    return acc;
  }, []).filter((m, i, a) => !(i === 0 && m.role === 'assistant'));
}

async function ownConversation(user, id) {
  const c = need(await one('SELECT * FROM assistant_conversations WHERE id = $1', [id]), 'Chat not found');
  if (c.user_id !== user.id) fail(403, 'Forbidden');
  return c;
}

const shapeMessage = (m) => ({
  id: m.id, role: m.role, text: m.content?.text || '', result: m.content?.result || null, items: m.content?.items || [],
  pending_action: m.pending_action ? { summary: m.pending_action.summary } : null, action_status: m.action_status, created_at: m.created_at,
});

// Plain-language result of a confirmed step
function describe(action, r) {
  if (!r || typeof r !== 'object') return 'Done.';
  switch (action) {
    case 'pay.generate': return r.created ? `Pay run created with ${r.created} ${r.created === 1 ? 'statement' : 'statements'}${r.missing_rates?.length ? `. Missing pay rates: ${r.missing_rates.join(', ')}` : ''}.` : 'Nothing to pay in that period.';
    case 'payRuns.sendForReview': return `Sent to ${r.sent} ${r.sent === 1 ? 'officer' : 'officers'}; they have until ${fmtDateTime(r.review_deadline)}.`;
    case 'payRuns.resolveDispute': return `Query resolved${r.changes?.length ? ` (${r.changes.join(', ')})` : ''}. New total ${gbp(r.total)}.`;
    case 'payRuns.finalise': return `Pay run finalised${r.held ? `; ${r.held} held back` : ''}${r.approved_on_behalf ? `; ${r.approved_on_behalf} approved on their behalf` : ''}.`;
    case 'payRuns.issue': return `${r.issued} ${r.issued === 1 ? 'statement' : 'statements'} issued and saved.`;
    case 'payRuns.markPaid': case 'pay.markPaid': return `${r.paid} marked as paid.`;
    case 'invoices.generate': return `${r.created} draft ${r.created === 1 ? 'invoice' : 'invoices'} created${r.skipped ? `; ${r.skipped} timesheets left out because the hours are not yet approved` : ''}.`;
    case 'invoices.issue': return `Invoice ${r.number} issued (${gbp(r.gross)}).`;
    case 'invoices.markPaid': return `Invoice ${r.number} marked as paid.`;
    case 'messages.send': return 'Message sent.';
    default: return 'Done.';
  }
}

export const actions = {
  'assistant.list': def(MGR, async (_b, { user }) =>
    q(`SELECT c.id, c.title, c.updated_at, (SELECT count(*)::int FROM assistant_messages m WHERE m.conversation_id = c.id AND m.action_status = 'pending') AS pending
         FROM assistant_conversations c WHERE c.user_id = $1 ORDER BY c.updated_at DESC LIMIT 50`, [user.id])),

  'assistant.get': def(MGR, async (b, { user }) => {
    required(b, 'id');
    const c = await ownConversation(user, b.id);
    const msgs = await q('SELECT * FROM assistant_messages WHERE conversation_id = $1 ORDER BY created_at', [c.id]);
    return { ...c, messages: msgs.map(shapeMessage) };
  }),

  'assistant.send': def(MGR, async (b, { user }) => {
    const text = String(b.text || '').trim();
    if (!text) fail(400, 'Ask a question');
    if (text.length > 4000) fail(400, 'Keep it under 4,000 characters');
    const s = await getSettings();
    if (!jobOn(s, 'chat')) fail(400, 'Ask Orb is switched off in Ops AI settings');
    const conv = b.conversation_id ? await ownConversation(user, b.conversation_id)
      : await one('INSERT INTO assistant_conversations (user_id, title) VALUES ($1,$2) RETURNING *', [user.id, text.replace(/\s+/g, ' ').slice(0, 60)]);
    const messages = await historyFor(conv.id);
    // A previous question that got no answer (e.g. AI unavailable) is merged with this one
    if (messages.length && messages[messages.length - 1].role === 'user') messages[messages.length - 1].content += `\n${text}`;
    else messages.push({ role: 'user', content: text });
    const userMsg = await one("INSERT INTO assistant_messages (conversation_id, role, content) VALUES ($1,'user',$2) RETURNING *", [conv.id, JSON.stringify({ text })]);

    const page = b.page && typeof b.page === 'object' ? { name: String(b.page.name || '').slice(0, 80), id: String(b.page.id || '').slice(0, 40) } : null;
    const system = systemPrompt(user, page);
    const tools = toolsFor(user);
    const created = [];
    let pending = null;
    let credits = 0;
    let reply = '';
    for (let round = 0; round < 7; round++) {
      const r = await claude({ model: SONNET, system, messages, tools: round < 6 ? tools : undefined, max_tokens: 1200 });
      credits += r.credits;
      const uses = (r.content || []).filter((c) => c.type === 'tool_use');
      if (r.stop_reason !== 'tool_use' || !uses.length) {
        reply = (r.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
        break;
      }
      messages.push({ role: 'assistant', content: r.content });
      const results = [];
      for (const u of uses) {
        let out;
        try {
          out = await callTool(u.name, u.input || {}, user, tools, created);
          if (out?.steps) {
            if (pending) out = { error: 'Only one action can wait for Confirm at a time. Mention the next step in your reply instead.' };
            else { pending = out; out = { prepared: out.summary, note: 'Card shown to the person. Nothing has changed yet; they must tap Confirm.' }; }
          }
        } catch (e) {
          out = { error: e.message };
        }
        results.push({ type: 'tool_result', tool_use_id: u.id, content: JSON.stringify(out ?? null).slice(0, 12000) });
      }
      messages.push({ role: 'user', content: results });
    }
    if (!reply) reply = pending ? 'I have prepared this for you. Tap Confirm to go ahead.' : 'That needed too many steps. Try a narrower question.';
    const m = await one(
      `INSERT INTO assistant_messages (conversation_id, role, content, pending_action, action_status, credits) VALUES ($1,'assistant',$2,$3,$4,$5) RETURNING *`,
      [conv.id, JSON.stringify({ text: reply, items: created }), pending ? JSON.stringify(pending) : null, pending ? 'pending' : null, credits]);
    await q('UPDATE assistant_conversations SET updated_at = now() WHERE id = $1', [conv.id]);
    await logActivity('chat', `${user.name} asked Ask Orb: ${text.slice(0, 140)}`, { credits });
    return { conversation_id: conv.id, title: conv.title, user_message: shapeMessage(userMsg), message: shapeMessage(m), credits };
  }),

  // Runs the prepared steps as this person: role checks, the action's own checks, and an audit entry
  'assistant.confirm': def(MGR, async (b, ctx) => {
    const { user } = ctx;
    required(b, 'message_id');
    const m = need(await one('SELECT * FROM assistant_messages WHERE id = $1', [b.message_id]));
    await ownConversation(user, m.conversation_id);
    // Only one Confirm can win
    const claimed = await one("UPDATE assistant_messages SET action_status = 'confirmed' WHERE id = $1 AND action_status = 'pending' RETURNING *", [m.id]);
    if (!claimed) fail(400, m.action_status === 'confirmed' ? 'Already done' : 'This card is no longer open');
    const results = [];
    let prev = null;
    try {
      for (const step of m.pending_action.steps || []) {
        const entry = ACTIONS[step.action];
        if (!entry || !entry.roles.includes(user.role)) fail(403, 'You do not have access to this');
        if (MONEY.test(step.action) && user.role !== 'company') fail(403, 'Only the company can make pay and invoice changes');
        const body = { ...step.body, ...(step.conversationFromPrevious ? { conversation_id: prev?.id } : {}) };
        prev = await entry.fn(body, ctx);
        results.push(describe(step.action, prev));
        await audit(user, step.action, 'assistant_message', m.id, { via: 'ask_orb', body });
      }
    } catch (e) {
      const msg = e instanceof HttpError ? e.message : 'Something went wrong';
      if (!(e instanceof HttpError)) console.error('[assistant] confirm', e);
      await q("UPDATE assistant_messages SET action_status = 'failed', action_result = $2, content = content || $3 WHERE id = $1",
        [m.id, JSON.stringify({ error: msg, done: results }), JSON.stringify({ result: [...results, `Could not finish: ${msg}`].join(' ') })]);
      return { ok: false, error: msg, message: shapeMessage(await one('SELECT * FROM assistant_messages WHERE id = $1', [m.id])) };
    }
    const text = results.filter((r, i, a) => a.indexOf(r) === i).join(' ');
    const done = await one("UPDATE assistant_messages SET action_result = $2, content = content || $3 WHERE id = $1 RETURNING *",
      [m.id, JSON.stringify({ done: results, last: prev }), JSON.stringify({ result: text })]);
    await q('UPDATE assistant_conversations SET updated_at = now() WHERE id = $1', [m.conversation_id]);
    return { ok: true, result: text, data: prev, message: shapeMessage(done) };
  }),

  'assistant.cancel': def(MGR, async (b, { user }) => {
    required(b, 'message_id');
    const m = need(await one('SELECT * FROM assistant_messages WHERE id = $1', [b.message_id]));
    await ownConversation(user, m.conversation_id);
    const r = need(await one("UPDATE assistant_messages SET action_status = 'cancelled' WHERE id = $1 AND action_status = 'pending' RETURNING *", [m.id]), 'This card is no longer open', 400);
    return { ok: true, message: shapeMessage(r) };
  }),

  'assistant.rename': def(MGR, async (b, { user }) => {
    required(b, 'id', 'title');
    await ownConversation(user, b.id);
    await q('UPDATE assistant_conversations SET title = $2 WHERE id = $1', [b.id, String(b.title).trim().slice(0, 80) || 'Chat']);
    return { ok: true };
  }),

  'assistant.delete': def(MGR, async (b, { user }) => {
    required(b, 'id');
    await ownConversation(user, b.id);
    await q('DELETE FROM assistant_conversations WHERE id = $1', [b.id]);
    return { ok: true };
  }),
};
