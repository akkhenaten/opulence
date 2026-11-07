import { q, one } from './db.mjs';
import { fail } from './http.mjs';

// Venue ids a user may see. null = all venues (company).
export async function venueScope(user) {
  if (user.role === 'company') return null;
  if (user.role === 'security') return (await q('SELECT venue_id FROM security_venues WHERE user_id = $1 ORDER BY venue_id', [user.id])).map((r) => r.venue_id);
  if (user.role === 'venue') return (await q('SELECT venue_id FROM venue_contacts WHERE user_id = $1 ORDER BY venue_id', [user.id])).map((r) => r.venue_id);
  return [];
}

export async function assertVenue(user, venueId) {
  const scope = await venueScope(user);
  if (scope && !scope.includes(venueId)) fail(403, 'No access to this venue');
}

// The user's scope, or just one of their venues when they have picked it (checked)
export async function narrowScope(user, venueId) {
  if (!venueId) return venueScope(user);
  await assertVenue(user, venueId);
  return [venueId];
}

// SQL fragment limiting a venue_id column to the user's scope.
// Returns [sqlFragment, params] where fragment uses $n placeholders starting at `n`.
export async function venueFilter(user, column, n) {
  const scope = await venueScope(user);
  if (scope === null) return ['TRUE', []];
  return [`${column} = ANY($${n}::uuid[])`, [scope]];
}

// Officers a security manager may see: anyone who has worked/is rostered at their venues, plus all active officers for staffing.
export async function assertOfficerAccess(user, officerId) {
  if (user.role === 'company') return;
  if (user.role === 'officer' && user.officer_id === officerId) return;
  if (user.role === 'security') {
    const venues = await venueScope(user);
    const ok = await one(
      `SELECT 1 FROM officers o WHERE o.id = $1 AND (o.status = 'active' OR EXISTS (
         SELECT 1 FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id WHERE a.officer_id = o.id AND s.venue_id = ANY($2::uuid[])))`, [officerId, venues]);
    if (ok) return;
  }
  fail(403, 'No access to this officer');
}
