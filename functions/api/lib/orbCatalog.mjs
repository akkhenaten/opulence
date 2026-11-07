// Orb's catalogue: the app actions the assistant may use, and how much care each needs.
// read = runs and returns data; auto = runs straight away (small, reversible or internal);
// confirm = becomes a line on a card the manager taps Confirm on.
// Every call still goes through the action's own role and scope checks, as the signed-in manager.
import { canSeePay } from './auth.mjs';

const e = (area, title, tier, params = '', extra = {}) => ({ area, title, tier, params, ...extra });
const r = (area, title, params, extra) => e(area, title, 'read', params, extra);
const a = (area, title, params, extra) => e(area, title, 'auto', params, extra);
const c = (area, title, params, extra) => e(area, title, 'confirm', params, extra);

const staff = (id) => id && `staff/${id}`;

export const CATALOG = {
  // People & onboarding
  'officers.list': r('people', 'List officers', 'status (applicant|onboarding|active|suspended|left)?, role?, q?'),
  'officers.get': r('people', 'Officer profile', 'id'),
  'officers.save': c('people', 'Add or update an officer', `id? (omit to add), first_name, last_name, goes_by? (the name they are known by), email, phone, dob, address, postcode, ni_number, utr, bank_name, bank_sort_code, bank_account,
    sia_number, sia_type, sia_expiry, rtw_type, rtw_expiry, rtw_verified, status, roles[], max_weekly_hours, start_date, notes, invite (true sends a login invite)`,
  { link: (res, b) => staff(res?.id || b.id) }),
  'officers.inviteLogin': c('people', 'Invite an officer to log in', 'id (officer)', { link: (_r, b) => staff(b.id) }),
  'officers.saveRate': c('people', "Set an officer's pay rate", 'officer_id, role, rate, venue_id?, effective_from', { link: (_r, b) => staff(b.officer_id) }),
  'officers.saveAvailability': c('people', "Update an officer's availability", 'officer_id, days', { link: (_r, b) => staff(b.officer_id) }),
  'officers.saveBan': c('people', 'Bar or allow an officer at a venue', 'officer_id, venue_id, reason, remove?', { link: (_r, b) => staff(b.officer_id) }),
  'onboarding.pipeline': r('onboarding', 'Onboarding pipeline', ''),
  'onboarding.tasks': r('onboarding', "Officer's onboarding tasks", 'officer_id'),
  'onboarding.toggle': a('onboarding', 'Tick an onboarding task', 'officer_id, code, done (true|false)', {
    link: (_r, b) => staff(b.officer_id), undo: (_r, b) => ({ action: 'onboarding.toggle', body: { officer_id: b.officer_id, code: b.code, done: !b.done } }) }),
  'onboarding.setStatus': c('onboarding', "Move an officer's onboarding stage", 'officer_id, status, invite?', { link: (_r, b) => staff(b.officer_id) }),
  'docs.list': r('documents', 'Documents on file', 'owner_type (officer|venue|company), owner_id, kind?'),
  'docs.expiring': r('documents', 'Documents expiring soon', 'days?'),
  'docs.verify': c('documents', 'Mark a document verified', 'id'),
  'compliance.overview': r('compliance', 'Compliance issues (SIA, right to work, documents)', 'severity?'),
  'ops.dismissIssue': c('compliance', 'Dismiss a compliance issue', 'id, key, reason'),
  'timeoff.list': r('people', 'Time-off requests', 'officer_id?, status?, from?, to?'),
  'timeoff.decide': c('people', 'Approve or decline time off', 'id, status (approved|rejected)'),
  'hrnotes.list': r('people', 'HR notes', 'officer_id, kind?'),
  'hrnotes.create': a('people', 'Add an HR note', 'officer_id, kind (note|commendation|training|venue_feedback|warning|review), title, body, level?, visible_to_officer?', {
    // Warnings and reviews are HR outcomes, and a note the officer can see notifies them: those wait for Confirm
    confirmWhen: (b) => ['warning', 'review'].includes(b.kind) || !!b.visible_to_officer,
    link: (_r, b) => staff(b.officer_id), undo: (res) => res?.id && { action: 'hrnotes.delete', body: { id: res.id } } }),
  'growth.officer': r('people', "Officer's 1:1s, goals and pay rises", 'officer_id'),
  'oneToOnes.save': a('people', 'Record a 1:1', 'officer_id, held_on, notes, rating?, shared_with_officer?', { link: (_r, b) => staff(b.officer_id),
    undo: (res, b) => !b.id && res?.id && { action: 'oneToOnes.delete', body: { id: res.id } } }),
  'goals.save': a('people', 'Set a goal', 'officer_id, title, target?, due_on?', { link: (_r, b) => staff(b.officer_id) }),
  'goals.addNote': a('people', 'Add a note to a goal', 'goal_id, body'),
  'goals.setStatus': c('people', 'Change a goal status', 'id, status'),
  'offboarding.save': c('people', 'Offboard an officer (leaving)', 'officer_id, leave_date, reason, kit_returned?, rehire_eligible?, notes?, disable_login?', { link: (_r, b) => staff(b.officer_id) }),
  'attendance.list': r('people', "Officer's attendance record", 'officer_id'),
  'users.list': r('people', 'Manager and staff logins', 'role?'),
  'users.invite': c('people', 'Invite a manager login', 'email, name, role (company|security|venue), venue_ids[]?'),
  'users.update': c('people', "Change a login's status or venues", 'id, status?, venue_ids[]?'),

  // Rota & operations
  'dashboard.get': r('overview', 'Dashboard summary', ''),
  'live.board': r('rota', "Live board: who is on shift now", 'venue_id?'),
  'shifts.list': r('rota', 'Shifts in a date range', 'from (YYYY-MM-DD), to, venue_id?, officer_id?'),
  'shifts.get': r('rota', 'Shift details', 'id'),
  'shifts.candidates': r('rota', 'Ranked officers who could work a shift', 'shift_id'),
  'shifts.pendingRequests': r('rota', 'Officers asking for open shifts', ''),
  'shifts.save': e('rota', 'Create or edit a shift', 'auto', 'id?, venue_id, role (code from roles.list, e.g. door), starts_at (ISO), ends_at (ISO), break_minutes?, headcount?, open?, notes? — new shifts are saved as drafts', {
    confirmWhen: (b) => !!b.id || (b.status && b.status !== 'draft'), link: (res, b) => (res?.id || b.id) && `shifts/${res?.id || b.id}`,
    undo: (res, b) => !b.id && res?.id && { action: 'shifts.delete', body: { id: res.id } }, prepare: (b) => (b.id ? b : { ...b, status: 'draft' }) }),
  'shifts.bulkCreate': e('rota', 'Create draft shifts on several dates', 'auto', 'venue_id, role (code from roles.list, e.g. door), start_time (HH:MM), end_time, dates[], headcount?, break_minutes?, open?, notes?', {
    confirmWhen: (b) => b.status && b.status !== 'draft', prepare: (b) => ({ ...b, status: 'draft' }), link: () => 'rota' }),
  'shifts.publish': c('rota', 'Publish shifts and notify officers', 'ids[]', { link: () => 'rota' }),
  'shifts.copyWeek': c('rota', 'Copy a week of shifts', 'from_week (Monday YYYY-MM-DD), to_week, venue_id?', { link: () => 'rota' }),
  'shifts.assign': c('rota', 'Add an officer to an unfilled place on a shift', 'shift_id, officer_id, override? — only for empty places; to swap someone use shifts.reassign', { link: (_r, b) => `shifts/${b.shift_id}` }),
  'shifts.reassign': c('rota', 'Replace an officer on a shift (swap one for another)', 'shift_id, from_officer_id (or assignment_id), officer_id (the new officer), override?', { link: (_r, b) => `shifts/${b.shift_id}` }),
  'shifts.unassign': c('rota', 'Remove an officer from a shift', 'id (assignment id)'),
  'shifts.cancel': c('rota', 'Cancel a shift', 'id, reason'),
  'shifts.delete': c('rota', 'Delete a draft shift', 'id'),
  'shifts.decideRequest': c('rota', "Approve or decline an officer's shift request", 'id, approve'),
  'shifts.setLead': c('rota', 'Set the lead officer on a shift', 'shift_id, assignment_id'),
  'cover.list': r('rota', 'Cover requests from venues', 'status?, venue_id?'),
  'cover.decideChange': c('rota', "Approve or decline a venue's cover change", 'id, approve, reason?'),
  'clock.exceptions': r('rota', 'Clock-in exceptions to decide', 'include_decided?'),
  'clock.decide': c('rota', 'Accept or reject a clock-in exception', 'id, approve'),
  'clock.proofReport': r('rota', 'How officers prove they are on site at clock-in (phone, location, venue code, selfie) per officer and venue', 'from? (YYYY-MM-DD), to?, venue_id?'),
  'device.list': r('rota', 'Clock-in phones: pending new-phone requests, or one officer\'s registered phone', 'pending? (true), officer_id?'),
  'device.decide': c('rota', 'Approve or reject an officer\'s new clock-in phone', 'id, approve'),
  'device.revoke': c('rota', 'Remove an officer\'s registered clock-in phone', 'id'),
  'venues.tags': r('venues', 'NFC tags at a venue', 'venue_id'),
  'clock.manual': c('rota', 'Record hours manually', 'assignment_id, start (ISO), end (ISO), reason, break_minutes?'),
  'timesheets.list': r('rota', 'Timesheets', 'status (pending|approved|signed|disputed|declined)?, from?, to?, venue_id?, officer_id?'),
  'timesheets.missing': r('rota', 'Worked shifts with no timesheet yet', ''),
  'timesheets.approve': c('rota', 'Approve timesheets', 'ids[]', { link: () => 'timesheets' }),
  'timesheets.sign': c('rota', 'Sign timesheets for the venue', 'ids[]', { link: () => 'timesheets' }),
  'timesheets.dispute': c('rota', 'Query a timesheet', 'id, comment'),
  'timesheets.edit': c('rota', 'Correct a timesheet', 'id, reason, actual_start?, actual_end?, break_minutes?, hours?'),
  'timesheets.week': r('rota', 'Timesheet table for a week (every booked officer, with state and totals)', 'from (ISO), to (ISO), venue_id?, officer_id?'),
  'timesheets.decline': c('rota', 'Decline timesheets (not worked: no pay, no charge)', 'reason, ids[]? (timesheets), assignment_ids[]? (no-shows)', { link: () => 'timesheets' }),
  'timesheets.answer': c('rota', 'Answer a timesheet query', 'id, reply'),
  'shiftlog.list': r('rota', 'Shift logs', 'venue_id?, status?, from?, to?'),
  'ops.inbox': r('rota', 'Orb inbox (suggestions waiting)', 'status?'),
  'ops.activity': r('rota', 'Orb activity', ''),
  'ops.decide': c('rota', 'Accept or reject an Orb suggestion', 'id, decision (approve|reject), reason?'),
  'venues.list': r('venues', 'Venues', 'include_inactive?'),
  'venues.get': r('venues', 'Venue details', 'id'),
  'venues.rates': r('venues', 'Venue charge rates', 'venue_id'),
  'venues.save': c('venues', 'Add or update a venue', 'id?, client_id?, name, address, postcode, lat?, lng?, radius_m?, phone?, website_url?, city?, instructions?, notes?, invoice_cycle?, active?', {
    link: (res, b) => (res?.id || b.id) && `venues/${res?.id || b.id}` }),
  'venues.findAddress': r('venues', "Find a venue's address, postcode and map pin on the internet (its website and OpenStreetMap)", 'id', { words: 'location geocode lookup search web' }),
  'venues.findAddresses': r('venues', 'Find addresses for many venues at once (default: every venue missing its address, postcode or map pin)', 'ids[]?', { words: 'location geocode lookup search web all' }),
  'venues.findLogo': r('venues', "Find a venue's logo on its website", 'id', { words: 'brand icon picture image lookup search web' }),
  'venues.useLogo': c('venues', "Use a logo from the internet as the venue's logo", 'id, url (from venues.findLogo)', {
    link: (_r, b) => `venues/${b.id}`, image: (b) => b.url }),
  'venues.saveRate': c('venues', 'Set a venue charge rate', 'venue_id, role, rate, night_uplift?, weekend_uplift?, bh_uplift?, min_hours?, effective_from'),
  'clients.list': r('venues', 'Clients', ''),
  'clients.save': c('venues', 'Add or update a client', 'id?, name, billing_email?, billing_address?, vat_number?', { link: () => 'clients' }),
  'bans.list': r('venues', 'Ejection log and customer bans', 'venue_id?, kind? (ejection = the ejection log, ban = bans, the default), status? (bans only)'),
  'bans.escalate': c('venues', 'Ban someone already in the ejection log', 'id (the ejection), permanent? or ends_on (YYYY-MM-DD), starts_on?, scope? (venue|client|all), category?, reason?'),
  'bans.confirm': c('venues', 'Confirm or reject a proposed customer ban', 'id, approve, reason?'),
  'bans.revoke': c('venues', 'Lift a customer ban', 'id, reason'),

  // Pay & invoices (reads; changes go through the pay cards)
  'pay.suggestPeriod': r('pay', 'Suggested pay period', ''),
  'pay.list': r('pay', 'Pay statements', 'officer_id?, status?, pay_run_id?'),
  'pay.get': r('pay', 'Pay statement', 'id'),
  'payRuns.list': r('pay', 'Pay runs', 'status?, limit?'),
  'payRuns.get': r('pay', 'Pay run details', 'id'),
  'invoices.list': r('invoices', 'Invoices', 'status?, venue_id?'),
  'invoices.get': r('invoices', 'Invoice details', 'id'),
  'reports.margin': r('reports', 'Margin report', 'from, to'),
  'reports.hours': r('reports', 'Hours report', 'from, to'),
  'reports.overdue': r('reports', 'Overdue invoices', ''),
  'reports.incidents': r('reports', 'Incident report', 'from, to, venue_id?'),
  'payAgreements.save': c('pay', 'Prepare a pay rise', 'officer_id, role, new_rate, effective_from, venue_id?, condition_goal_ids[]?', { link: (_r, b) => staff(b.officer_id) }),
  'payAgreements.send': c('pay', 'Send a pay rise for signature', 'id, signatory_id?'),

  // Documents, signatures & incidents
  'contracts.templates': r('documents', 'Contract and policy templates', ''),
  'contracts.list': r('documents', 'Contracts and policies sent', 'officer_id?, status?, category (contract|policy)?, q?'),
  'contracts.get': r('documents', 'Contract details', 'id'),
  'contracts.send': c('documents', 'Send a contract or policy for signature', 'template_id, officer_ids[] or all_active (policies), values?, signatory_id?', { link: () => 'people/contracts' }),
  'contracts.void': c('documents', 'Void an unsigned contract', 'id'),
  'esign.remind': a('documents', 'Send a signature reminder', 'type (contract|pay_agreement), id'),
  'contracts.packs': r('documents', 'Contract packs (kinds of agreement) and how much of their wording is reviewed', ''),
  'contracts.draft.list': r('documents', 'Contracts being drafted, not sent yet', 'officer_id?'),
  'contracts.engagement': r('documents', "How an officer is engaged: contract in force, start and end, renewals, agency weeks", 'officer_id'),
  'contracts.organisations': r('documents', 'Businesses contracts are made with (labour providers, subcontractors, agencies)', ''),
  'contracts.law': r('documents', 'Employment law items the contract library tracks, with dates', ''),
  'contracts.amend': c('documents', 'Start a variation, extension or replacement of a signed contract (opens a draft, sends nothing)', 'id (contract), kind (variation|extension|replacement)',
    { link: (res) => res?.draft?.id && `people/contracts/draft/${res.draft.id}` }),
  'contracts.draft.send': c('documents', 'Send a finished contract draft for signature', 'id (draft), signatory_id?', { link: () => 'people/contracts' }),
  'contracts.link.resend': c('documents', 'Email a fresh signing link for a contract signed by link', 'id (contract), email?'),
  'incidents.types': r('incidents', 'Incident types', ''),
  'incidents.list': r('incidents', 'Incidents', 'status?, severity?, type?, venue_id?, officer_id?, from?, to?, search?'),
  'incidents.get': r('incidents', 'Incident report', 'id'),
  'incidents.aiReview': a('incidents', 'Check an incident report for gaps (draft only)', 'id', { link: (_r, b) => `incidents/${b.id}` }),
  'incidents.review': c('incidents', 'Review an incident (approve or return)', 'id, decision (close|changes_requested|reopen), comment (needed for changes_requested), comment?', { link: (_r, b) => `incidents/${b.id}` }),

  // Academy, toolbox & feed
  'academy.courses': r('academy', 'Academy courses', ''),
  'academy.results': r('academy', 'Course results', ''),
  'academy.officer': r('academy', "Officer's training record", 'officer_id'),
  'academy.staffRecords': r('academy', 'Training records', ''),
  'academy.refreshersDue': r('academy', 'Refreshers due', 'days?'),
  'academy.assign': a('academy', 'Assign a course', 'course_id, target (officers|role|venue|all), ids[]?, due_date?', { link: () => 'team/training',
    undo: (_r, b) => b.target === 'officers' && b.ids?.length === 1 && { action: 'academy.unassign', body: { course_id: b.course_id, officer_id: b.ids[0] } } }),
  'academy.remindRefresher': a('academy', 'Remind about a refresher', 'source, id'),
  'toolbox.list': r('toolbox', 'Toolbox cards', 'drafts?'),
  'toolbox.get': r('toolbox', 'Toolbox card', 'id'),
  'toolbox.draft': a('toolbox', 'Draft a toolbox card (text only)', 'topic, category?, notes?'),
  'toolbox.save': e('toolbox', 'Save a toolbox card as a draft', 'auto', 'id?, category, title, summary, steps[], dont[], law?, report_tips?, escalate?', {
    confirmWhen: (b) => !!b.id, link: (res, b) => (res?.id || b.id) && `team/toolbox/${res?.id || b.id}`,
    undo: (res, b) => !b.id && res?.id && { action: 'toolbox.setStatus', body: { id: res.id, status: 'archived' } } }),
  'toolbox.setStatus': c('toolbox', 'Publish or archive a toolbox card', 'id, status (published|archived|draft)'),
  // Venue packs: instructions and procedures officers sign before working a venue
  'procedures.list': r('venue_packs', 'Site instructions and procedures (general and per venue)', 'scope (general|venue)?, venue_id?, status (draft|published|archived)?'),
  'procedures.get': r('venue_packs', 'One instructions or procedure document with versions and suggestions', 'id'),
  'venuePacks.overview': r('venue_packs', 'Every venue: site pack documents, drafts, booked officers who still need to sign', ''),
  'venuePacks.get': r('venue_packs', "A venue's site pack: documents in it and signing counts", 'venue_id'),
  'venuePacks.register': r('venue_packs', "A venue's signing register: who has signed, who still needs to", 'venue_id, filter (action|current|booked)?, q?'),
  'venuePacks.officer': r('venue_packs', "An officer's site pack signings and venues still to sign", 'officer_id'),
  'venuePacks.ai.draft': c('venue_packs', "Draft a venue's assignment instructions with AI (saved as a draft, nothing published)", 'venue_id, answers? {site_type, hours, duties, access, patrols, keys, emergency, contacts, reporting, welfare, risks, other}, document_ids?',
    { link: (_r, b) => `venues/${b.venue_id}?tab=pack` }),
  'everyday.feed': r('feed', 'Team feed posts', 'filter (all|announcements|shoutouts|events|polls|venues|saved)?, topic?, q? (search posts and comments)'),
  'everyday.events': r('feed', 'Upcoming team events with my RSVP', ''),
  'everyday.topics': r('feed', 'Featured and trending #topics', ''),
  'everyday.create': c('feed', 'Post to the team feed (a post, a shout-out to colleagues, or a poll)', 'kind (post|shoutout|poll)?, body, badge? (above|calm|team|customer|eyes|safety|welcome), to[]? user ids, options[]? (poll answers)', { link: () => 'everyday' }),
  'everyday.vote': c('feed', 'Vote in a team poll', 'post_id, option_ids[]', { link: (_r, b) => `everyday?post=${b.post_id}` }),
  'everyday.rsvp': c('feed', 'Answer a team event', 'post_id, answer (going|maybe|no)', { link: (_r, b) => `everyday?post=${b.post_id}` }),
  'messages.inbox': r('messages', 'My conversations', ''),
  'messages.people': r('messages', 'People I can message', ''),
  'email.search': r('email', 'Search my connected mailboxes (Gmail / Outlook)', 'q (words, a name or an address), account_id?'),
  'email.forRecord': r('email', 'Recent email with an officer, venue or client', 'type (officer|venue|client), id'),
  'email.summary': r('email', 'Summarise an email thread', 'account_id, id (thread)'),
  'email.send': c('email', 'Send an email from my connected mailbox', 'account_id, to[] (addresses), cc[]?, subject, text, reply? {thread_id, id, message_id, references, all}', { link: () => 'email' }),
  'messages.createGroup': c('messages', 'Start a group conversation', 'user_ids[], title', { link: (res) => res?.id && `messages/${res.id}` }),

  // Settings
  'settings.get': r('settings', 'Company settings', ''),
  'settings.update': c('settings', 'Change company settings', 'any of company_name, company_address, company_email, company_phone, vat_number, vat_rate, company_number, bank_name, bank_sort_code, bank_account, invoice_prefix, invoice_cycle, payment_terms_days, pay_period, grace_minutes, night_start, night_end, pay_night_uplift, pay_weekend_uplift, pay_bh_uplift, brand_color', { link: () => 'settings' }),
  'roles.list': r('settings', 'Job roles and licences', ''),
  'bankHolidays.list': r('settings', 'Bank holidays', ''),
  'audit.list': r('settings', 'Activity log', 'entity?, entity_id?, limit?'),
};

