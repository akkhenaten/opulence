# Spec: Everything about your own work reaches your phone, and it's mandatory (v161)

## Context
The user wants notifications to be **personal and mandatory**: "if we are approving a timesheet for a user, or a new work request, a message from Orb, or the manager, anything to do with the user, their shift, or their work, they need to get a notification, mandatory". An important Everyday notice must also reach everyone and be mandatory. Each one should show as a red count on the app icon, appear on the lock screen as a push, and make a sound when the phone isn't on silent.

**What's in the way today:**
- **Bell only:** since v159, many personal notices only go to the bell. That includes HR notes, documents, training, "Payment sent", replies to your feedback and Everyday activity. They don't reach the phone, so the icon count only changes when the app is opened. iPhone only lets an app update its icon count with a visible notification.
- **Switchable:** people can switch off announcements, mentions and training in Notifications.
- **Missing:** some events about your own work send nothing at all. When a manager approves a timesheet, only the client is told, not the officer.
- **Everyday:** the switch added in v160 is called "Notify everyone", and people can opt out of it.

**Decided:**
- This applies to **every role, for their own work**. Officers: their shifts, timesheets, pay, HR, training and messages. Managers: whatever is waiting for them. Venue managers: their venue's shifts, timesheets and invoices.

**Assumed (the questions weren't answered; recommended options used):**
- Everyday social activity (likes, comments, tags, shout-outs, celebrations, event reminders) also comes to the phone, and is the only thing people can still switch off.
- Important Everyday notices are marked with an **"Important notice"** switch that only managers have. It reaches every member of staff and can't be switched off. Ordinary manager posts don't notify.

## Requirements

### 1. Anything about your own work reaches the phone
- **Default level:** every kind of notice comes to the phone and the bell (Action), unless it's Urgent (phone, email and bell, as now).
- **Bell only:** only a manager's information about something another person has already done, which needs nothing from them. Examples: "Contract signed", "Policy signed", "Venue pack signed".
- **Move from bell only to the phone:**
  - "Payment sent" (to the officer).
  - Time-off requests (to managers, who need to decide them).
  - Answers to procedure suggestions (to the officer).
  - HR notes, documents and "You're all set".
  - Training: new, due and passed.
  - Pay rises.
  - Reviews.
  - Invoices and credit notes (to venues).
  - Orb cards and "messages from Orb" for managers.
  - Replies to app feedback.
  - Event changes and cancellations.
  - Moderation notices about your own post.
- **New notices that are missing today:**
  - **Timesheet approved:** to the officer — "Your timesheet for {venue}, {date} was approved".
  - **Timesheet changed by a manager:** to the officer — "Your timesheet for {venue}, {date} was changed", with what changed.
  - While building, check every officer-facing action (shift requests, cover, pay runs, documents, right to work, time off) and add a notice wherever the person isn't told today.

### 2. Mandatory
- **Can't be switched off:** work notices, announcements and important notices, mentions and training.
- **Can still be switched off** in Notifications and in the company defaults: likes, comments on my posts, tags, shout-outs, celebrations and event reminders.
- **Existing settings:** anyone who has already switched off announcements, mentions or training will now get them anyway. The settings screens stop showing those switches.

### 3. Important notices on Everyday
- **The switch:** the composer switch (managers and admin, new post, poll or shout-out) becomes **"Important notice"**, with the hint "Every member of staff gets it on their phone. It can't be switched off."
- **The phone notice:** "Important notice from {name}", with the first line of the post as the text. Tapping it opens the post.
- **In the feed:** the post shows an "Important" label so it stands out.
- **Pin → "Also send it as an announcement"** is also mandatory and reaches the phone.

### 4. Icon count, lock screen and sound
- **Icon count:** the red count on the app icon (v160) now goes up for every notice, because every notice is pushed. It goes down as notices are read.
- **Sound:** pushes are never sent silent. The phone plays its normal notification sound and vibrates in normal mode, and stays quiet on silent, in Focus or with Do Not Disturb on.
  - Android also gets a vibration pattern.
  - A web app can't choose its own sound; it uses the phone's notification sound.
- **Urgent notices** stay on screen until dismissed (as now).

### 5. Settings and help text
- **Notifications sheet:** say "Everything about your shifts, timesheets, pay and work always comes to your phone. You can switch off Everyday likes, comments, tags, shout-outs, celebrations and event reminders."
- **Company Settings → "What reaches the phone":** three levels:
  - Urgent.
  - Phone: everything about your own work, important notices, Everyday.
  - Bell only: notes that someone else signed something.

### 6. Release
- A What's new card with its own picture: "Everything about your work comes to your phone".

## Not in scope
- Custom notification sounds (not possible for web apps).
- Quiet hours.
- Text messages (SMS).
- Changing email rules: email stays for Urgent only.

## Acceptance
- **Timesheet:** a manager approves an officer's timesheet, and the officer's phone shows a notification with sound, and the icon count goes up.
- **Important notice:** a manager posts with "Important notice" on. Every member of staff gets it on their phone, including anyone who had switched off announcements.
- **Switches:** Notifications only lists the six social Everyday switches.
- **Bell only:** a contract signed by an officer gives managers a bell notice only.
- **Tests:** a test checks that no kind is bell-only except the listed manager-information notices, and that the optional kinds are just the six social ones.
- **No live sends:** nothing is sent to real people during the build. The user tests it on the phone.
