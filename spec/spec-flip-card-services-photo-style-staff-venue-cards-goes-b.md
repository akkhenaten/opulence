# Spec: flip-card services, photo-style staff & venue cards, "Goes by" names everywhere

## Context
The venue tiles on the landing page now flip to show reviews. The owner wants the same feel in the service cards on the website. In the app, staff and venue lists should look like picture cards rather than text rows. People should also be called what they go by on every screen, not just a few. Today the "Goes by" name shows on only about half the screens; Rota, Live, Dashboard, Orb, Timesheets and others show the plain "First Last".

## 1. Website: service flip cards (Manned Guarding, Mobile Response, Event Security)
- **Front:** the photo fills the card, with only the service title over a dark gradient at the bottom (same style as the venue tiles).
- **Hover:** slight gold tint and lift, same as the venue tiles.
- **Click or tap:** flips to the back, which shows the title, the existing description and the "Request cover" link. Only one service card is flipped at a time. Esc unflips. Keyboard and reduced-motion behave like the venue tiles.
- "Request cover" on the back still opens the form preset to that service and does not flip the card back.
- Layout stays at three cards across on desktop and stacked on phones.

## 2. "Goes by" names everywhere in the app
- **Rule (the user's choice):** if a person has a "Goes by" name, show it on its own (e.g. "Kris"). Otherwise show their first name and surname ("Krzysztof Nowak").
- This applies to officers and to staff accounts (managers, venue users), on every screen and message that names a person. Examples: Rota, Live operations, Dashboard, Orb, Timesheets, Shift logs, Incidents, Cover, Messages, Everyday, bell notifications and the Staff list.
- **Exceptions:** the full legal name stays where it matters:
  - the person's own profile header, where it shows "Goes by Kris" underneath
  - contracts, payslips and pay statements, invoices, SIA checks and HR or compliance records
- Search still matches both the full name and the "Goes by" name.
- Avatar initials follow the displayed name.

## 3. App: Staff cards
- The Staff page becomes a grid of cards: 2 across on phones, 4–6 on wide screens.
- Each card is a large square avatar (photo, or initials on a soft colour) with the name at the bottom, following the rule in §2.
- Each card also has a small compliance dot: green OK, amber expiring, red issue. Its label is available to screen readers.
- Roles, SIA number and contact details move off the card. They remain on the profile and in search.
- Tapping a card opens the profile, as now.
- The existing filters and search stay.

## 4. App: Venue cards
- The Venues page becomes a grid of cards, each a venue picture with the venue name at the bottom.
- **Where the picture comes from**, in order:
  1. a photo uploaded for the venue
  2. otherwise, the photo of the website client it is linked to (the landing page images)
  3. otherwise, its initials on a soft colour
- **New on the venue page:** "Change photo" and "Remove photo" for company and security managers. It uses the existing photo crop and upload flow.
- The client name and the Inactive pill stay as a small line under the name. Shift and incident counts move to the venue page.

## 5. App: silver logo button to the website
- A small round button sits in the app's top bar, next to the Everyday and bell buttons. It appears for every role, including officers, on desktop and phone.
- **Icon:** the logo mark of the company using the app, taken from the company's brand logo (for Opulence, the horse-head mark). It is rendered in shining silver: a cool metallic gradient with a soft light sweep every few seconds. The sweep is off under reduced motion.
- **Click:** opens the company's landing page (`/`) in a new tab, so the app session stays where it was. Its accessible label is "Open website".
- **Fallback:** if a company has no logo uploaded, it uses a silver globe icon.

## Assumptions (unanswered questions)
- Staff card: avatar, name and a compliance dot.
- Venue picture: uploaded photo, then the website photo, then initials.

## Out of scope
- No data changes on live. Nobody's "Goes by" name or venue photo is set for them.
- The officer app's own home screen layout is not touched.

## Done when
- Clicking a service card on the website flips it to its details.
- Staff and Venues show picture cards with names at the bottom.
- The silver logo button opens the website from any screen.
- Every screen named in §2 shows "Goes by" names where set, and full names otherwise.
- Tests and the UI-lint baseline still pass, and the changes are deployed and pushed.
