# Spec: officers are prompted to register their phone, managers see who hasn't, and everyone is prompted to turn on push notifications

## Context
- **Phone registration.**
  - Today an officer only registers their clock-in phone (a passkey: face, fingerprint or PIN) at their first clock-in.
  - Nothing reminds them beforehand, and managers can't see who hasn't done it.
  - Officers on a new phone are never offered registration at all. They can only "Continue without phone check", which shows as "Phone not verified".
- **Push notifications.**
  - Web push is already built: VAPID keys, the service worker, `push.subscribe`, and every in-app notice is also pushed.
  - But it's off until someone finds the switch in the Notifications sheet, and no one is ever asked.

The user asked for:
- a prompt with an actionable button;
- managers flagged when an officer hasn't registered (they chose **straight away**: a visible "No phone" label and list, no alert);
- push notifications for the whole app.

The push prompt question was unanswered, so this takes the recommended answer: a card for everyone until it's on.

## What changes

### 1. Officer: register your phone (one-off per phone)
- **Home → To do:** the row "Register your phone for clocking in" with a **Register now** button.
  - It shows while the officer has no active or pending phone.
  - It's amber when they have a booked shift within 24 hours, blue otherwise.
- **Profile → Clock-in phone:** a **Register this phone** button when none is registered.
- **Both open the same register screen as clock-in**, as a step on its own. On success: "Done. You'll use your face, fingerprint or PIN to clock in."
- **On a laptop or desktop** (not a phone or tablet), the screen doesn't register. It shows a QR code and "Open this on your phone", so a laptop can't become the clock-in device.
- **New phone:** "Confirm it's your phone" at clock-in gets **Use this phone instead**.
  - This registers it as a new phone waiting for a manager to approve it. That approval step is unchanged.
  - The Profile wording is corrected to match.

### 2. Managers see who hasn't registered (straight away, no alert)
- A **"No phone"** label on the officer's profile (Clock-in phone tile) and in the staff list.
- **Exceptions → Phones** gets a "Not registered" section listing active officers with no phone, each linking to their profile.
- Venue logins see none of this. Managers in Orb and the platform admin (as a Company manager) see the same as today's phone approvals.

### 3. Push notifications for everyone
- **A "Turn on notifications" card** on the home page of every role (officer, company, security, venue) until push is on for that device.
  - One button. **Not now** hides it for 7 days on that device.
- **iPhone** not opened from the home screen: the card first explains "Add to Home Screen" (push only works there on iOS).
- **Blocked by the browser:** the card tells them how to allow it in settings, and doesn't ask again.
- **The existing Notifications sheet** stays as the place to turn push off and choose optional kinds. Shift and safety alerts always come.
- **Managers can see who can't get pushes:** a "No notifications" label beside "No phone" on the officer profile and staff list.
  - This means the officer has no device with push turned on.
- **Server:** when a push endpoint returns 404 or 410, the subscription is removed so the label stays true. This is checked in the existing `webpush.mjs`; the clean-up is added if it's missing.

## Not changing
- Clock-in is never blocked for a missing phone or notifications.
- The first phone is still trusted straight away, and later phones still need a manager.
- No new emails or alerts are sent to managers.
- No live data is changed by the release itself.

## What's new
A card "Phone set-up and notifications, sorted" with its own AI picture.
