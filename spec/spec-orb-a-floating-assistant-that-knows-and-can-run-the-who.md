# Spec: Orb — a floating assistant that knows and can run the whole app

## Problem
Managers already have "Ask Orb", but it is hidden behind a small sparkle button in the top bar. It only covers rota, cover, attendance, messages, pay and invoices. It can't explain how the app works, and can't help with officers' records, onboarding, documents, incidents, contracts, the academy, the toolbox, the feed or settings. The company admin and the security manager want one assistant, called **Orb**, that is always within reach, knows the whole app, and does the work for them, not just points them to it.

## Who it is for
- **Company admin:** everything they can do in the app.
- **Security / ops manager:** only what *their* login can do. That means only their venues, pay only when "can see pay" is switched on, and never company-only actions.
- **Not** venue managers or officers. The academy tutor and the toolbox helper stay as they are for those roles.

Orb never gets more power than the person using it. Every look-up and every change runs as that person, through the same permission checks as the screens.

## What the user sees

### Floating button
- **Look and position:** a round button with the **Orb mark**, the same everywhere regardless of the uploaded company logo. It sits bottom-right on every manager screen.
- **Phones:** it sits above the bottom navigation and never covers a Save button, a sheet's actions or a chat composer. It hides while a sheet or modal is open.
- **Status:** a small dot shows when Orb has finished something in the background or has a card waiting for Confirm.
- **Opening:** tapping it opens the Orb panel. That's full screen on a phone and a right-hand panel on desktop, as Ask Orb is today. The top-bar sparkle button is removed, and the old "Chat has moved" tab now opens the panel.
- **Styles:** it works in both styles (Classic and Control Room), and in light and dark mode.

### The panel
- The header shows the Orb mark, "Orb", a new-chat button, chat history and close.
- **Page context:** Orb knows which page and record the manager is looking at. For example, on Marcus's profile, "chase his SIA renewal" needs no name.
- **Suggestion chips** change with the page. For example: on the rota, "Find cover for open shifts this weekend"; on an officer, "What's missing from onboarding?"; on pay, "Is this week ready to issue?".
- **Answers** are short, in British English, with links that open the right screen ("Open Marcus's profile →").
- **Lists** of people, shifts and documents appear as compact tappable rows, not walls of text.
- **Records it changed** show as "Done" chips that open the record.
- **History:** chats are kept per user and can be renamed and deleted, as today.

## What Orb knows
- **How the app works:** every feature, where it is and how to use it, drawn from the built-in user guide (`help.guide`), so the answers stay in step with the app. "How do I send a policy to everyone?" gets steps plus an offer to do it.
- **Live company data**, within the user's permissions:
  - officers
  - compliance and expiries
  - rota, cover and attendance
  - timesheets
  - pay, invoices and disputes
  - incidents and bans
  - contracts, policies and pay rises, including who hasn't signed
  - academy progress
  - the toolbox
  - messages and the feed
  - venues, clients and rates
  - settings
  - the activity log
- **Limits:** it never makes data up. If it can't find something it says so. If it can't do something it explains why, for example "only the company admin can issue invoices" or "you don't have pay access".

## What Orb can do (all areas)
The manager asks in plain language, and Orb does the job end to end, chaining several steps when needed. For example: "Cover Saturday night at the Lantern" means find open shifts, rank available and compliant officers, offer the shift and message them.

| Area | Examples |
|---|---|
| People & onboarding | add or edit an officer, invite a login, tick onboarding tasks, record documents and chase expiries, approve time off, HR notes, 1:1s and goals |
| Rota & operations | create, copy and publish shifts; assign or unassign; find cover; approve or dispute timesheets; fix clock-in exceptions; venues, clients and rates |
| Pay & invoices | the existing pay-run flow, invoices, disputes, marking paid (company only, as today) |
| Documents & incidents | send contracts and policies for signature, send reminders, offer pay rises, review incidents, propose or confirm bans |
| Academy, toolbox & feed | assign courses and refreshers, draft toolbox cards, write feed posts and messages |
| Settings | company details and notification preferences (company admin only) |

### When Orb acts on its own, and when it asks
Small, low-risk actions run straight away and are reported as "Done", with an **Undo** where the app supports it:
- looking anything up
- drafting text (messages, posts, toolbox cards, incident reviews) without sending it
- adding an HR note, tick-list item or 1:1 note
- sending a signature or refresher reminder
- assigning a course
- saving a draft (unpublished) shift.

Everything else shows a **Confirm card** first, saying exactly what will happen ("Publish 6 shifts for 7–13 Nov and notify 5 officers"). The manager taps Confirm or Cancel. This applies to:
- money (pay runs, invoices, paid, rates)
- anything sent outside the manager's own screen (publishing shifts, messages and posts, sending documents for signature, invites, emails)
- deleting, voiding or cancelling
- anything about bans, offboarding or HR outcomes
- settings and roles.

Other rules:
- **Several changes at once** come as one card with a checklist, so the manager can untick any line.
- **The card runs as written.** If something changed since it was shown, for example a shift already filled, Orb says so instead of guessing.
- **Every action Orb takes** is recorded in the activity log as done "via Orb" by that manager.

## Limits and costs
- Orb uses the company's existing AI budget and monthly cap, as its own module ("Orb") under the existing AI usage limits.
- When the budget runs out, Orb says so plainly and the rest of the app keeps working.
- Each reply has a sensible limit on steps. A long job says what it did and what's left, rather than running indefinitely.
- Orb never shows other people's private data beyond what the manager could already open, never reveals passwords or secret settings, and refuses instructions hidden inside documents, messages or feed posts it reads.

## Non-goals (for now)
- Voice input. Typing only.
- Orb for venue managers or officers.
- Orb acting while nobody is using it (scheduled jobs). The existing ops automation stays separate.
- Orb in email or the phone app.

## Done when
- A floating Orb button shows on every company-admin and security-manager screen, on a phone and on desktop, in both styles, without covering anything, and the old sparkle button is gone.
- Orb correctly answers how-to questions about each area of the app.
- Orb finds and summarises live data in each area, and the security manager only sees their venues and their permitted data.
- Small actions run immediately with "Done" chips. Bigger ones need Confirm, and a security manager can't get Orb to do a company-only action.
- Example jobs work end to end: cover a weekend shift, chase everyone with documents expiring this month, send the new policy to all active officers, and prepare and issue the weekly pay run (admin).
- Every Orb action appears in the activity log as "via Orb".