/** Prefixes Orb must never touch, whatever the catalogue says. */
export const BANNED = /^(auth\.|files\.|push\.|assistant\.|demo\.|sign\.link\.|contracts\.ai\.)|^users\.(resetLink|resendInvite|mergeOfficerLogin)$|^settings\.setLogo$|^clock\.(tagTap|nfcSetup|passkeyOptions)$|^device\.register|^officers\.faceConsent$|^esign\.mySignature|^venuePacks\.(sign|read|toggle|mine)$|^procedures\.(publish|archive|delete)$|\.(pdf|exportCsv|qrPoster)$/;
const PAY = /^(pay|payRuns|payAgreements|invoices)\.|^reports\.(margin|hours|overdue)$/;

/** Catalogue entries this person can use: the action's own roles, pay access, and the company-only money rule. */
export function catalogFor(user, actions) {
  return Object.entries(CATALOG).filter(([name]) => {
    const entry = actions[name];
    if (!entry || BANNED.test(name) || !entry.roles?.includes(user.role)) return false;
    if (PAY.test(name) && !canSeePay(user)) return false;
    return true;
  });
}

// Changes that reach people outside the app's managers: messages, posts, documents to sign, the published rota, invites
const OUTWARD = /^(email\.send|messages\.send|messages\.createGroup|everyday\.create|shifts\.publish|contracts\.send|contracts\.draft\.send|contracts\.upload\.send|contracts\.link\.resend|esign\.remind|officers\.inviteLogin|users\.invite)$/;

