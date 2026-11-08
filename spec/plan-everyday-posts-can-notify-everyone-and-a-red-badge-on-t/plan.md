# Implementation plan: Notify everyone from Everyday, and a red badge on the app icon (v160)

There are no database changes. Every change uses tables that already exist (`notifications.read_at`, `push_subscriptions.user_id`).

## Server (functions/api)

1. **`lib/webpush.mjs`**
   - `pushToSubs(subs, data)`: `data` can now be an object or a function `(sub) => object`. It sends `typeof data === 'function' ? data(s) : data` for each subscription. `push.test` keeps working because it passes an object.
   - `pushToUsers(userIds, data, badges = null)`: add `user_id` to the select. When `badges` is given, send `{ ...data, badge: badges[s.user_id] ?? 0 }` to each subscription.
2. **`lib/notify.mjs`**
   - `TIER.announcement: 'fyi'` → `'action'`. Update the comment.
   - Before pushing, look up the unread counts:

     ```js
     q('SELECT user_id, count(*)::int AS n FROM notifications WHERE user_id = ANY($1::uuid[]) AND read_at IS NULL GROUP BY user_id', [ids])
     ```

     Turn the result into a map `{ user_id: n }` and pass it to `pushToUsers`. It runs in the existing try/catch.
3. **`modules/everyday.mjs` `everyday.create`**
   - Just before `publishFeed`, add:

     ```js
     if (b.notify_all && isManager(user) && !check.serious && kind !== 'event')
       await notify(await allStaff(user.id), { kind: 'announcement', title: `${user.name} posted on Everyday`, body: snippet(f.body) || 'New photo', link: postLink(post.id), dedupe: `everyone:${post.id}` });
     ```

   - Events are left out because they already notify everyone.
   - Posts flagged as serious are held back, so they don't notify.
   - `notify` already respects each person's "Announcements from managers" setting.
4. **`test/notifyTiers.test.mjs`**
   - Assert `tierOf('announcement') === 'action'`.
   - Add a `pushToSubs` test: a function payload is called once per subscription. Stub `fetch` and the vapid keys, or if that's heavy, test a small `payloadFor(data, sub)` helper exported from `webpush.mjs`.

## App

5. **`app/src/pages/everyday/Composer.jsx`**
   - Add `const [notifyAll, setNotifyAll] = useState(false)` and `const canNotify = !post && ['company','security'].includes(user.role) && ['post','poll','shoutout'].includes(kind)`.
   - Show `<Toggle checked={notifyAll} onChange={setNotifyAll} label="Notify everyone" hint="Every member of staff gets a phone notification." />` in a `mt-3` block just above the footer row, when `canNotify`.
   - In `send()`, add `if (canNotify && notifyAll) b.notify_all = true;`.
   - Reset it with the other fields.
   - The toast gets ` — everyone notified` added when it was on.
6. **`app/src/layouts/Shell.jsx` `NotificationBell`**
   - Add an effect on `[unread, count.data]` that runs only once data has loaded:

     ```js
     try { unread ? navigator.setAppBadge?.(unread) : navigator.clearAppBadge?.(); } catch {}
     ```

     Use `.catch(() => {})` on the returned promise.
   - Mark read and mark all already call `count.reload()`, so the badge clears by itself.
7. **`app/public/sw.js`**
   - In the push handler, add `if (typeof d.badge === 'number') self.navigator.setAppBadge?.(d.badge).catch(() => {});` inside `waitUntil`, using `Promise.all` with `showNotification`.
   - Update the comment to mention `badge`.
   - `CACHE = 'orb-shell-v6'`.
8. **`app/src/pages/people/Settings.jsx` `PHONE_TIERS`**
   - Action text: add "announcements and Everyday posts sent to everyone".
   - FYI text: unchanged, since it doesn't list announcements.
   - In `_notify.jsx`, the footnote stays as it is.
9. **What's new**
   - Add a prompt `everyday-notify` to `app/scripts/whatsnew-images.mjs`, then run `node app/scripts/whatsnew-images.mjs everyday-notify`, which creates `app/public/whatsnew/everyday-notify.webp`.
   - Add a card to `app/src/pages/people/_whatsnew.jsx`, dated 2026-11-08: "Notify everyone from Everyday, and a red badge on the app icon".

## Build, deploy, verify
- Run `cd functions/api && npm test`, then `cd app && npm run build`.
- Commit 1: "feat: …". Stage the explicit paths above.
- Commit 2: "build: site with everyday notify-all and app badge". Stage `site/app`.
- Deploy with `openkbs fn deploy api` and `openkbs site deploy`.
- Live checks:
  - The `index-*.js` bundle contains `6ij75kpgf7` and not `hopedp5`.
  - `/app/sw.js` contains `orb-shell-v6` and `setAppBadge`.
- I won't send any pushes or posts. The user's own test: the admin posts with "Notify everyone" on, and Matthew should get a notification and a red count on the icon. The installed app picks up the new service worker the next time it opens.
