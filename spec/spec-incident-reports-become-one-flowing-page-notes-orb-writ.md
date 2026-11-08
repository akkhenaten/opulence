# Spec: Incident reports become one flowing page: notes → Orb writes it → officer, manager and venue sign

## Context
An incident report today is a 6-step wizard: Evidence → What → When & where → People → Actions → Review. On a phone it feels like a form, not like writing.

Drafts already autosave. They go to the server 0.8s after each change and also to a copy on the phone, and they work offline. The only AI help is a sheet that suggests a value for each field. Once a report is sent, only the manager is involved: they either close it or send it back. Nobody signs it, and the venue only gets a copy when the incident is urgent.

The owner wants it to feel like Notion's AI app:
- The officer writes rough notes and adds pictures and other items with small icons.
- When ready, they tap **Orb**. Orb writes a proper, factual and neutral report that includes the pictures.
- The officer reviews the final version, approves it, **signs** it and sends it to their **manager**.
- The manager **signs** it and sends it to the **venue manager**.
- The venue manager **signs** it, and the report stays on file at the venue.

## Who it's for
- **Officers**, mostly on phones: the writing page, Orb, signing.
- **Managers** in the company portal: reviewing, correcting, signing.
- **Venue managers** in the venue portal: reading, signing, keeping the record.

## 1. The writing page (replaces the wizard)
One page, with no steps and no Next buttons. It is used for a new report, for a saved draft, and for a report that was sent back.

```
┌ ← Incidents            Saved ✓          [Orb ✦] ┐
│ Untitled incident   (title, optional)           │
│ [⚑ Type] [● Severity] [🕘 22:40 Sat] [📍 Main bar]│  property chips: tap to set
│ [🚓 Police] [🚑 Ambulance] [✋ Force]            │  (empty chips are dimmed)
│─────────────────────────────────────────────────│
│ Rough notes… just write what happened           │  one free-writing body
│ [photo] [photo]                                  │  inline blocks where inserted
│ ┌ 👤 Witness · Jane Doe · "saw him push…" ┐      │
│ └──────────────────────────────────────────┘     │
│                                                  │
└ [📷][🖼][📎][👤][🎤][🚓][🚑][✋]   ← insert bar ──┘  sticks above the keyboard
```

- **Property chips** sit under the title: type, severity, time, venue/shift (managers pick the venue), location, police, ambulance and force.
  - Tapping a chip opens a small popover or sheet (type tiles, severity tiles, time picker, Yes plus a reference number).
  - Chips that aren't set yet are dimmed. Chips that Orb has filled carry a small ✦ until someone confirms them.
- **Body:** one auto-growing writing area for rough notes. Blocks appear inline where they were inserted, and each can be moved up or down, edited or removed.
- **Insert bar:** small icons pinned above the keyboard on phones and under the body on desktop. Typing `/` at the start of a line opens the same list as a menu you can filter by typing:
  - 📷 Camera · 🖼 Photo/video · 📎 File: inline thumbnails, with captions and crop using the existing photo editor. Uploads keep the existing limits of 20 files and 15 MB each.
  - 👤 Person: name, role (subject, witness, victim, staff, other), contact, statement and injuries.
  - 🎤 Voice: dictation goes in where the cursor is, using Orb's existing transcribe.
  - 🚓 Police · 🚑 Ambulance · ✋ Force used: small fact blocks holding the reference number. The force block also holds the justification, and these blocks stay in step with the chips.
- **Autosave stays as it is today** (server plus phone copy, offline retry, conflict banner, "Finish your report" reminders and 30-day expiry). The top bar shows Saving… / Saved ✓ / Offline – saved on this phone, using small animated icons.
- Existing ways in still work: the Quick incident sheet on the shift bar, "start from a shift log entry", the `?type=` and `?shift=` links, and Your drafts.

