# Spec: Platform admin ("god mode") and an app Feedback mini-module

## Context
The app is still being tweaked and repaired. The owner wants **everyone** (company managers, security managers, venue users, officers) to be able to report problems and suggest improvements from inside the app, while it's temporary. Only the **platform admin** — the owner, **info@orbsolutions.co.uk** — may read the feedback; company managers must not see it. There is no platform-level role today (roles are company / security / venue / officer only), and nothing in the app collects feedback about the app itself (the existing "Feedback" is venues commenting on officers — different thing, different name kept apart).

## Decisions (recommended, taken as defaults)
- **Platform admin is not a fifth role; it's a power on top of a normal login.** The person signs in as usual (their account is a Company manager login with the email info@orbsolutions.co.uk) and additionally gets the Platform area. This keeps every existing screen working for them.
- **Who is platform admin is set by the platform, not in the app**: a list of emails in the API configuration (default `info@orbsolutions.co.uk`). No screen can grant it.
- **Locked down**: nobody else can give an account a platform-admin email (invite, edit user, or My details) — only the platform admin themself. Each Platform action checks the flag on the server, not just the menu.
- **Feedback goes only to the platform admin**: Platform inbox + an email to info@orbsolutions.co.uk for each new item. Not in the company Audit log contents (only "sent feedback" lines, no text).
- **Temporary by design**: a Platform switch "Feedback button on/off" hides every entry point at once when the app is settled; the inbox history stays.

## What everyone gets — "Send feedback"
- **Where**: a small **"Feedback"** chip with a speech-bubble icon in the top bar, next to the bell, on every screen (managers, venue users and officers, phone and desktop). Also a **Send feedback** row in My account (managers, venue users) and in Me (officers), under Help & user guide. It does not clash with the movable Orb button.
- **The sheet** (one screen, fast on a phone):
  1. Two big choices: **Something's wrong** / **I have an idea**.
  2. Text box: "What happened?" / "What would make it better?" (required, up to 2,000 characters).
  3. **Add screenshot or photo** (optional, up to 3, compressed like incident photos).
  4. Automatically attached and shown to the sender as a grey line: the screen they were on, their device/browser, app version, and their name and role.
  5. **Send** → "Thanks — it's gone to the Orb team." 
- **My feedback**: under the same row, the sender sees what they sent, its status (New, Looking at it, Planned, Fixed, Not now) and any reply. When the platform admin replies or marks it Fixed, the sender gets a notification (bell), tapping it opens the item.
- Officers whose login isn't linked to a profile can still send feedback.
- Limit: 20 items per person per day (stops accidental floods).

## What the platform admin gets — the "Platform" area
- A **Platform** entry in the side menu (only for the platform admin), with a small "Admin" badge. Opens **Platform → Feedback**:
  - **Top strip**: New (count), Problems / Ideas this week, Fixed this month.
  - **Filters**: Status (New first by default), Type (Problems / Ideas), Role (Company / Security / Venue / Officer), search text.
  - **List** (newest first): type icon (red for problems, gold for ideas), the first line of text, sender name + role, screen, time, photo count, status pill.
  - **Open an item** (side sheet): full text, photos (tap to enlarge, the existing photo viewer), screen as a link (open the same page), device and version, sender with their contact, history.
    - **Status** buttons: Looking at it · Planned · Fixed · Not now.
    - **Reply** box: the reply goes to the sender's bell and My feedback (optionally also by email).
    - **Private note** (only the admin sees it, e.g. "fixed in v106").
    - **Copy as task** — copies a tidy text block (type, text, screen, device, photos links) to paste into the board / a chat with the developer.
  - **Export CSV** of the filtered list.
- **Platform → Settings**: the "Feedback button on/off" switch, and "Email me each new item" on/off (default on).
- Room for more "god mode" later (e.g. viewing the app as another role, platform-wide switches) — **not in this release**.

## Data & permissions
- New table for app feedback: sender, their role, type, text, screen, device, app version, photos, status, reply and when, private note, created.
- Photos stored in their own private folder; only the sender and the platform admin can open them (short-lived links).
- Send / My feedback: every signed-in user. Inbox, status, reply, note, export, settings: platform admin only (server-checked).
- Company managers see none of the feedback text; the audit log records "sent feedback" / "replied to feedback" without content.

## Setup on live (needs the owner's OK, not done automatically)
- The platform admin needs a login with **info@orbsolutions.co.uk**. If none exists yet, a company manager invites that email as a Company manager in Settings → Users; the invite goes to that mailbox, and the owner sets the password. (I can't check the live users list, so I'll confirm with you before any live change.)

## Non-goals
- No chat/live support, no public roadmap, no voting, no AI triage in this release (can be added later: AI groups duplicates and suggests a priority).
- No change to the existing venue "Feedback" (venues commenting on officers).

## What's new
A card at the top of What's new: "Tell us what to fix" — everyone can send problems and ideas from the Feedback button.

## Verification
- API tests: anyone can send; only the platform email sees/updates; a company manager cannot set a platform email on an account; daily limit; reply notifies the sender; switch off hides the entry points.
- Mock: send as officer (phone) and as venue user with a photo; see it as platform admin, reply, mark Fixed, sender sees status and reply; company manager sees no Platform menu and gets 403 on the inbox.
- Build (ui-lint ≤ 67), `npm test`, deploy, read-only live check.