/** A Confirm card line a spoken "yes" cannot approve: money, or anything sent to people. Returns why, or null. */
export function needsTap(step) {
  const name = String(step?.action || '');
  const body = step?.body || {};
  if (PAY.test(name)) return 'pay or invoices';
  if (OUTWARD.test(name)) return 'something sent to people';
  if (name === 'onboarding.setStatus' && body.invite) return 'something sent to people';
  if (name === 'toolbox.setStatus' && body.status === 'published') return 'something sent to people';
  return null;
}

/** Tier after looking at the body: some auto actions need Confirm when they edit or publish. */
export const tierOf = (def, body) => (def.tier === 'auto' && def.confirmWhen?.(body || {}) ? 'confirm' : def.tier);

const SECRET = /password|token|secret|hash|png|base64|signature|_key$|pdf$/i;
/** Strips secrets and bulk from a result before the model sees it. */
export function sanitize(v, depth = 0) {
  if (v == null || typeof v === 'number' || typeof v === 'boolean') return v;
  if (typeof v === 'string') return v.length > 1500 ? `${v.slice(0, 1500)}…` : v;
  if (v instanceof Date) return v.toISOString();
  if (depth > 6) return '…';
  if (Array.isArray(v)) {
    const out = v.slice(0, 40).map((x) => sanitize(x, depth + 1));
    if (v.length > 40) out.push({ more: v.length - 40 });
    return out;
  }
  if (typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) if (!SECRET.test(k)) o[k] = sanitize(x, depth + 1);
    return o;
  }
  return undefined;
}

/** Ranked catalogue search over name, title, area and params. */
export function searchCatalog(entries, query = '', area = '') {
  const words = String(query).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  return entries
    .filter(([, d]) => !area || d.area === area)
    .map(([name, d]) => {
      const hay = `${name} ${d.title} ${d.area} ${d.params} ${d.words || ''}`.toLowerCase();
      const score = words.reduce((s, w) => s + (hay.includes(w) ? (d.title.toLowerCase().includes(w) ? 3 : 1) : 0), 0);
      return { name, d, score };
    })
    .filter((x) => !words.length || x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, 15)
    .map(({ name, d }) => ({ action: name, title: d.title, area: d.area, tier: d.tier === 'auto' && d.confirmWhen ? 'auto (drafts) / confirm (edits)' : d.tier, params: d.params.replace(/\s+/g, ' ') }));
}
