import { one } from './db.mjs';
import { fail } from './http.mjs';

export const SELF_MSG = 'Another manager needs to approve your own hours';

// Pure decision: own work is blocked when someone else could approve it, allowed (and flagged) when nobody else can
export function decideSelf({ isOwn, otherApprovers }) {
  if (!isOwn) return { self: false, selfApproved: false };
  if (otherApprovers) return { self: true, blocked: true };
  return { self: true, selfApproved: true };
}

// Is there another active manager who could approve this? Pay is company-only; hours can also go to a security manager on that venue.
export async function otherApprover(user, { venueId = null, companyOnly = false } = {}) {
  const r = await one(
    `SELECT 1 FROM users u
      WHERE u.id <> $1 AND u.status = 'active' AND NOT u.system
        AND (u.role = 'company'
             OR (NOT $3 AND u.role = 'security' AND $2::uuid IS NOT NULL
                 AND EXISTS (SELECT 1 FROM security_venues sv WHERE sv.user_id = u.id AND sv.venue_id = $2)))
        AND NOT EXISTS (SELECT 1 FROM officers o WHERE o.user_id = u.id AND o.id = $4)
      LIMIT 1`, [user.id, venueId, !!companyOnly, user.self_officer_id]);
  return !!r;
}

/** Guard an approval on a staff record. Throws 403 when it is the caller's own record and someone else could approve it. */
export async function guardSelf(user, officerId, opts = {}) {
  const isOwn = !!user.self_officer_id && officerId === user.self_officer_id;
  const d = decideSelf({ isOwn, otherApprovers: isOwn ? await otherApprover(user, opts) : false });
  if (d.blocked) fail(403, opts.message || SELF_MSG, { self: true });
  return d;
}

/** Mark the caller's own rows: is_self, and self_locked when another manager has to approve them (the UI greys them out). */
export async function markOwn(user, rows, { companyOnly = false } = {}) {
  if (!user.self_officer_id) return rows.map((r) => ({ ...r, is_self: false, self_locked: false }));
  const cache = new Map();
  const locked = async (venueId) => {
    const k = companyOnly ? '' : venueId || '';
    if (!cache.has(k)) cache.set(k, await otherApprover(user, { venueId: venueId || null, companyOnly }));
    return cache.get(k);
  };
  const out = [];
  for (const r of rows) {
    const self = r.officer_id === user.self_officer_id;
    out.push({ ...r, is_self: self, self_locked: self ? await locked(r.venue_id) : false });
  }
  return out;
}
