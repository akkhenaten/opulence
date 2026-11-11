// Incident report signing: who signs next, the report's fingerprint, and when the venue is reminded
import crypto from 'node:crypto';
import { londonParts } from './time.mjs';

const H = 3600000;
const DAY = 24 * H;
const MGR = ['company', 'security'];

export const STAGE_LABEL = { officer: 'Waiting for the officer', manager: 'Waiting for the manager', venue: 'Waiting for the venue', complete: 'Complete' };

const bad = (message) => Object.assign(new Error(message), { status: 400 });

/** Who acts at each stage, as the role names the API uses */
export const signerRole = (role) => (role === 'officer' ? 'officer' : role === 'venue' ? 'venue' : MGR.includes(role) ? 'manager' : null);

/**
 * The next stage and status after `action` by a user with `role`.
 * Throws a 400 with a plain message when the action does not fit the report's stage.
 */
export function nextStage(inc, action, role) {
  const who = signerRole(role);
  const stage = inc.sign_stage;
  if (!stage) throw bad('This report was filed before signing began. Review it the usual way.');
  if (stage === 'complete') throw bad('This report is complete and signed by everyone');
  if (action === 'sign') {
    if (stage === 'officer' && who === 'officer') return { sign_stage: 'manager', status: 'submitted' };
    if (stage === 'manager' && who === 'manager') return { sign_stage: 'venue', status: 'closed' };
    if (stage === 'venue' && who === 'venue') return { sign_stage: 'complete', status: 'closed' };
    throw bad(stage === 'officer' ? 'Waiting for the officer to sign' : stage === 'manager' ? 'Waiting for a manager to sign' : 'Waiting for the venue to sign');
  }
  // A manager can also keep editing while the report is back with the officer to sign again
  if (action === 'edit' && who === 'manager' && stage === 'officer') return { sign_stage: 'officer', status: inc.status, resign_reason: 'edited' };
  if (who !== 'manager' || stage !== 'manager') throw bad('Only a manager can do this before they sign');
  if (action === 'send_back') return { sign_stage: 'officer', status: 'changes_requested', resign_reason: 'sent_back' };
  if (action === 'edit') return { sign_stage: 'officer', status: 'submitted', resign_reason: 'edited' };
  throw bad('Unknown action');
}

const sha = (x) => crypto.createHash('sha256').update(x).digest('hex');
const TEXT = ['title', 'type', 'severity', 'location', 'description', 'people_involved', 'injuries', 'actions_taken', 'force_justification',
  'police_ref', 'ambulance_ref', 'manager_statement', 'venue_comment'];
const FLAGS = ['force_used', 'police_called', 'ambulance_called'];

/** The fingerprint printed on the certificate: the report's wording, its photos and every live signature. */
export function fingerprintOf(inc, signatures = []) {
  return sha(JSON.stringify({
    reference: inc.reference || inc.ref,
    occurred_at: inc.occurred_at ? new Date(inc.occurred_at).toISOString() : null,
    text: Object.fromEntries(TEXT.map((k) => [k, String(inc[k] ?? '')])),
    flags: Object.fromEntries(FLAGS.map((k) => [k, !!inc[k]])),
    witnesses: (inc.witnesses || []).map((w) => [w.name, w.statement || '']),
    files: (inc.attachments || []).map((a) => [a.s3_key, a.caption || '']),
    signers: signatures.filter((s) => !s.void_at).map((s) => ({ role: s.role, name: s.name, at: new Date(s.at).toISOString(), png: sha(s.png || '') })),
  }));
}

/**
 * A venue reminder is due from 09:00 London the morning after it reached the venue, then every 2 days.
 * `stage_at` is when the manager signed; `venue_reminded_at` the last reminder.
 */
export function venueReminderDue(inc, now = new Date()) {
  if (inc.sign_stage !== 'venue' || !inc.stage_at) return false;
  const t = new Date(now).getTime();
  if (londonParts(now).hour < 9) return false;
  if (inc.venue_reminded_at) return t - new Date(inc.venue_reminded_at).getTime() >= 2 * DAY - H;
  return londonParts(now).date > londonParts(inc.stage_at).date;
}

/** Managers get one nudge when a report has waited a day for them */
export const managerReminderDue = (inc, now = new Date()) =>
  inc.sign_stage === 'manager' && !inc.manager_reminded && !!inc.stage_at && new Date(now) - new Date(inc.stage_at) >= DAY;
