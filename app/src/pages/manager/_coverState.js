// One state per requested date, so each date sits in exactly one tab and reads the same everywhere (the office's
// Venue requests, the venue's Requests, the rota and Needs you). Pure, so the API tests can import it.
//   waiting   new, or a change to it waits for the office (a pending change wins)
//   staffing  accepted, not yet fully staffed
//   staffed   everyone booked
//   declined / cancelled
export function requestState(c) {
  if (c.status === 'pending' || c.change_status === 'pending') return 'waiting';
  if (c.status === 'accepted') return Number(c.filled) >= Number(c.headcount) ? 'staffed' : 'staffing';
  return c.status === 'cancelled' ? 'cancelled' : 'declined';
}

export const STATE_LABEL = { waiting: 'Waiting for the office', staffing: 'Being staffed', staffed: 'Staffed', declined: 'Declined', cancelled: 'Cancelled' };

// What happens once a date is accepted: officers are told it is open, Orb proposes who should work, or the manager staffs it
export const ACCEPT_CHOICES = [
  { key: 'broadcast', label: 'Broadcast to officers', hint: 'Open the shift and tell every active officer; they request it in the app' },
  { key: 'orb', label: 'Ask Orb to propose', hint: 'Orb picks the best free officers and prepares a card for you to approve' },
  { key: 'none', label: "I'll assign myself", hint: 'Open the shift in the rota to pick the team' },
];
const PREF = 'orb.coverNotify';
/** The manager's last choice on this device; Broadcast the first time. */
export const lastAcceptChoice = () => {
  try { const v = globalThis.localStorage?.getItem(PREF); return ACCEPT_CHOICES.some((c) => c.key === v) ? v : 'broadcast'; } catch { return 'broadcast'; }
};
export const rememberAcceptChoice = (v) => { try { globalThis.localStorage?.setItem(PREF, v); } catch { /* private mode */ } };
