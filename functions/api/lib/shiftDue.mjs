import { one } from './db.mjs';

// A manager who also works shifts is "on the officer side" from 30 minutes before a shift starts
// until they clock out (or 2 hours after it ends). Optionally only at one venue.
export async function ownShiftDue(officerId, venueId = null) {
  if (!officerId) return false;
  const due = await one(
    `SELECT 1 FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
      WHERE a.officer_id = $1 AND a.status IN ('assigned','accepted') AND s.status = 'published'
        AND ($2::uuid IS NULL OR s.venue_id = $2)
        AND (
          (s.starts_at BETWEEN now() - interval '30 minutes' AND now() + interval '2 hours')
          OR EXISTS (SELECT 1 FROM clock_events ce WHERE ce.assignment_id = a.id AND ce.kind = 'in' AND ce.status <> 'rejected'
                      AND NOT EXISTS (SELECT 1 FROM clock_events co WHERE co.assignment_id = a.id AND co.kind = 'out' AND co.status <> 'rejected'))
        )
        AND s.ends_at > now() - interval '2 hours'
      LIMIT 1`, [officerId, venueId]);
  return !!due;
}

// What an NFC tap means for this person: clock in, or (for a manager) check the tag works.
// A manager who is due on shift at this venue clocks in, whichever side the app is on.
export const tapSide = ({ manager, dual, due }) => (!manager || (dual && due) ? 'officer' : 'check');
