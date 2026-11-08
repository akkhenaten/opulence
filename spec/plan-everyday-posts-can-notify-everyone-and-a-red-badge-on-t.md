# Plan: Everyday posts can notify everyone, and a red badge on the app icon (v160)

## Context
The admin posted on Everyday, and Matthew (matthew@opulence-security.com, home-screen app) got nothing: no notification and no red badge on the app icon. This is working as built, but it isn't what's wanted:
- **No notification:** an ordinary Everyday post notifies nobody. Only @mentions, tags, shout-outs and events do (`functions/api/modules/everyday.mjs`, `everyday.create`, ~:505–522). The one way to reach everyone is Pin → "Also send it as an announcement" (`PostCard.jsx:56`). Since v159 that is FYI, so bell only and no phone.
- **No badge:** the app never sets an icon badge.

The second question (what a manager's post should do) wasn't answered, so this uses the recommended option: **an opt-in "Notify everyone" switch**. Say if you'd rather have every manager post notify automatically.

## Changes

### 1. "Notify everyone" when a manager posts
- **`app/src/pages/everyday/Composer.jsx`**
  - For managers (`['company','security'].includes(user.role)`), creating a new `post` or `poll` (not when editing) shows `<Toggle label="Notify everyone" hint="Every member of staff gets a phone notification." />` above the Post button.
  - It's sent as `notify_all: true` in the `everyday.create` body.
  - Reset it after posting.
  - The toast says "Posted — everyone notified".
- **`functions/api/modules/everyday.mjs` `everyday.create`:** after the existing notices, if `b.notify_all && isManager(user) && !check.serious` (held posts don't go out):
  - call `notify(await allStaff(user.id), { kind: 'announcement', title: `${user.name} posted on Everyday`, body: snippet(f.body || event?.title || 'New photo'), link: postLink(post.id), dedupe: `post:${post.id}` })`;
  - it respects each person's "Announcements from managers" setting, as now.

### 2. Announcements reach the phone
- In **`functions/api/lib/notify.mjs`**, `TIER.announcement`: `'fyi'` → `'action'`. Pin-and-announce then reaches phones too.
- Update the Action/FYI text in `PHONE_TIERS` in **`app/src/pages/people/Settings.jsx`**: add "announcements and posts sent to everyone" to Action.

### 3. Red badge on the app icon (unread count)
- **Server (`lib/notify.mjs` → `lib/webpush.mjs`):**
  - When pushing, count each recipient's unread notices in one query: `SELECT user_id, count(*) … WHERE read_at IS NULL GROUP BY user_id`.
  - Send it as `badge` in that person's payload.
  - `pushToUsers(userIds, data, badges)` passes `{ ...data, badge: badges[s.user_id] }` per subscription. Add `user_id` to the select; `pushToSubs` takes a per-sub data function.
- **`app/public/sw.js`:**
  - On push, call `self.navigator.setAppBadge?.(d.badge)` when the payload has a number.
  - Bump `CACHE` to `orb-shell-v6`.
- **`app/src/layouts/Shell.jsx` `NotificationBell`:** whenever `unread` changes, call `navigator.setAppBadge?.(unread)`, or `clearAppBadge?.()` at 0, in try/catch. Opening and reading the bell then clears the icon badge.
- **Limit:** FYI notices don't push, so they only update the badge the next time the app is opened. iPhone (16.4+) and Android Chrome support badges for installed apps that have notification permission.

### 4. Release
- What's new card + AI picture (`everyday-notify`), date 2026-11-08: "Notify everyone from Everyday, and a red badge on the app icon".

## Verification
- **New test in `test/notifyTiers.test.mjs`:** `tierOf('announcement')` is `'action'`. The kind-coverage test still passes.
- **`npm test` in `functions/api`.** `everyday.create` is checked by reading the code (no DB in tests).
- **`npm run build` in `app`.** Bundle has `6ij75kpgf7` and not `hopedp5`; the live `sw.js` is `orb-shell-v6`.
- **Commit and deploy:** feat commit and build commit with explicit paths, then `openkbs fn deploy api` and `openkbs site deploy`, then check the live bundle.
- **No notifications sent by me.** Your check:
  - The admin posts with "Notify everyone" on, and Matthew's phone should buzz and show a red "1" on the icon.
  - If nothing arrives, Matthew can tap Notifications → Send a test on his phone to see why.
