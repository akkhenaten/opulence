# Implementation plan: Everything about your own work reaches your phone, and it's mandatory (v161)

No database changes: `posts.announced` already exists and marks important notices.

## Server (functions/api)

1. **`lib/notify.mjs`**
   - `TIER`: every kind becomes `'action'`. FYI stays only through explicit `tier: 'fyi'` on the manager-information calls (step 2). Update the comment: "Anything to a person about their own work reaches the phone; bell only is just for telling managers someone else signed something."
   - `tierOf` stays as it is. Unknown kinds now fall back to `'action'` instead of `'fyi'`.
   - Set `OPTIONAL_KINDS = ['comment', 'reaction', 'shoutout', 'tag', 'event', 'celebration']`, which drops mention, announcement and training. `notify()` already ignores stored prefs for kinds that aren't in the list.
2. **Remove the `tier: 'fyi'` overrides that go to the person themselves or need a decision:**
   - `money.mjs:330`: Payment sent.
   - `hr.mjs:120`: time-off request.
   - `venuePacks.mjs:799`: suggestion to managers.
   - `venuePacks.mjs:824`: answer to the officer's suggestion.

   **Keep** `tier: 'fyi'` on `hr.mjs:325` (contract or policy signed), `signLinks.mjs:93` and `venuePacks.mjs:703` (pack signed).
3. **Notices that are missing today:**
   - `timesheets.approve`: after the update, for each row in `ready`, notify the officer with `notify(await officerUser(r.officer_id), { kind: 'timesheet', title: 'Timesheet approved', body: `${r.venue_name} · ${fmtDate(r.starts_at)} · ${r.hours} h`, link: '/officer/pay', dedupe: `ts-ok:${r.id}` })`. Skip self-approved rows. Check the field names that `loadScoped` returns.
   - `timesheets.edit`: notify the officer: "Your timesheet was changed", `${venue} · ${date}: ${start}–${end}, ${hours} h. ${reason}`.
   - `docs.verify`: when `d.owner_type === 'officer'`, send kind `'hr'`, "Document checked: {label}".
   - `officers.rtwCheck`: notify the officer with kind `'hr'`, "Right to work checked".
   - Look for any other officer-facing decision with no `notify` in rota, cover, payruns, staffSetup and hr. Add one in the same style wherever the officer isn't told.
4. **`modules/everyday.mjs` `everyday.create`**
   - Rename `b.notify_all` to `b.important`.
   - When it's true, set `announced = true` on the insert (add the column to the INSERT).
   - Send the notice as `{ kind: 'announcement', title: `Important notice from ${user.name}`, body: snippet(f.body) || 'New photo', link, dedupe: `important:${post.id}` }`.
   - Keep the `isManager`, `!check.serious` and no-event checks.
5. **`modules/settings.mjs:83`:** don't reject old stored keys; drop them with `pick` on `OPTIONAL_KINDS`, so a company whose saved defaults include `mention` can still save.

## App

6. **`pages/officer/_notify.jsx`**
   - `NOTIFY_KINDS` drops mention, announcement and training.
   - The footnote becomes: "Everything about your shifts, timesheets, pay and work, important notices and mentions always come to your phone. You can switch off the Everyday ones above."
   - The heading becomes "On Everyday, tell me about".
7. **`pages/everyday/Composer.jsx`:** rename the switch to "Important notice", hint "Every member of staff gets it on their phone. It can't be switched off." It sends `important: true`, and the toast says "Posted — everyone notified".
8. **`pages/everyday/PostCard.jsx`:** when `post.announced && !post.pinned_at`, show a strip in the existing pinned style with a `Megaphone` icon and the text "Important notice".
9. **`pages/people/Settings.jsx`**
   - `PHONE_TIERS`: Urgent stays as it is.
   - "Phone and bell": everything about a person's own shifts, timesheets, pay, HR, training and messages; things waiting for a manager; important notices; Everyday.
   - "Bell only": a note to managers that someone signed a contract, policy or venue pack.
   - The company-defaults switches follow the shorter `NOTIFY_KINDS` automatically.
10. **`public/sw.js`**
    - Add `silent: false` and `vibrate: [200, 100, 200]` to `showNotification`.
    - Add `tag` and `renotify` only when a tag is given (as now).
    - Bump `CACHE` to `orb-shell-v7`.
11. **What's new:** add a card and picture `work-notices`, dated 2026-11-08: "Everything about your work comes to your phone".

## Tests (`test/notifyTiers.test.mjs`)
- Every value in `TIER` is `'action'`. `tierOf('anything_new')` is `'action'`.
- The `tier: 'fyi'` overrides in the source appear only in hr.mjs, signLinks.mjs and venuePacks.mjs (pack signed). Check this with a regex scan.
- `OPTIONAL_KINDS` is exactly the six social kinds.
- The existing check that every kind has a tier still passes.

## Build, deploy, verify
- Run `npm test` in `functions/api`, then `npm run build` in `app`.
- Make the feat commit, the build commit and the spec commit, each staging explicit paths.
- Run `openkbs fn deploy api` and `openkbs site deploy`.
- Live checks: the bundle has `6ij75kpgf7` and not `hopedp5`, and `sw.js` has `orb-shell-v7`.
- No live sends. The user tests it on the phone.
