# Spec: cancel today's dates, and requests shown the way they were made

## Context
After v212, two problems showed up on the venue side (seen with New Eidyn):
1. **Today's date can't be cancelled.** The 08:00–16:00 request for Mon 16 Nov is still waiting for a reply, but its start time has passed. The screen and the server both treat it as "already started" and lock it. A venue has to be able to cancel any of today's dates.
2. **The Requests list is one flat row per date.** A repeating request (Mon–Fri 08:00–16:00, or every night 18:30–23:30) shows as dozens of separate rows: the 08:00 request has 41 dates, 40 of them cancelled. The list should follow how the request was made: **one request = one card holding all of its dates.**

## Who it is for
- **Venue managers**, on Rota → Requests: the main user.
- **The office**, on Rota → Venue requests: the same card component, with the office's own actions (accept, decline, approve changes).

## 1. Cancelling today's dates (user's choice: "all today, rules by state")
- Any date **today** (London time) can be cancelled, **whether it has started or not**. Days before today stay locked.
- What happens depends on the date's state:
  - **Not staffed yet** (waiting for a reply, or accepted with nobody booked): cancelled straight away, and the office is told.
  - **Booked** (officers on it): this becomes a cancellation request that waits for the office to approve, like any change to a booked date. Once approved, the shift is cancelled and its officers are told, as cancelling works now.
- **Changing** a date (times, staff, type, moving it) stays as it is: only before the date starts. Once a date has started, the venue's only option on it is cancel.
- This applies everywhere a date can be cancelled:
  - the request card and its date rows;
  - the shift card on the venue rota;
  - the dashed request card on the rota;
  - bulk Select → Cancel;
  - the Cancel button in the request form.
- Bulk cancel follows the same rule, so a started date from today is no longer skipped as "already started".
- Server and screen use one shared rule, so the screen never offers an action the server refuses.

## 2. One card per request (venue Requests tab)
- **One card per request, as it was made:**
  - A one-off request is a card with one date.
  - A repeating request is one card with all of its dates.
  - A request later split with "This and later dates" stays **one card**, grouped by the original request. A changed pattern shows as "from Mon 23 Nov: …" inside it.
- **The card, collapsed, shows:**
  - the officer type, and the venue when the venue manager has several venues;
  - the pattern, e.g. "Mon–Fri · 08:00–16:00 · 1 staff", or the date and times for a one-off;
  - the budget it bills to, when there is one;
  - counts by state, e.g. "3 booked · 1 waiting · 1 change waiting";
  - the next date.
  - Overall status pill: Waiting for reply, Being staffed, Staffed, Declined or Cancelled. A mix shows the most urgent.
- **Expanded (tap the card):**
  - **Upcoming dates** are listed in order. Each row shows the day, times, staff count, its own status pill, and "Change waiting" where one is.
  - Tapping a date opens that date (today's Detail sheet: Change, Cancel, messages).
  - **Cancelled and past dates fold away** behind a line such as "40 cancelled · 3 past". Tapping it shows them greyed, read-only.
- **Actions on the card** (user picked all four):
  - **Change whole request.** Opens the full Request staff form on "This and later dates", starting from the next date that can still change. It changes the pattern, times, staff, type, notes or budget for every upcoming date. Booked dates go to the office for approval, as now.
  - **Cancel whole request.** Confirms first, then cancels every upcoming date, today's included per section 1. Dates not staffed are cancelled at once; booked ones go to the office for approval. The confirm says which is which, e.g. "2 cancel now, 3 need the office's approval".
  - **Select dates.** Ticks appear on this card's dates; bulk Cancel and Change act only on the ticked dates (the existing bulk bar and form). The page-wide "Select" across cards goes, because selecting happens inside a card.
  - **Message the office.** Opens this request's conversation. It shows only when the request has one.
- **Ordering:**
  - Upcoming tab: cards with something waiting come first (a change waiting, or a date waiting for a reply), then the others by next date.
  - Past tab: cards whose dates are all over, newest first, with the same fold for cancelled dates.
- **Rota grid:** unchanged. Dashed request cards stay one per date on their day, and tapping one opens that date.

## 3. Office side (default, user did not object)
- The office's Venue requests uses the same request card: one card per request, with dates inside and old dates folded.
- The office keeps its own actions:
  - accept or decline the whole request, or one date;
  - approve or decline a waiting change, including the new "cancel a booked date today" requests;
  - open the conversation.
- The office's current grouping by request and status is replaced by grouping by request.
- Waiting counts on the Rota tab row stay as they are, counted per date.

## Out of scope
- Cancelling dates before today.
- Changing a date's times after it has started; only cancel is allowed then.
- Timesheet and billing effects of a started booked shift that is cancelled. The office decides when it approves, as it does today for its own cancellations.
- The rota grid layout.

## Edge cases
- **A one-off date today that has started and has nobody booked:** cancelled at once.
- **A booked date today with an officer already clocked in:** the cancellation still goes to the office. The approval note says someone is on site.
- **A date with a change already waiting:** it can't be cancelled or changed again until the office answers, as now. The card shows "Change waiting".
- **A whole-request change or cancel where every upcoming date is locked:** the action is disabled, with the reason shown.
- **A venue manager with several venues:** cards show the venue name. The venue picker narrows the cards.

## Done when
- Venue (Waqas): today's 08:00–16:00 New Eidyn date can be cancelled, either from its card or from the shift card. It disappears from the rota, and the office is told.
- Venue: a booked shift for today, e.g. 18:30 New Eidyn, can be cancelled and shows "Change waiting" until the office approves.
- The Requests tab shows each request once, with:
  - the 41-date request as one card with 1 upcoming date and "40 cancelled" folded;
  - the nightly one as one card with 7 dates.
- Every card action works: Change whole, Cancel whole, Select inside, Message.
- The office (Matthew) sees the same cards and can approve a cancellation of today's booked date.
- Tests cover the "today" cancel rule on the server. The What's new card gets its own picture.
