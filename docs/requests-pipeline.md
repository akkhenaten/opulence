# Venue staff requests: from asked to staffed

One requested date (`cover_requests` row) is always in exactly one state, worked out the same way on the server and in the
app (`app/src/pages/manager/_coverState.js` → `requestState`). A waiting change wins over everything else.

| State | Means | Office sees it in | Venue sees it in | Office can |
|---|---|---|---|---|
| **waiting** | new date, or a change to a booked date, not yet answered | Venue requests → To decide · Needs you (`cover` / `coverChange`) · the bell · red-dot count on **Rota** | Request staff → Waiting | Accept (Broadcast / Ask Orb / I'll assign myself) · Decline with a reason · Approve or decline the change |
| **staffing** | accepted, fewer booked than asked for | Venue requests → Being staffed · Rota (open or short shift) · Needs you `unfilled` if within 7 days and no Orb card | Being staffed | Staff it in the rota · approve officers' shift requests (`shiftRequests`) · approve Orb's cover card |
| **staffed** | everyone booked (assigned + accepted ≥ headcount) | Venue requests → Staffed · Rota | Staffed | Change on the venue's behalf |
| **declined** / **cancelled** | closed | Declined / All | Declined / Cancelled | — |

## What each step does

| Step | Action | Who is told | Link |
|---|---|---|---|
| Venue asks | `cover.create` | company managers and the venue's security managers, never the person who asked (`notifyManagersAt`) | `<portal>/cover` |
| Venue changes a booked date | `cover.update` / `cover.updateMany` | the same managers | `<portal>/cover` |
| Office accepts one date or a pattern | `cover.accept {id, scope, notify}` | the venue; then by `notify`: **broadcast** opens the shift(s) and tells active officers (`announceOpen`), **orb** asks Orb to propose officers (`proposeCover(…, 'new')` → a card in Needs you), **none** sends the manager to the rota to assign | venue: Request staff; officers: Shifts → Open |
| Office accepts several dates | `cover.acceptMany {ids, notify}` | as above, one notice for all; dates that started are skipped with a reason | |
| Office declines | `cover.decline {id, reason, scope}` | the venue, with the reason | |
| Office approves / declines a change | `cover.decideChange {id, approve, reason}` | the venue; on approve the officers already booked | |
| Officer asks for an open shift | `shifts.request` | managers (`shiftRequests` in Needs you) | `<portal>/rota?tab=requests` |
| Manager books officers | `shifts.assign` / `shifts.decideRequest` / Orb card approved | officer; the venue gets "Staff confirmed" (or "Replacement confirmed" only when it replaces a no-show / can't-make-it) | |

Rules kept as they were: a date that has started can't be accepted (it can still be cancelled); approval, pay and sign-off
rules are unchanged. The manager's last accept choice is remembered on that device (Broadcast the first time).

## One to-do list

Every count — menu badges (desktop and the phone tab bar), Needs you on Today, the venue's Needs you and the bell — comes from
`todo.summary` (`functions/api/modules/todo.mjs`, kinds in `lib/todo.mjs`). Rows open in place via `todo.list` with the
same buttons everywhere (`app/src/pages/manager/_needs.jsx`). Any action that clears a to-do fires `orb:ops` / `orb:notify`
(`app/src/api.js` → `TODO_CHANGES`), so the badges, the bell and Needs you catch up at once. Every new notice also
sends a `notif` hint to the people it is for (`lib/notify.mjs` → `publishTo`), so other managers' screens refresh
without waiting for the 30-second poll.

No double counting: an unfilled shift with an Orb cover card is counted once (the card); open incidents leave out those
waiting on your signature; compliance rows leave out officers who already have an Orb card.
