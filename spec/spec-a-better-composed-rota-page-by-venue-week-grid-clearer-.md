# Spec: a better composed Rota page (by-venue week grid, clearer cards, totals, filters, phone day view)

## Context
The user asked to improve how the manager Rota page is laid out and looks, based on what the best scheduling apps do: composition, how the cards behave, and their size. They looked at Deputy, When I Work, RotaCloud, Planday, Connecteam, TrackTik and Belfry.

Today:
- The 7-day grids scroll sideways on laptops. "By day" only shows the full week in one row on wide screens, and wraps to 2 or 4 rows below that.
- Small cards cut off the role and hide "Unconfirmed".
- Officers show as one cut-off line of names.
- There are no week totals and no quick filters for unfilled shifts or drafts.
- On phones, six rows of controls come before the first shift.

The user chose **By venue** as the default desktop view. For the questions left unanswered, this spec takes the recommended answers:
- all four improvement groups are in;
- the totals show places and hours, with no money;
- drag and drop is left for a later, separate spec.

## What changes

### 1. By venue is the main desktop view
- The Rota opens on **By venue**. By day and By officer stay one tap away, and a choice in the address still wins (shared links keep working).
- **One week grid that fits:**
  - venue names are fixed on the left and the day names fixed along the top while scrolling;
  - each day column is at least 140px wide, so the full week fits on a 1280px laptop with no sideways scroll;
  - narrower screens scroll sideways, keeping the venue column in view.
- **Today's column** is lightly highlighted. Past days are slightly muted.
- Each cell keeps its faint "+" to add a shift for that venue and day.
- **By day** on desktop always shows the full week in one row from 1024px up, rather than wrapping into 2 or 4 rows.

### 2. Totals row
Under the grid, a fixed row shows for each day:
- **unfilled places** (red when there are any);
- **draft shifts** (grey);
- **hours booked**.

There's also a week total at the left. Tapping a red unfilled count turns on the Unfilled filter. No money is shown.

### 3. Shift card: clearer at a glance
Each state is shown by a shape or label as well as a colour, and the card is the same size whatever its state.
- **Contents:**
  - the time range;
  - the role;
  - a filled count like "2/3";
  - small officer initials or photos (up to 3, then "+2").
- **Open places** show as empty dashed circles, so you can see how many are missing.
- **States:**
  - **Short:** red bar on the left.
  - **Unconfirmed:** amber bar and a small clock icon. This now shows on small cards too.
  - **Draft:** dashed border and a "Draft" label.
  - **Open to officers:** "Open" label.
  - **Requests waiting:** amber "N requests".
- **Sizes:**
  - comfortable: about 56px high;
  - compact: one line, about 32px, with time, role and the filled count.
- **Hover (desktop):** a short preview of the officers' names and statuses. Clicking opens the drawer, as today.
- Cards no longer sit inside a second bordered box. Venue rows and day columns are plain areas with dividers.

### 4. Filters and a tidier header
- **Quick filter chips** above the grid, each with a count:
  - **Unfilled**
  - **Drafts**
  - **Unconfirmed**
  - **Requests**

  Chips with a zero count step back. Filters are kept in the address.
- **Hide empty venues** switch: on by default, so venues with no shifts that week drop out.
- The venue picker joins the standard filter bar. On phones that bar folds into a "Filters (n)" sheet.
- **Header:**
  - the main buttons are **New shift** and **Publish N**, shown only when there are drafts;
  - Repeat shift, Copy last week and Print go under "…";
  - when filters are hiding drafts, Publish says so ("Publish 5 (2 hidden by filters)").
- **Week bar:** ‹ week › with Today, then the view switch By venue / By day / By officer, then a **density** switch (comfortable / compact). Each manager's choice is remembered on that device.

### 5. Shift drawer tidy
- Each officer row shows avatar, name and status. Its actions go under one "…" menu: make lead, replace, remove, approve or decline a request.
- Approve and Decline for a request stay as visible buttons, because they are the main job there.
- **‹ ›** at the top of the drawer, and the arrow keys, step to the previous or next shift in the current view.

### 6. Phone: a day at a time
- At the top, a **day strip** for the week: seven day pills, each with a red dot when that day has unfilled places, and today pre-selected.
- Below, that day's shifts **grouped by venue, with unfilled shifts first**, using the comfortable card.
- Week arrows, filters and the view switch sit in one compact row. Secondary header actions go under "…".
- By officer on phones stays as a list. Requests is unchanged.

## Who sees what
- No change to permissions. Company managers and security managers see the venues they see today.
- The platform admin is treated as a Company manager.
- No pay rates or costs appear anywhere on the Rota.
- The venue and officer rota pages are out of scope.

## Out of scope (later specs)
- Drag and drop to move or copy shifts.
- Month view and a single-day timeline.
- Saved week templates.
- Showing cost per day.

## Done when
- At 1280px the By venue week shows all 7 days without sideways scroll, with venue names and day names staying in view while scrolling.
- The totals row counts match the cards. Tapping unfilled filters to unfilled shifts.
- Short, unconfirmed, draft and open states are each recognisable without colour, on both comfortable and compact cards.
- On a 390px phone the first shift shows without scrolling past the controls. The day strip marks days with unfilled places.
- The drawer steps between shifts with ‹ › and arrow keys.
- No data changes. The What's new card has its picture.
