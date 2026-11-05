# Spec: every venue gets a tile on the landing page, with an AI welcome line and its own photo

## Context
The landing page's "Clients" section is hand-written. It has 23 fixed tiles, and only venues linked to one of them (Website client) can show feedback there. The user wants **every venue to appear on the landing page by default**, even before it has any feedback.
- Until feedback arrives, a tile shows a short line written by AI, such as "Opulence is proud to have begun looking after …".
- The office can upload a photo for the tile from the venue's **Details** tab.
- When praise is ticked "Show on website", it appears on that venue's tile as it does today.

**Decided by the user:** every active venue is shown by default, and each venue has a **"Show on website" switch** so the office can hide it.

**My defaults** (the user didn't answer these questions; each is easy to change later):
- The AI line goes live straight away and can be edited or rewritten.
- The existing venue photo in Details is used on the website too.
- There is a City field, which AI fills in from the address.

## Who sees what
- **Public visitors** see the tile: name, city, photo, welcome line, website link (if set) and ticked praise.
  - No address, postcode, contacts or internal notes ever leave the app.
- **Office (company role)** edits a venue's website details in venue → Details → **Website**.
  - This covers: the show/hide switch, city, welcome line (with "Write with AI"), website link, photo, and the existing Website client link.
- **Venue managers** can see their venue's tile preview and photo, but can't change the website settings. Only the office can, as today for Website client.

## Behaviour
1. **Default listing.** Every active venue has `on_website = true` by default.
   - Archiving a venue or turning the switch off removes its tile at once.
2. **Two kinds of tile, one section.**
   - **Venues linked to one of the 23 hand-made tiles** keep that tile. If the venue has its own photo, the photo replaces the stock picture.
   - **Every other venue** gets a tile generated on the page, in the same flip-card style. It is placed under its city heading. A city that isn't on the page yet gets a new heading.
   - The page fetches this once when the section scrolls into view, as reviews do now. If the request fails, the page stays exactly as it is today.
3. **Back of the tile, before any feedback.**
   - Shows the welcome line, a subtle "Reviews coming soon" note and the website link.
   - When praise is ticked, the existing carousel takes over the back. This now works for **every** venue, not only linked ones, so the "Link this venue to a website tile first" message goes away.
4. **Welcome line.**
   - Written by AI when a venue is added. It also runs once when the venue is saved without one.
   - It is 1–2 sentences, warm and professional, British English, and no more than 220 characters. It never makes up facts beyond the name, city and type of service.
   - The office can edit it or press "Write with AI" again. Each generation uses the existing AI credit cap.
   - Until a line exists (for example, for existing venues), the tile shows a safe built-in line: "Opulence is proud to provide door supervision and venue security for {name}." So nothing needs changing in live data at deploy time.
5. **City.**
   - A new City field. When it's empty, it's filled automatically from the address or postcode when the venue is saved, and it can be edited.
   - Tiles with no city go under "More venues".
6. **Photo.**
   - The existing Details photo upload is reused. When a photo is uploaded, a public copy is published for the website (the same way as the company logo), and removing the photo removes it from the site.
   - Tiles with no photo use a tasteful Opulence placeholder with the venue's initials, in brand gold on black.
7. **Show on website switch.** Office only, in Details → Website. When it's off, a hint says "Hidden from the landing page". Praise ticked for a hidden venue is not shown either.

## Out of scope
- Re-ordering tiles by hand.
- Changing the 23 existing hand-made tiles' text.
- Any change to live venue data at deploy time. The office fills in photos, cities and lines themselves.

## Acceptance
- Add a test venue locally with no feedback. It appears on the landing page under its city, with the AI line and the placeholder image.
- Upload a photo and the tile shows it. Switch it off and the tile disappears.
- Tick praise for an unlinked venue and its tile shows the quote carousel.
- The public response contains only name, city, line, photo URL, website link and quotes.
