// When someone comes off a shift, or a shift moves or goes, everything said about it follows:
// bell alerts, Orb cards, the officer's chat buttons and the shift chat.
import { q } from '../lib/db.mjs';
import { withdraw, officerUser } from '../lib/notify.mjs';
import { closeQuick, leaveThread } from '../lib/threads.mjs';
import { tidyCover } from './ops.mjs';
import { runCompliance } from './compliance.mjs';

/** Re-adding someone to a shift they were on before starts them afresh, so reminders and checks run again. */
export const FRESH = `reminded = false, late_alerted = false, chased_at = NULL, reply = NULL, reply_eta_min = NULL, reply_reason = '', replied_at = NULL,
  escalated_at = NULL, pack_chase1_at = NULL, pack_chase2_at = NULL, pack_escalated_at = NULL, pack_cover_at = NULL, pack_signing_at = NULL, pack_settled_at = NULL`;

const step = async (name, fn) => {
  try { await fn(); } catch (e) { console.warn(`[shift sync] ${name}:`, e.message); }
};

/**
 * removed: assignments taken off ({id, officer_id, shift_id}, plus venue_name and starts_at to clear older notices).
 * stale: assignments that stay, but whose earlier notices no longer hold (the shift moved).
 * shiftIds: shifts whose cover cards should be looked at again. officerIds: people whose compliance card should be checked again.
 * gone: the shifts were cancelled or deleted.
 * Never fails the change that called it.
 */
export async function afterShiftChange({ removed = [], stale = [], shiftIds = [], officerIds = [], gone = false } = {}) {
  const shifts = [...new Set([...shiftIds, ...removed.map((a) => a.shift_id)].filter(Boolean))];
  await step('bell', () => withdraw({ assignments: [...removed, ...stale], shifts: gone ? shifts : [] }));
  await step('buttons', async () => {
    for (const a of removed) {
      const [uid] = await officerUser(a.officer_id);
      if (!uid) continue;
      await closeQuick(uid, { ref: `chase:${a.id}`, used: 'stood_down' });
      await closeQuick(uid, { ref: `pack:${a.id}`, used: 'stood_down' });
    }
    if (gone && shifts.length) {
      const offers = await q("UPDATE cover_offers SET status = 'expired', responded_at = now() WHERE shift_id = ANY($1::uuid[]) AND status = 'offered' RETURNING id, officer_id", [shifts]);
      for (const o of offers) {
        const [uid] = await officerUser(o.officer_id);
        if (uid) await closeQuick(uid, { ref: `offer:${o.id}`, used: 'withdrawn' });
      }
    }
  });
  await step('shift chat', async () => {
    for (const a of removed) {
      const [uid] = await officerUser(a.officer_id);
      if (uid) await leaveThread('shift', a.shift_id, uid);
    }
  });
  await step('cover cards', () => tidyCover(shifts));
  const people = [...new Set([...removed.map((a) => a.officer_id), ...stale.map((a) => a.officer_id), ...officerIds].filter(Boolean))];
  if (people.length) await step('compliance', () => runCompliance({ officerIds: people }));
}
