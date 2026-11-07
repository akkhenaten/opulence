# Spec: Orb stops re-raising what's already flagged or decided (logo / photo), and names match regardless of case

## Context
On Live operations, Orb keeps bringing back things it has already flagged or that a manager has already dealt with. The user named two kinds: the **venue logo** and the **photo** cards. They also said a name that differs only in how it's written, for example **Scott** and **SCOTT**, must count as a match and must not be flagged.

What the code does today:
- **Logo (venue setup cards):**
  - Once a card is dismissed or closes by itself, Orb still searches the web for the logo every 5 minutes. The new card is then silently blocked, so the search repeats forever and takes up one of the 3 lookup slots.
  - If a manager approves only the radius, a new "No logo" card comes back on the next run, and it has nothing to approve.
  - Uploading a logo doesn't trigger a re-check.
- **Photo / document cards (officer compliance):**
  - Rejecting a whole card doesn't record that each issue was rejected. Orb asks the AI about the officer again on every run.
  - Any small change to the officer brings back every issue, including the rejected ones. "Photo missing" and similar concerns, and "Name doesn't match", are among them.
  - "Re-check" doesn't clear these issues.
- **Names:**
  - The main check already ignores case.
  - The SIA register check needs an exact match, so a middle name on the register fails it.
  - A blank first name, or a joined or split surname (Mc Donald / MCDONALD, O'Brien / OBRIEN), still gives a false mismatch.

## The rule: once seen, once decided, stays decided
Orb raises a problem **once**. After that it stays quiet unless **the underlying thing actually changes**: a new file, a new website, new profile details. These count as decided:
- dismissing or rejecting a card;
- dismissing one issue;
- the card clearing by itself.

Orb doesn't spend AI or web lookups re-checking something it has already decided.

### 1. Venue logo
- A logo card is raised once per venue and website. If it's dismissed, or the lookup found nothing, Orb doesn't search again or re-raise it until the venue's website changes.
- Approving a card with only some items ticked (for example the radius) counts as dismissing the unticked items. "No logo" doesn't come back by itself.
- A logo the manager has already uploaded (the venue's logo or file) counts as "has a logo".
- Uploading or changing the logo in Site setup clears any open logo card straight away.
- A closed card never blocks Orb from raising a genuinely new problem for that venue later.

### 2. Officer photo / document cards
- Rejecting a whole compliance card records every issue on it as rejected, the same as dismissing them one by one. They don't come back unless that document is replaced or the profile name, number or expiry changes.
- Orb doesn't call the AI for an officer whose current card hasn't changed. That saves credits and avoids identical repeats.
- "Re-check" on a document clears its photo/readability and name flags, and the document is read again fresh.
- A new problem for the same officer is still raised. Only the decided ones stay quiet.

### 3. Names match regardless of how they're written
One shared name check, used everywhere names are compared: document scans, the SIA register check, applicants, and the right to work sheet. It treats these as the same:
- **case:** Scott = SCOTT = scott;
- **accents:** José = JOSE;
- **punctuation and spaces:** O'Brien = OBRIEN, Mc Donald = MCDONALD, Smith-Jones = SMITH JONES;
- **middle names:** "Onyeka Chidi Goddey" matches the profile name "Onyeka Goddey".

A blank first name on the profile is never reported as a mismatch. Existing "Name doesn't match" flags that now pass clear by themselves on the next run.

Nicknames (Bob / Robert) are still flagged. That's a real human check.

### 4. Phone chip wording (small)
On Live and Exceptions, "Phone not checked" is replaced by the actual reason:
- **"Phone skipped"**: the officer didn't do the phone check;
- **"Phone not recognised"**: the phone isn't the officer's registered phone, or its check failed;
- **"New phone, not approved"**: unchanged.

How it works today is unchanged: the phone check is a passkey tied to that one phone, a failed check makes the clock-in an Exception, and the officer is never blocked.

## Out of scope
- No change to which problems Orb looks for. It just stops repeating them.
- No data changes are run by hand. Existing repeat cards close or stay closed through the normal Orb run.
- No change to the face match, location or venue code rules.

## Done when
- A dismissed "No logo" card doesn't return, and the log shows no repeated web lookup for that venue.
- Approving a card with only the radius ticked doesn't bring back a "No logo" card.
- Uploading a logo clears the card.
- Rejecting a photo or document card means it doesn't come back on the following runs. Replacing the document lets a new problem be raised.
- Scott / SCOTT, O'Brien / OBRIEN, Mc Donald / MCDONALD and a middle name on the SIA register all match. A blank first name isn't flagged.
- API tests cover each of the above, and the existing tests still pass.
- What's new card for the release, with its AI picture.
