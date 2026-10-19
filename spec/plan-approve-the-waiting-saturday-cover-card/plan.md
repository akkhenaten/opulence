# Plan: approve the waiting Saturday cover card

## Context
During Ops AI testing, the chat request "Put Jordan Hayes on that shift" created a cover card in the Ops AI inbox. The shift is the new 2-person Door Supervisor shift at The Lantern Rooms on Sat 24 Oct, 21:00–03:00. The card offers the shift to Jordan Hayes first, with Aisha Rahman as backup. The user chose to approve it. No code changes are needed; this is one manager action on the live app.

## Steps
1. In the browser, log in as the company manager (`/tmp/login.sh company`) and open `/company/ops` (Inbox → To approve).
2. Find the card "Cover The Lantern Rooms · 24 Oct 2026 21:00–03:00". If there are two cover cards for this shift (one from the approved venue request, one from the chat), approve the chat card that names Jordan first, then reject the other with the reason "Duplicate". Both cards offer the same two officers.
3. Tap **Send offers**. This calls `ops.decide` with `decision: 'approve'` (`functions/api/modules/ops.mjs`, which creates the batch of offers). That writes `cover_offers` rows and notifies Jordan and Aisha in the app and by email (demo addresses), with a link to `/officer/shifts?tab=offers`.

## Verification
- The card moves to **Decided**, with status approved.
- A read-only query on `cover_offers` for that shift shows Jordan and Aisha with status `offered`.
- Log in as Aisha (`/tmp/login.sh officer_aisha`). The Saturday offer shows on Home and on Shifts → Offers, with Accept and Decline. Do not accept it, so the user can try that themselves.
- Run `agent-browser close --all` when finished.
- Report back briefly. Offers expire after 30 minutes (`ops_offer_wait_minutes`) if nobody accepts. Ops AI then proposes the next batch as a new card.
