// Incident report drafts: what a draft may hold, how far along it is, and when its writer is reminded
import { londonParts } from './time.mjs';

const TEXT = ['type', 'severity', 'occurred_at', 'location', 'description', 'people_involved', 'injuries', 'actions_taken',
  'force_justification', 'police_ref', 'ambulance_ref', 'notes', 'when', 'shift_id'];
const FLAGS = ['force_used', 'police_called', 'ambulance_called', 'ai_assisted'];
const LONG = new Set(['description', 'notes']);
const str = (s, n) => String(s ?? '').slice(0, n);
const id = (s) => (/^[0-9a-f-]{36}$/i.test(String(s || '')) ? String(s) : '');

export const DRAFT_DAYS = 30;
const H = 3600000;
const DAY = 24 * H;

/** Only the form's own fields, trimmed to size */
export function cleanDraft(d) {
  const src = d && typeof d === 'object' ? d : {};
  const out = {};
  for (const k of TEXT) if (src[k] != null) out[k] = str(src[k], LONG.has(k) ? 20000 : 4000);
  for (const k of FLAGS) if (src[k] != null) out[k] = !!src[k];
  if (Array.isArray(src.witnesses)) {
    out.witnesses = src.witnesses.slice(0, 20).filter((w) => w && typeof w === 'object')
      .map((w) => ({ name: str(w.name, 200), contact: str(w.contact, 200), statement: str(w.statement, 4000) }));
  }
  if (src.manager && typeof src.manager === 'object') {
    out.manager = { venue_id: id(src.manager.venue_id), shift_id: id(src.manager.shift_id), officer_id: id(src.manager.officer_id) };
  }
  if (out.shift_id) out.shift_id = id(out.shift_id);
  return out;
}

/** The five writing steps and what is still missing, as the form checks them */
export function draftProgress(d = {}) {
  const has = (k) => String(d[k] ?? '').trim().length > 0;
  const steps = [
    ['What happened and how serious', has('type') && has('severity')],
    ['A description', has('description')],
    ['When and where', has('occurred_at') && has('location')],
    ['People involved', has('people_involved') || (d.witnesses || []).some((w) => w.name?.trim())],
    ['Why force was necessary', !d.force_used || has('force_justification')],
  ];
  return { done: steps.filter((s) => s[1]).length, total: steps.length, missing: steps.filter((s) => !s[1]).map((s) => s[0]) };
}

/**
 * Which reminder a draft is due, if any: an hour after the shift ends (or after it was started, with no shift),
 * then between 10:00 and 12:00 London once it is at least 6 hours old; a warning 3 days before it expires after 30 idle days.
 */
export function reminderDue(dr, shiftEndsAt, now = new Date()) {
  const t = new Date(now).getTime();
  const idle = t - new Date(dr.updated_at).getTime();
  if (idle >= DRAFT_DAYS * DAY) return 'expire';
  if (!dr.warned_expiry && idle >= (DRAFT_DAYS - 3) * DAY) return 'expiry_warn';
  const end = new Date(shiftEndsAt || dr.created_at).getTime();
  if (!dr.reminded_after_shift && t >= end + H) return 'after_shift';
  const age = t - new Date(dr.created_at).getTime();
  const h = londonParts(now).hour;
  if (!dr.reminded_morning && dr.reminded_after_shift && age >= 6 * H && h >= 10 && h < 12) return 'morning';
  return null;
}
