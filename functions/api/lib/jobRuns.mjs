// Orb job runs: which Settings → Orb job each scheduled step belongs to, and a one-line summary of what it did.
// Pure, so the wording is tested without a database.

// Scheduled steps → the job key a manager switches on or off in Settings → Orb
export const JOB_OF = {
  packCheck: 'pack',
  escalate: 'chase',
  attendance: 'attendance',
  coverScan: 'cover',
  coverTidy: 'cover',
  offerExpiry: 'cover',
  feedback: 'feedback',
  reconcile: 'reconcile',
  compliance: 'compliance',
  docRead: 'compliance',
  grace: 'grace',
  venueSetup: 'venue_setup',
  evidenceScan: 'incident_ai',
};

// A weekly job that wasn't due (or already ran today) didn't run at all: nothing is recorded
const NOT_RUN = new Set(['off', 'not today', 'done']);

const n = (v) => (typeof v === 'number' ? v : parseInt(v, 10) || 0);
const pl = (k, word, many = `${word}s`) => `${k} ${k === 1 ? word : many}`;
const join = (bits) => bits.filter(Boolean).join(', ');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const SUMMARY = {
  chase: ({ escalate }) => n(escalate) ? `Escalated ${pl(n(escalate), 'late officer')} to the office` : '',
  attendance: ({ attendance }) => n(attendance) ? `Recorded ${pl(n(attendance), 'attendance event')}` : '',
  pack: ({ packCheck: r = {} }) => join([n(r.steps) && `sent ${pl(n(r.steps), 'site-pack reminder')}`, n(r.settled) && `${n(r.settled)} settled`]),
  cover: ({ coverScan, offerExpiry, coverTidy }) => join([
    n(coverScan) && `raised ${pl(n(coverScan), 'cover card')}`,
    n(offerExpiry) && `offered ${pl(n(offerExpiry), 'shift')} to the next officers`,
    n(coverTidy) && `closed ${pl(n(coverTidy), 'card')} sorted on the rota`,
  ]),
  feedback: ({ feedback }) => n(feedback) ? `Asked or reminded venues about ${pl(n(feedback), 'officer')}` : '',
  reconcile: ({ reconcile: r }) => r && typeof r === 'object' ? `Checked ${pl(n(r.checked), 'timesheet')}, ${pl(n(r.created), 'card')} raised` : '',
  compliance: ({ compliance: w, docRead: d }) => join([
    w && typeof w === 'object' && `checked ${pl(n(w.checked), 'officer')}, ${pl(n(w.created), 'card')} raised`,
    d && typeof d === 'object' && `checked ${pl(n(d.checked), 'officer')} after re-reading documents`,
    typeof d === 'number' && d > 0 && `read ${pl(d, 'document')}`,
  ]),
  grace: ({ grace: r = {} }) => join([
    n(r.documents) && `closed ${n(r.documents)} (documents in)`,
    n(r.expired) && `${n(r.expired)} ran out`,
    n(r.reminded) && `reminded ${pl(n(r.reminded), 'officer')}`,
  ]),
  venue_setup: ({ venueSetup: r = {} }) => n(r.created) || n(r.updated) || n(r.cleared)
    ? join([`checked ${pl(n(r.checked), 'venue')}`, n(r.created) && `${pl(n(r.created), 'card')} raised`, n(r.updated) && `${n(r.updated)} updated`, n(r.cleared) && `${n(r.cleared)} cleared`])
    : '',
  incident_ai: ({ evidenceScan: r }) => join([n(r) && `read evidence on ${pl(n(r), 'incident')}`, typeof r === 'string' && r.includes('cap') && 'AI cap reached']),
};

const IDLE = {
  chase: 'Nobody late to chase',
  attendance: 'No new attendance to record',
  pack: 'No unsigned site packs due',
  cover: 'No shifts short of cover',
  feedback: 'No feedback to ask for',
  reconcile: 'Nothing to check',
  compliance: 'No new documents to read',
  grace: 'No grace periods to update',
  venue_setup: 'Venues checked, nothing new',
  incident_ai: 'No new evidence to read',
};

/** Error text a manager can read: no stack, no "error:" prefix, one line. */
export const plainError = (e) => String(e?.message ?? e ?? 'Unknown error').replace(/^error:\s*/i, '').split('\n')[0].slice(0, 240) || 'Unknown error';

/**
 * One record per job from the results of its steps ({ stepName: result | Error }).
 * Returns null when the job didn't run (switched off, or a weekly job not due today).
 */
export function summariseRun(job, parts) {
  const failed = Object.entries(parts).filter(([, v]) => v instanceof Error || (typeof v === 'string' && /^error:/i.test(v)));
  if (failed.length) return { ok: false, idle: false, summary: '', error: plainError(failed[0][1]) };
  const vals = Object.values(parts);
  if (!vals.length || vals.every((v) => v == null || NOT_RUN.has(v))) return null;
  const did = (SUMMARY[job] || (() => ''))(parts);
  return { ok: true, idle: !did, summary: did ? cap(did) : IDLE[job] || 'Nothing to do', error: null };
}

/** Group step results by job. */
export function byJob(results) {
  const out = {};
  for (const [step, v] of Object.entries(results)) {
    const job = JOB_OF[step];
    if (!job) continue;
    (out[job] ||= {})[step] = v;
  }
  return out;
}

// The next London date a weekly job runs (dow 1 = Monday … 7 = Sunday), from today's London date
export function nextWeekday(today, dow, ranToday = false) {
  const d = new Date(`${today}T12:00:00Z`);
  const now = ((d.getUTCDay() + 6) % 7) + 1;
  let ahead = (dow - now + 7) % 7;
  if (ahead === 0 && ranToday) ahead = 7;
  d.setUTCDate(d.getUTCDate() + ahead);
  return d.toISOString().slice(0, 10);
}
