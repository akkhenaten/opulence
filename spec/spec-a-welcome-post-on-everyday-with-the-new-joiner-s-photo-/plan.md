# Spec: a welcome post on Everyday, with the new joiner's photo, the moment they first log in

## Context
- **Today:** Everyday already posts "Please welcome X to the team! 👋" for new staff. It's a celebration post by Orb, built by `celebrations()` in `functions/api/modules/everydayJobs.mjs`.
- **What's wrong with it:**
  - It goes up only between 07:00 and 09:00.
  - It only covers officer records created in the last 14 days, so most applicants, whose record is older by the time they're hired, never get one.
  - The card shows a 👋 emoji, not the person.
- **What you asked for:** when new staff join, a post in Everyday that welcomes them to the app using their profile picture.

## Decisions (from you)
- **When:** the moment the new joiner first logs in, meaning they accept their invite and set a password. They see their own welcome straight away.
- **No photo yet:** post immediately with their initials. The card always shows the person's *current* profile photo, so once they upload one the post shows it with no re-post.

## Defaults (you didn't pick these; say if you want them different)
- **Text:** keep today's wording: "Please welcome {name} to the team! 👋 Say hello and help them feel at home."
- **Who:** officers and security/company managers, meaning anyone new who can see Everyday. Venue users are excluded (they can't see Everyday). The platform admin and the Orb system user are excluded too.
- **One welcome per person, ever:** the existing `welcome:{user_id}` key is reused, so nobody already welcomed gets a second post.

## What changes
1. **Trigger on first login.**
   - When an invite is accepted (`auth.acceptInvite`), post the welcome for that user straight away using the existing `celebrate()`.
   - It never blocks or fails the login.
   - It's skipped when Everyday is off, welcomes are switched off in Everyday settings, or the user's role can't see Everyday.
2. **Stop the morning welcome sweep.** Welcomes from the 14-day morning job are removed, so there's one source and no duplicates. Birthdays and anniversaries stay as they are.
3. **The welcome card shows the person.**
   - It shows a large round profile photo, falling back to initials, with "Welcome to the team" and their name and role underneath.
   - It replaces the 👋 emoji card for welcome posts only. Birthday, anniversary and qualification cards are unchanged.
   - The photo is read live from their profile, so a later upload appears on the old post.
   - Tapping the photo or name opens their Everyday profile.
4. **The notification to the new joiner** stays as today: "Welcome to the team! Say hello on Everyday", and it opens the post. They can still remove the post about themselves, as today.
5. **What's new card** for managers: "New staff get a welcome post with their photo", with its own picture.

## Not in scope
- AI-written welcome text.
- Asking for a photo at first login.
- Welcoming staff who joined before this release. No back-fill, and nothing is posted on the live system at release.
- Welcoming staff who never get a login.

## Edge cases
- **Invite accepted twice or re-sent:** still one post (the dedupe key).
- **A rehired leaver who logs in again:** they already have a welcome key, so there's no new post.
- **The person sets "Don't post a welcome for me" in their Everyday settings, if they set it before first login:** no post. In practice it's on by default, and they can remove the post afterwards.
- **Their photo is removed later:** the card falls back to initials.

## Verification
- API unit test: first-login welcome eligibility by role and settings.
- Mock run:
  - accept an invite as a new officer, and one welcome post appears at the top of Everyday with initials;
  - upload a photo, and the same post shows the photo;
  - a second accept creates no second post;
  - a venue user gets no post.
- Build: ui-lint ≤ 67. Tests pass.

## Release
- API and app deploy, then push.
- No posts are created on live by the release itself.
