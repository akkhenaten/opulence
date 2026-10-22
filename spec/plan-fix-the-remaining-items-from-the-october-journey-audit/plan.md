# Plan: fix the remaining items from the October journey audit

## Context
The audit (`docs/journey-audit-2026-10.md`) listed recommended items that weren't fixed in v47. The user asked for four of them:
- the order of the venue dashboard;
- checking for an expired password reset link;
- the wording on two empty screens;
- two-column layouts that could get wider than a phone screen.

The email domain and desktop install items are out of scope.

Two of the items are already partly in place, found while reading the code:
- **Shift logs:** the empty screen already says "When the shift lead signs off a shift, the log and the handover appear here." (`pages/shift/ShiftLogs.jsx:12`). No code change is needed; the audit entry was wrong and gets corrected.
- **Officer Pay:** the empty screen already explains roughly when statements appear (`pages/officer/Pay.jsx:47`). It only needs a clearer sentence that matches how pay runs really work.

## 1. Venue dashboard: "On site now" first
`app/src/pages/money/VenueDashboard.jsx`:
- Move `<FeedbackTile multi={multi} />` from above the `<Bento>` (line 47) to just after `</Bento>` (line 84). On a phone the first thing a venue manager sees is then who is on site, followed by the stats, then the request to rate officers.
- `pages/venue/_feedback.jsx`, `FeedbackTile`: add an optional `className` prop. The default stays `mb-4`, and the venue dashboard passes `mt-4` so the spacing is right in its new place.
- The "Rate staff" button in the page header stays, so rating is still one tap away.

## 2. Expired password reset link: say so straight away
**Server, `functions/api/modules/auth.mjs`:**
- Add a public `auth.resetInfo` action, next to `auth.inviteInfo`:
  ```js
  'auth.resetInfo': pub(async (b) => {
    const u = await one("SELECT 1 FROM users WHERE reset_token = $1 AND reset_expires > now() AND status = 'active'", [b.token || '-']);
    if (!u) fail(404, 'This reset link has expired');
    return { ok: true };
  }),
  ```
- It returns no name or email, so a guessed link reveals nothing.

**App, `app/src/pages/auth/AuthPages.jsx`, `Reset`:**
- Use the same pattern as `AcceptInvite` (lines 85–90): `useState(undefined)`, then call `api('auth.resetInfo')` on load.
  - While checking, show `<Spinner className="min-h-dvh" />`.
  - If the link is invalid, show `<AuthCard title="Link expired" subtitle="Password reset links work for 2 hours and only once. Request a new one below.">`, with a primary `Button to="/forgot"` labelled "Send a new link" and a "Go to sign in" footer link.
  - If the link is valid, show the form as it is today.
- The existing error on submit stays as a fallback, for a link that expires while the page is open.

## 3. Officer Pay empty screen
`pages/officer/Pay.jsx:47`: change the text to "Your statement appears here when the company runs pay. You'll be asked to check it before it's issued." This matches the pay run steps: Send for review → officer approves → Issue.

## 4. Two-column layouts that could spill on phones
- **Pattern:** a `grid ... lg:grid-cols-N` with no base column count gets an implicit `auto` track. That track grows to fit its widest content, so a long unbroken word, email or reference pushes the page wider than the screen.
- **Fix:** add `grid-cols-1` (Tailwind's `repeat(1, minmax(0, 1fr))`). This keeps the column at the screen width on phones and changes nothing on desktop. It's the same fix used on Workforce rules.
- **Places:** 18 grids found with `grep -rnE 'className="grid [^"]*lg:grid-cols-[0-9]' pages layouts | grep -v grid-cols-1`. Examples:
  - `manager/OpsAI.jsx:51,365`, `manager/Exceptions.jsx:38`, `shared/Live.jsx:63`;
  - `people/Settings.jsx:121,226`, `people/Compliance.jsx:84`, `people/_profileTabs.jsx:32,656,935`;
  - `venue/Site.jsx:31`, `team/CardEditor.jsx:77`, `money/Reports.jsx:107,126`;
  - `money/VenueDashboard.jsx:86`, `money/VenueDetail.jsx:211,386`, and the rest of the grep results.
- Make the change with a small sed over exactly those matches, then re-run the grep to confirm it returns nothing.

## 5. Docs, deploy
- `docs/journey-audit-2026-10.md`: move the four items to "Fixed in this release". Change the shift logs entry to "already explained, no change needed".
- Run the build and `node app/scripts/ui-lint.mjs --report`, which must stay at 0.
- Deploy in this order:
  1. `openkbs fn deploy api` from the project root;
  2. commit, ending the message with the Co-Authored-By line;
  3. `openkbs site deploy`.
- Add a short plain-language comment on board card bWjmNf8O.

## Verification
Use the local preview (`npx vite preview --port 4173`) and agent-browser at 390 and 1440:
- **Venue dashboard:** signed in as venue, "On site now" is the first tile and the ratings tile sits below the stats.
- **Reset link:**
  - `/reset/not-a-real-token` shows "Link expired" with "Send a new link", which goes to /forgot;
  - a real token, from the copy link in Settings → Users & access on a demo user, still shows the form;
  - `/tmp/orb/call.mjs` → `auth.resetInfo` returns 404 for a bad token;
  - clear any test reset token afterwards, setting `reset_token` and `reset_expires` back to NULL for that user.
- **Officer Pay:** check the text, using an officer with no statements if there is one, or just the code review.
- **Layouts:** the audit run script (`/tmp/audit/run.sh`) on the affected pages at 390 shows no overflow. As a spot check, inject a long unbroken string into one Live or Ops AI card and confirm the page doesn't scroll sideways.
- Finish with `agent-browser close --all`, then stop the preview by its PID.
