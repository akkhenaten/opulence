# Plan: a rainbow glow on the app Feedback button, so it isn't confused with the venue Feedback module

## Context
The top-bar **Feedback** button, for sending problems and ideas to the platform admin, shares its name with the existing **Feedback** module in the side menu, where venues comment on officers. The owner wants the button to glow in shifting colours so it stands out as something different.

## Change
**app/src/styles.css**: a new `.fb-glow` wrapper, written next to the `.silver-mark` styles.
- `@property --fb-a { syntax: '<angle>'; inherits: false; initial-value: 0deg; }`
- `.fb-glow` is a `relative inline-flex rounded-full p-[2px]` ring. Its background is a `conic-gradient(from var(--fb-a), …)` running red → amber → gold → green → cyan → blue → violet → pink → red, and `animation: fb-spin 4s linear infinite` turns the ring.
- `.fb-glow::before` is the same gradient, `filter: blur(8px)`, `opacity: .55`, and sits behind the ring at `z-index: -1` with `inset: -2px`. That gives a soft coloured halo that keeps changing colour.
- The button inside keeps its own background, so the text stays readable on light and dark themes.
- `@keyframes fb-spin { to { --fb-a: 360deg; } }`. Animating one angle is cheap, with no layout work.
- In the reduced-motion block, add `.fb-glow, .fb-glow::before` to the `animation: none` list. The rainbow ring stays, still.
- Browsers without `@property` (older Safari) show a still rainbow ring, which is still distinct.

**app/src/ui/AppFeedback.jsx**
- `FeedbackChip`: wrap the Button in `<span className="fb-glow">`, keeping the `hidden sm:block` outer span.
- Rename the label to **"App feedback"**, so the name differs too.
- `FeedbackIcon` (phones): wrap the IconButton the same way. Its aria-label stays "Send feedback".
- The My account and Me rows stay as they are. They already sit with Help, away from the module.

**app/src/pages/people/_whatsnew.jsx**: update today's "Tell us what to fix" card text to say the **App feedback** button glows in colour, next to the bell. This is the same release day, so it doesn't need a new card.

**Help (functions/api/lib/guide.mjs `appfeedback` section)**: say "the glowing App feedback button next to the bell".

## Also: only the platform admin can change the platform admin's account
Today nothing can change a user's role. A role is set at invite, and the platform admin is always forced to Company manager. What others can still change on info@'s account is the access: venues, client, can see pay, works shifts, name and phone. Email and deactivate are already blocked.

**API (functions/api/modules/users.mjs)**
- `users.update`: when the target's email is a platform email, call `guardPlatformAccount(user, target.email)` for **any** change, not only email or disable. Only the platform admin, editing themselves, gets through.
- `users.setWorksShifts`: load the target's email and call the same guard.
- `users.list`: add `platform: isPlatformEmail(u.email)` to each row, so the screen can mark and lock it.
- Unchanged:
  - resetLink is blocked once active;
  - mergeOfficerLogin and officer email changes are already guarded;
  - Resend invite for a pending invite stays open, because that's how the owner got in.

**App (app/src/pages/people/Settings.jsx)**
- The users list shows a gold **Platform admin** pill on that row.
- The user sheet, when `u.platform && !me.platform`, shows the details read-only. A Callout says "Platform admin — only they can change this account", and Save, Deactivate, Works shifts and Password reset link are hidden. Resend invite stays while the account is pending.
- When the platform admin opens their own row, it works as normal.

**Tests (test/appFeedback.test.mjs)**: `users.update` and `users.setWorksShifts` reject a company manager editing the platform account. The guard runs before any write, and the email lookup gets stubbed, so either factor out a pure `platformEditAllowed(actor, targetEmail)` or test the guard directly with the same inputs.

**Help**: one line in the `appfeedback` guide section saying the platform admin's own account can only be changed by them.

## Release
- `cd app && npm run build`: ui-lint ≤ 67, with no raw hex in class names; the colours live in styles.css.
- `cd functions/api && npm test`, because the guide changed.
- Commit with `feat: the App feedback button glows in colour` and the Co-Authored-By line.
- `openkbs fn deploy api -s 'rate(5 minutes)'`, then `openkbs site deploy`, then `git push origin master --tags`.

## Verification
- Mock (server.mjs + vite on 5174):
  - screenshots of the desktop top bar (1280) and the phone top bar (390), light theme and dark if available, taken a second apart to show the colour moving;
  - the side menu's "Feedback" module still looks plain.
- Close agent-browser straight after, because the animation burns CPU in the container.
- Live, read-only: the CSS bundle contains `fb-glow`.