## 2. Orb writes the report
- When the officer taps **Orb ✦**, it writes the full report from the notes, photos, person blocks, fact blocks and the shift. The report is in proper, factual, neutral, third-person English.
  - It fills every report section: what happened, when and where, the people involved, injuries, the actions taken, police or ambulance, and force with its justification.
  - It refers to the photos where they belong ("Photo 2 shows…").
  - It also suggests values for any empty chips.
- **Orb never invents facts.** Anything it can't find in the notes becomes a question at the top, for example "What time did police arrive?". Answering a question makes Orb redo that part.
- The **final version** shows as the formatted report, with the photos inline. The officer can:
  - **edit any sentence by hand**;
  - ask Orb to **redo** the whole report or one part, giving an instruction such as "he left at 23:10";
  - **go back to the notes**.
- The officer's original notes, photos and all of Orb's versions are kept with the report as the original record. They are visible to managers and labelled "Written with Orb".
- Before signing, Orb runs a quick **gap check**: missing time, a witness with no name, force without a reason, and so on. Each gap links to the place to fix it. The same server checks as today still apply: the time can't be in the future, it must be within 2 hours of the shift, reports can go back at most 30 days, force needs a justification, and uploads must have finished.

## 3. Signing chain
| Step | Who | Action | Then |
|---|---|---|---|
| 1 | Officer | Approves the final text and signs, using the existing signature pad | The report is submitted and the manager(s) for the venue are notified |
| 2 | Manager | Reads it, then does any of the following (see below), and signs | Sent to the venue manager, who is notified |
| 3 | Venue manager | Reads it and signs; can add a comment | The report is complete and filed at the venue |

**The manager's options** (all three are available):
1. **Send back to the officer** with a note. The officer fixes it on the writing page and signs again. The earlier signed version stays in the history.
2. **Edit the text directly.** The officer must then re-sign the changed version and sees what changed. After that it comes back to the manager to sign.
3. **Add a manager's statement** beneath the officer's untouched text, then sign.

**Venue signature** (default, can be changed):
- It means "received and read" and can carry a comment.
- The venue manager gets reminders (the next morning, then every 2 days) until they sign.
- For the company, the report counts as complete once the manager has signed. It shows "Awaiting venue signature" until the venue signs.

**Statuses:**
- Draft
- Awaiting manager
- Sent back to officer
- Awaiting officer re-sign (after a manager's edit)
- Awaiting venue
- Complete

Today's "closed" maps to Complete, or to Awaiting venue. Urgent incidents still notify the venue straight away, as they do today.

**Filing:**
- When it's complete, a locked **signed PDF** is produced in the same style as signed contracts:
  - the branded header;
  - the report with its photos;
  - the manager's statement, if any;
  - all three signatures with names and times;
  - a signing certificate with a fingerprint.
- The PDF is filed in the venue portal's Incidents, in the company's records, and in the officer's documents. It can be downloaded or emailed. Every signed version stays in the history.
- Venue users still don't see witnesses' contact details.

## 4. The report page (detail)
The detail page reads like the writing page: the title, chips, the report text with photos inline, then a **signature strip** showing the three steps with their status and avatar, then the history.

The action button changes with the status and who is looking: Sign, Send back, Edit, Add statement, or Remind venue.

## Scope
- Officers (new and sent back), managers (filing a report on the same page, plus review), venue managers (signing). Phone first; desktop gets the same page in a centred column with the chips row.
- Reports already submitted before this release keep their current status. Managers can still close them the old way, with no signatures.

## Non-goals
- No collaborative live editing, and no rich text formatting beyond paragraphs and blocks.
- No change to the Ejections register.
- Existing incident analytics and CSV exports don't change, apart from the new statuses being counted.

## Open defaults (chosen; easy to change)
- The venue signature is an acknowledgement with reminders, not a blocker for the company.
- The final PDF is not emailed to the venue automatically; it can be emailed from the report page.

## Release
- Add a What's new card with its own picture.
- Verify with the build and a phone-size browser check of the sign-in page. Pages behind sign-in need a login to check.
