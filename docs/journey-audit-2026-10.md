# Journey audit, October 2026

Every role was walked through on a phone (390 px wide) and on a desktop (1440 px):
- company manager, security manager, venue manager and officer, using the demo data;
- the public pages: sign-in, forgot password, password reset and invite.

On each screen we checked for:
- errors in the browser console and failed server calls;
- content cut off or wider than the screen;
- empty screens that don't say what to do next;
- what each role can and can't open.

## Fixed in this release

| Role | Screen | Severity | Finding | Fix |
|---|---|---|---|---|
| All | Sidebar, top bar, sign-in, certificates | Broken | The company logo was very small. A wide logo with empty borders shrank to a thin strip. | The logo is sized by where it appears and by its shape: wide logos get the full width, square logos a taller box. Empty borders are trimmed automatically on upload. |
| Company, security, venue | Every page, phone | Broken | When you scroll, the small page title in the top bar was centred and hidden behind the header buttons. | The title now sits on the left, clear of the buttons. |
| Company | Settings → Workforce rules, phone | Broken | The page was 20 px wider than the screen, so it scrolled sideways. | The columns now fit the screen on phones. |
| Company | Pay run, phone | Broken | The step labels ("Drafts created … Paid") were cut off. | On phones only the current step's label shows; all of them show on desktop. |
| All | Install on phone (PWA) | Gap | There was no way to find out how to install the app, and iPhone users got no guidance. | There is a "Get the Orb app" card on each home page, and "Install the app" in My account / Me. It gives one-tap install on Android and in Chrome/Edge, and step-by-step Safari instructions on iPhone. |
| All | Offline | Gap | There was no sign when the phone lost signal. | An amber "You're offline" bar appears under the top bar. |
| All | After a release | Gap | Open apps kept running the old version without saying so. | A "A new version of Orb is available" message appears, with a Refresh button. |
| All | Phone notifications | Polish | The notification icon was an SVG, which Android shows as a grey square. | It's now a PNG app icon, plus a monochrome badge for the status bar. |
| All | Help | Gap | There was no user guide. | "Help & user guide" is in the sidebar, My account and Me. It has search and screenshots, and can be downloaded as a branded PDF. |

## Still to do (recommended)

| Role | Screen | Severity | Finding | Recommendation |
|---|---|---|---|---|
| Venue | Overview | Polish | "Rate your recent officers" fills the top of the dashboard, which pushes "On site now" below the fold on a phone. | Move ratings below "On site now", or fold them into one "3 officers to rate" row. |
| Public | Password reset link | Gap | An expired or wrong reset link still shows the new-password form, and only fails when you press Save. | Check the link when the page opens, and show "This link has expired" with a button to request a new one. |
| Venue | Shift logs | Gap | Shift logs stay empty until the shift lead signs off, but the empty screen doesn't say so. | Change the empty text to "Logs appear here when the shift lead signs off the shift." |
| Officer | Pay | Polish | "No statements yet" doesn't say when to expect one. | Add "Your statement appears here when the company issues the pay run." |
| All | Some two-column layouts | Polish | About 22 two-column layouts could get wider than a phone screen if they hold a very long unbroken word or number. None do with today's data. | Apply the same one-line fix used on Workforce rules when each screen is next touched. |
| All | Email | Gap | The email sending domain isn't verified yet, so some invites, password resets and statements may not be delivered. | Connect and verify the company domain for email. Until then, managers can copy invite and reset links from Settings → Users & access. |
| Company | Desktop install | By design | On desktop the install card only shows when the browser offers installing (Chrome or Edge). | No change. The "Install the app" row in My account explains how to install in other browsers. |

## Checked and working

The following were checked at both screen sizes, with no errors and nothing cut off:
- **Company:** dashboard, live operations, rota, cover requests, timesheets, exceptions, incidents, staff, recruitment, time off, staff contracts, training, compliance, toolbox, venues, clients, pay, pay runs, statements, invoices, reports, settings (every tab), audit, Ops AI and messages. Detail pages: shift, incident, invoice, staff member, venue, pay run and statement.
- **Security manager:** the same operations pages. They are redirected away from Settings and Invoices, and see "No access to pay" without the pay permission.
- **Venue manager:** overview, on site, request cover, messages, my venue, shift logs, bans, timesheets, incidents and invoices.
- **Officer:** home, shifts (calendar, list, offers, open shifts), clock, pay, Learn, Me, documents, time off, profile, contracts and growth.
- **Public pages:** sign-in, forgot password, reset and invite.
