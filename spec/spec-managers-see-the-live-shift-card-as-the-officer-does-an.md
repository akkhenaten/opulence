# Spec: managers see the live shift card as the officer does, and send instructions

## Context — why it doesn't work today
Once an officer has clocked in, their Home becomes the live shift card: shift notes, venue instructions, Shift chat, site pack, report tiles, team, log, and ejections and bans. Managers can't really share in it:
- **There's no way in from Live.** The Live board shows who's on shift, but its only actions are Call, Review exception and Open site pack. The shift page is only reachable through Rota → "Shift page, log and ejections" or through Shift logs.
- **The manager's version of the page is a different page.** It's the same component, but the Shift chat button, site pack card, report tiles and toolbox are hidden for managers. So a manager never sees what the officer is looking at.
- **Nothing a manager writes reaches the officer.** Managers can already edit shift notes and add log entries. But there's no "instruction" type, no push notification, and no sign it was read. The officer only sees a change if they happen to look after the next 30-second refresh.

**Goal:** from Live, a manager or admin opens an officer's live shift card, sees exactly what the officer sees, works in it (log, chat, notes), and sends instructions that get the officer's attention and come back marked as read.

**Who:** Company manager, Security manager, and the platform admin (who has the full Company manager side). Officers receive. Venue users are not included.

## Decisions (from the user's answer, plus the recommended defaults for the open questions)
- What managers can do: "See it as officer does and interact with it and send instructions".
- Alert: a push notification, plus a highlighted "From your manager" card on the officer's shift card until they tap **Got it**.
- Who gets it: the whole team on that shift by default, or one chosen officer.
- Venue users: they don't see instructions (staff only).

## Requirements

### 1. Live → shift card
- Each on-shift row on the Live board gets an **Open shift card** action, which goes to `/<role>/shifts/<shift_id>`. `live.board` already returns `shift_id`.
- The shift page's Back returns to Live when you came from there.

### 2. See it as the officer does
- For managers, the shift page has a toggle: **Manager view | Officer's view**.
- **Officer's view** draws the officer's live card exactly as the officer sees it: header, notes and venue instructions, pinned instructions, quick actions, report tiles, site pack, team, log and toolbox. It's for looking only: the officer's own buttons (clock out, report, and so on) are shown but disabled. A banner reads "This is what <officer name> sees". With several officers, a picker chooses whose view.
- **Manager view** (the default) is today's page, plus:
  - the **Shift chat** button, which opens the same thread the officer uses (it already exists, from `shiftThread`);
  - the **Site pack** link;
  - the **Instructions** section (part 3).
- Managers keep what they can already do: edit shift notes, add or curate log entries, ejections and bans.

### 3. Instructions
- **Send.** In the Manager view, a **Send instruction** composer has a short text field (max 500 characters), with recipients set to **Whole team** (default) or one officer on the shift. It's available while the shift is live, and up to 2 hours before it starts.
- **Delivery.** Each recipient gets a push and in-app notification ("From your manager: …"), opening their shift card. It's never email.
- **Officer side.** The shift card pins a highlighted **From your manager** card at the top, with the text, the sender and the time, and a **Got it** button. Several unread instructions stack, newest first. After Got it, the instruction moves into the shift log, marked as an instruction.
- **Manager side.** Each instruction shows **Read by n of m**, with names and times. Unread ones stay highlighted.
- **Log.** Instructions are part of the shift log, so they appear in Shift logs and exports. Venue users never see them, on the page or in exports.
- **Notes change.** When a manager edits the shift notes after the shift has started, the officers on it get the same push ("Shift notes updated"), and the notes show "Updated hh:mm" on the card.

### 4. Permissions
- Sending, and read receipts: company manager, security manager and platform admin, on shifts they can manage, using the same access rule as the shift log today.
- Got it: only an officer on that shift, for an instruction sent to them.
- Officers can't send instructions.

## Not in scope
- Changing the officer's live actions on their behalf (clocking them in or out, filing their reports).
- Instructions to venue users, or from venue users.
- SMS or calls. Nothing dials.
- Instructions for shifts that haven't been published.

## Edge cases
- An officer who joins a shift after an instruction to the whole team was sent still sees it if it's unread, but isn't counted as a missed reader.
- An officer who has no push device still gets the in-app notification and the pinned card.
- Once a shift has ended, instructions stay in the log as read-only. Got it is no longer needed.
- A manager who opens Officer's view while no officer has clocked in sees the card as it will look, labelled "Not started yet".

## Done means
- From Live, one tap opens the officer's shift card. Officer's view matches the officer's own screen.
- An instruction sent to the team reaches every officer on the shift as a push, and as a pinned card until Got it. The manager sees Read by n of m update without reloading (on the 30-second refresh).
- Venue users see no instructions anywhere.
- A What's new card is added. API tests cover send, ack, permissions and venue hiding. All tests pass, ui-lint stays at or below 67, and it ships as v113.
