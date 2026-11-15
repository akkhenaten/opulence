// The company user guide: one source for the in-app Help page and the PDF manual.
// body: paragraphs separated by a blank line; "- " lines are bullets, "1. " lines are steps.
// {company} is replaced with the company's name. Images live in the app under /app/help/.
import { siaCheckOn } from './sia.mjs';

const ALL = ['company', 'security', 'venue', 'officer'];
const MGR = ['company', 'security'];
const OFF = () => (siaCheckOn() ? [] : ['sia_check']); // sections for features that are switched off

export const CHAPTERS = [
  {
    id: 'install', title: 'Install the app on your phone', roles: ALL,
    sections: [
      {
        id: 'why', title: 'Why install it',
        body: `{company} runs in the browser, but installing it puts an icon on your home screen. It then opens full screen like any other app, starts faster, and can send phone notifications for shifts, alerts and messages.

You only need to do this once on each phone or computer. You stay signed in.

Closed the Get the Orb app card on your Dashboard? Company managers find it in Settings, Company details; officers under Me; everyone else under My account, Install the app.`,
      },
      {
        id: 'android', title: 'Android phones and computers (Chrome or Edge)', image: 'install-card.png',
        body: `1. Sign in to the app in Chrome or Edge.
2. On your home page, tap Install the app on the "Get the Orb app" card. If you closed the card, open {account} and tap Install the app.
3. Confirm Install. The Orb icon appears on your home screen or desktop.

If there is no Install button, open the browser menu (three dots) and choose Install app or Add to Home screen.`,
      },
      {
        id: 'iphone', title: 'iPhone and iPad (Safari)', image: 'install-ios.png',
        body: `1. Open the app in Safari. Other browsers on iPhone cannot install it.
2. Tap the Share button at the bottom of the screen.
3. Scroll down and tap Add to Home Screen, then Add.
4. Open Orb from the new icon on your home screen.

Phone notifications on iPhone only work from the installed app, so do this before you turn notifications on.`,
      },
      {
        id: 'notifications', title: 'Turn on phone notifications',
        body: `Open {account}, tap Notifications, then Turn on. Allow notifications when your phone asks.

Alerts about your own work, safety and anything you must confirm always come through.{everyday}`,
      },
      {
        id: 'updates', title: 'Updates and working offline',
        body: `When a new version of the app is released, a "A new version of Orb is available" message appears. Tap Refresh to start using it. After a release, managers also see a short What's new card when they sign in (for two days), and every release is listed under Audit log, then What's new.

If your phone loses signal, an amber "You're offline" bar appears under the top bar. The app still opens, but nothing is saved until you are back online. Clocking in and sending reports need a connection.`,
      },
    ],
  },
  {
    id: 'start', title: 'Getting started (company)', roles: ['company'],
    sections: [
      {
        id: 'first', title: 'First sign-in, your Dashboard and company details', image: 'company-dashboard.png',
        body: `Sign in with the email and password you were given. Your Dashboard leads with Needs you: only what's waiting for you, most urgent first. A one-line summary sits under your greeting, Tonight & tomorrow shows cover at a glance (short shifts first), and This week shows hours, shifts and money. On a quiet night it simply says all clear.

Open Settings, then Company details, and fill in your company name, address, company number and VAT details. These appear on invoices, pay statements and reports.`,
      },
      {
        id: 'branding', title: 'Your logo and colour', image: 'settings-branding.png',
        body: `In Settings, then Company details, find Branding. Upload your logo (PNG or JPG, under 2 MB) and pick your brand colour.

- A wide logo on a transparent or white background works best.
- Empty borders around the logo are trimmed automatically when you upload it. If your logo looks small, upload it again.
- Your logo and colour appear in the app, on the sign-in page, and on incident reports, invoices, pay statements, agreements, QR posters, certificates and emails.`,
      },
      {
        id: 'style', title: 'Choosing the app style',
        body: `In Settings, under Branding, App style lets you pick how the app looks for everyone in your company.

- **Day** is light and warm, with an iPhone feel. It is the default.
- **Night** is black and gold and compact, with sharper corners and numbers in a console font. It is easier on the eyes at night and fits more on screen.
- **Soft** is neumorphic: everything is moulded from one soft surface, so cards and buttons look raised, fields look pressed in, and a button sinks when you press it.
- **Glass** puts frosted, see-through cards, menus and windows over a colourful blurred background.
- **Flat** is clean and simple: no shadows or gradients, bold solid colours and a plain sans-serif font.

Buttons use your brand colour in every style, or Opulence gold if you have not set one. Tap a style to preview the whole app, then Save to apply it for every manager, officer and venue user. Cancel goes back. Printouts, PDFs and emails always keep the light look. Every change is recorded in the audit log.`,
      },
      {
        id: 'modules', title: 'Choose which features you use',
        body: `In Settings you can switch optional parts of the app on or off for everyone, for example the Everyday feed, the Academy and the Toolbox. Switched-off features disappear from every menu.`,
      },
      {
        id: 'venues', title: 'Add clients and venues', image: 'venues.png',
        body: `Open Venues and tap Add venue. Add the venue name, address and postcode, and the client who pays for it (billing name, email and address).

On the venue page you can:
- set the site location and geofence, so officers can only clock in on site;
- print the venue's QR poster for officers to scan when they clock in;
- add instructions for officers (who to report to, radios, capacity);
- add venue managers, who get their own login to see their site.`,
      },
      {
        id: 'website', title: 'Your website: venue tiles and reviews',
        body: `Every active venue has its own tile in Clients on your website, grouped by city. Visitors tap a tile (or one of the Our services tiles) and it turns over like an airport departure board to show the details and reviews.

On the venue page, under Details:
- Show on website hides or shows the venue's tile;
- City puts the tile under that city, and Website link appears on the tile as Visit venue;
- Welcome line greets visitors until reviews arrive. Tap Write with AI or write your own;
- the venue photo becomes the tile's picture.

Praise from a venue appears in its Feedback tab. Switch Show on website on a praise card to put the quote on the venue's tile. It shows under the venue's name, never a person's, and you can take it down again at any time.`,
      },
      {
        id: 'staff', title: 'Add your officers', image: 'staff.png',
        body: `Open Staff and tap Add staff member. Enter their name, email, phone and SIA licence. The app checks licence expiry and warns you before it runs out.

For new starters use Recruitment: add an applicant, tick off onboarding tasks (right to work, documents, training), then activate them. You can email them an app login when they are ready.

Online applications: the "Join our team" button on the website opens the Apply page (/app/apply). Applicants upload a CV and a photo of their SIA badge; AI reads both and the person appears in Recruitment → Applicants marked New, with a summary, the SIA details from the badge and any flags (expired badge, name mismatch, licence not covering the role, possible duplicate). Open the card and check the SIA details, then Invite to onboarding (sends their app login and copies the SIA details to their profile) or Reject (optionally with a polite email). Applications not taken forward are deleted after 6 months.`,
      },
      {
        id: 'users', title: 'Invite managers and venue users',
        body: `In Settings, then Users & access, add security managers, venue managers and other company managers. Each person gets an email invite to set their password. If the invite email doesn't arrive, copy the invite or password reset link from the same screen and send it to them yourself.

Security managers run the day-to-day operation. Turn on Can see pay only for those who should see pay runs.`,
      },
      {
        id: 'rules', title: 'Workforce rules',
        body: `In Settings, then Workforce rules, set how pay and timesheets work: night and bank holiday uplifts, late grace minutes, GPS tolerance for clocking in, and how many days before timesheets are signed off automatically.

Under Roles and requirements, choose which SIA licences cover each role (for example Door Supervisor) and which documents officers need. The rota and the compliance check use these rules.`,
      },
    ],
  },
  {
    id: 'rota', title: 'Running the rota', roles: MGR,
    sections: [
      {
        id: 'shifts', title: 'Create and publish shifts', image: 'rota.png',
        body: `Open Rota. Tap + Add on a day (or the + next to a venue) and choose the venue, role, date, start and end time, break and how many officers are needed. Turn on Repeat to copy the same times to other days.

Tap Assign to put officers on the shift. Officers you assign are asked to confirm. When the week is ready, tap Publish so officers see it.`,
      },
      {
        id: 'checks', title: 'Clash and licence checks',
        body: `When you assign an officer the app checks that they hold a licence that covers the role, that their licence and documents are in date, that they are not on time off, and that the shift doesn't clash with another one. You'll see a warning and the reason before anything is saved.`,
      },
      {
        id: 'open', title: 'Open shifts and shift requests',
        body: `Turn on Open shift when you create a shift to let eligible officers request it from their app. Requests appear on the Rota page: Approve or Decline each one. Officers can also accept or decline offers you send them.`,
      },
      {
        id: 'cover', title: 'Cover requests from venues', image: 'cover.png',
        body: `Venues can ask for extra officers from their own login. These appear in Cover requests. You can Accept, Change (suggest different times or numbers) or Decline with a reason for the venue. Accepted requests can be offered as open shifts straight away.`,
      },
    ],
  },
  {
    id: 'day', title: 'On the day', roles: MGR,
    sections: [
      {
        id: 'live', title: 'Live operations', image: 'live.png',
        body: `Live operations shows every shift happening now: who is on site, who is late and who hasn't turned up. Alerts appear at the top. Tap a shift to see the officers, their clock times and the shift log. Orb's suggestions to approve sit beside the board (above it on a phone), and the round arrows run every Orb check straight away.`,
      },
      {
        id: 'clock', title: 'Clocking in and exceptions',
        body: `Officers clock in on their phone by scanning the venue's QR code and sharing their location. If the location or QR check fails, they can submit the clock-in as an exception with a reason.

Exceptions appear under Exceptions. Approve or Reject each one. Approved times go into the timesheet.`,
      },
      {
        id: 'log', title: 'Shift page and shift log',
        body: `Each shift has its own page with a shift log. Officers and managers add notes and photos as things happen, and can mark notes For handover so the next team sees them. On the shift page, tap Add handover note to write one straight away; the next team sees the last team's handover notes and photos at the top of their shift. The shift lead signs off the log at the end of the shift, and the venue can read it under Shift logs.`,
      },
      {
        id: 'incidents', title: 'Incidents', image: 'incident.png',
        body: `Officers report incidents from their phone: what happened, people involved, injuries, police or ambulance, force used, witnesses and photos. Managers and the venue are alerted straight away.

Open Incidents to review a report. You can request changes (the officer fixes and resubmits), close it, or download it as a branded PDF. Every edit keeps a version history.`,
      },
    ],
  },
  {
    id: 'money', title: 'Money', roles: ['company'],
    sections: [
      {
        id: 'timesheets', title: 'Timesheets', image: 'timesheets.png',
        body: `Clock times become timesheets. Open Timesheets to check the actual hours against the rota. You can Set times or Edit times if something is wrong, Approve, or send a Query. The venue signs off hours on their side too. Timesheets are signed off automatically after the number of days set in Workforce rules.`,
      },
      {
        id: 'payruns', title: 'Pay runs and statements', image: 'payrun.png',
        body: `Open Pay runs, choose the signed timesheets and tap Create drafts. A pay run moves through these steps:
1. Drafts created: check the statements.
2. Staff review: tap Send for review so each officer can approve their statement or raise a query.
3. Finalised: resolve any queries, then tap Finalise.
4. Issued: tap Issue. Each officer is emailed their remittance statement and a PDF copy is saved in their documents.
5. Paid: tap Mark paid when the money has gone out. Officers are told their payment is on its way.

Officers are self-employed: statements show that no tax or NI has been deducted.`,
      },
      {
        id: 'invoices', title: 'Invoices and credit notes', image: 'invoice.png',
        body: `Open Invoices and tap Generate invoices to bill venues for signed hours. Hours that are not yet approved are left out and listed so you can chase them. Each invoice can be downloaded as a branded PDF and emailed. Use a credit note to correct an invoice, and Export for your accountant.`,
      },
      {
        id: 'reports', title: 'Reports',
        body: `Reports shows hours, pay, invoicing and incident trends by venue and period, ready to export.`,
      },
    ],
  },
  {
    id: 'people', title: 'People', roles: MGR,
    sections: [
      {
        id: 'hr', title: 'HR file and documents',
        body: `Each officer's profile holds their details, SIA licence, right to work, documents, contracts, training and history. Documents have expiry dates and the app warns you and the officer before they run out. Send staff contracts and agreements from Staff contracts for officers to read and sign in the app.`,
      },
      {
        id: 'sia_check', title: 'Checking an SIA licence on the register',
        body: `On a profile's Compliance tab (or an SIA document, or an applicant), tap Verify SIA licence. When automatic checks are set up (SIA Checker), Opulence looks the 16-digit licence number up on the SIA register for you and fills in the status, expiry date and licence type; check the result (including the name) and tap Confirm & save check. Tap Check again to repeat it. If the automatic check can't answer, or isn't set up, open Check on the SIA website instead: Open register copies the licence number and opens the SIA public register, and the copy buttons hold the surname, first name and date of birth (shown masked to security managers). Record what the register shows (status, expiry, licence type, notes) and tap Confirm & save check. Every check is kept in the history and the audit log. A status other than Active (expired, suspended, revoked, under investigation or not found) blocks licensed shifts, raises an urgent Orb card and alerts company managers until a later check shows Active. Orb also reminds you when someone rostered on licensed work has never been checked, or the last check is over 90 days old.

If the register won't load, the problem is with the SIA's site or your connection: try mobile data instead of Wi-Fi, turn off any VPN or iCloud Private Relay, or start from gov.uk/check-a-private-security-licence. You can check on another device and still record the result here.`,
      },
      {
        id: 'esign', title: 'Contracts, policies and e-signatures',
        body: `Company managers send contracts, policies and pay rise agreements for officers to read and sign in the app. Each signed document becomes a branded PDF with a signing certificate, saved to the officer's documents.

1. Write or edit templates in Settings, then Templates. Use New template for a contract or New policy for a policy. Each save keeps the earlier version.
2. Draw your signature once under Your signature, and pick the Default company signatory who countersigns.
3. Open People, then Staff contracts, and tap Send for signature. Pick the template, the officers (a policy can go to every active officer at once), check the details and send.
4. Officers are notified and sign on their phone. Staff contracts shows who has signed and who is still awaiting. Tap Remind to nudge anyone who hasn't signed.

An unsigned contract can be voided. When a policy is updated, officers on an older version show on the template so you can send the new one.`,
      },
      {
        id: 'timeoff', title: 'Time off and holiday allowances', image: 'timeoff.png',
        body: `Officers request holidays and mark unavailability in their app. Requests appear in Time off under To decide. Use Add for officer to record sickness or time off on their behalf. Holiday allowances and the holiday year are set in Settings, and each officer's balance is shown on their profile.`,
      },
      {
        id: 'growth', title: 'One-to-ones, goals and ratings',
        body: `Record one-to-ones and goals on an officer's profile. Pay rise agreements can be sent for the officer to sign. Venues can rate the officers who worked their shifts, and ratings appear on the officer's profile.`,
      },
      {
        id: 'dual', title: 'Managers who also work shifts',
        body: `A company or security manager who also works on the door keeps one login. In Settings, then Users & access, open the manager and turn on Also works shifts. If they already had a second email for the officer app, choose Merge to move that staff record, with its shifts, pay and training, onto their manager login. The old officer login stops working. You can also link from People, then Staff: add or open a staff record with the manager's email and choose Link to their manager login.

They then switch between Manager and My shifts at the top of the menu or in My account. The app opens My shifts when they are clocked in or due on shift within 2 hours, otherwise Manager.

- Put them on the rota like any officer. Their shifts are marked You.
- Nobody approves their own hours or pay. Their timesheets, clock exceptions, pay queries, pay lines and pay rate are locked for them and go to another manager: another company manager, or a security manager who covers that venue (pay is company managers only).
- If they are the only manager who could approve, they can approve it themselves, and it is marked Self-approved on the timesheet, the pay statement and the audit log.
- Turning Also works shifts off keeps the staff record and its history. It just has no login any more.`,
      },
      {
        id: 'bans', title: 'Ejection log and bans',
        body: `Every ejection or refusal is logged from the shift page with Log ejection or ban: ejected or refused entry, the time, a reason category, a photo, name or description, and the reason. That is a record only and needs no approval. To also ban the person, switch on Also ban this person and choose a length (tonight, 1 week, 1 month, 6 months, 12 months, a date or permanent) and where it applies: this venue, all the client's venues, or every venue. A ban from an officer who is not leading the shift waits for the lead, a manager or the venue to confirm. Anyone in the Ejection log can be upgraded to a ban later with Upgrade to ban. Current bans are shown on the shift page, including ones from the client's other venues, so the team on the door can check them.`,
      },
      {
        id: 'training', title: 'Academy, Toolbox and compliance', image: 'training.png',
        body: `Training (the Academy) holds courses with lessons and quizzes. Assign courses to officers and track who has passed. Certificates are issued automatically.

The Toolbox holds quick guides for officers (first aid, situations, the law at a glance). The Emergency guide (step-by-step journeys for eight situations: knife, firearms, vehicle, explosion, unattended item, suspicious item, multiple casualties and helping an injured person, with "I'm in danger", Call 999 and Police arriving always on screen) is a draft waiting for clinical sign-off. The knife journey comes from the clinical handover pack; the other seven are AI first drafts for review, so only the people the platform admin allows can open it. The Emergency flowchart is live for everyone: a red "Emergency flowchart" button on every shift card (and a tile in the Toolbox) opens text-only cards with a question and 2-4 answers that build a trail as you go, every line quoted word for word from ProtectUK (and citizenAID for first aid), with "I'm in danger" and Call 999 always on screen. It never dials: you dial 999 yourself. Its banner reads "Guidance from ProtectUK and citizenAID. Always call 999 and follow the call handler." Its first-aid cards are still waiting for clinical review.

Compliance checks licences, right to work, documents and training against the rota. Tap Run check now, or turn on the weekly compliance email.`,
      },
    ],
  },
  {
    id: 'comms', title: 'Communication', roles: MGR,
    sections: [
      {
        id: 'messages', title: 'Messages',
        body: `Messages is private chat with officers, managers and venues. Start a new message, add people, and send text and photos. Unread messages show a count on the Messages icon.`,
      },
      {
        id: 'everyday', title: 'Everyday feed',
        body: `Everyday is the team news feed. Everyone on the team can post photos (crop, rotate and blur faces first), a short video, a link, a place or a venue, and tag colleagues. Use #topics to group posts. Comment and reply under a comment, react, save posts and share a post into a chat.
Shout-outs thank a colleague with a badge, and the badges show on their profile. Anyone can ask a quick poll. Managers can create events with places to RSVP, and pin announcements; an announcement can ask people to confirm they have read it, and managers see who has seen and confirmed it and can remind the rest.
Orb posts birthdays (only for people who opt in under My account), work anniversaries, welcomes for new starters and passed courses; switch each one off under Settings, Everyday.
Use the filters for Announcements, Shout-outs, Events, Polls, My venues and Saved, or search posts and comments. Managers can hide, remove, or pause someone's posting, and Orb AI checks posts and comments and holds anything serious for review.`,
      },
      {
        id: 'alerts', title: 'Notifications',
        body: `The bell shows alerts such as late officers, new incidents, cover requests and expiring licences. Choose which Everyday alerts you get under {account}, then Notifications. Critical alerts always come through.`,
      },
    ],
  },
  {
    id: 'ai', title: 'AI helpers', roles: MGR,
    sections: [
      {
        id: 'ops', title: 'Orb operations', image: 'ops.png',
        body: `Orb is your AI operations manager. It watches the rota, clocking, incidents and compliance, and suggests what to do next, for example filling an unfilled shift or chasing an expiring licence. Nothing changes until you approve it. Orb's cards are on Today, and the number on Today shows items waiting for you. It checks every 5 minutes; tap the round arrows at the top of Today to run every check straight away (no-show chasing, cover, site packs, hours and compliance). Its activity log is under the Orb menu (…) on Today.`,
      },
      {
        id: 'orb-settings', title: 'Orb settings and house rules', roles: ['company'],
        body: `Company managers find Orb's settings in Settings, Orb (or from the Orb menu on Today, Orb settings).

- What Orb does: switch each of Orb's jobs on or off.
- Timings: when Orb escalates a no-reply, how long it waits for cover replies, and the days of the weekly hours and compliance checks.
- House rules for Orb: write how your company likes things done, in plain sentences, up to 2,000 characters. For example "Prefer officers who have worked the venue before" or "Reports must have the Police Scotland incident number". Orb follows them in typed chat, voice and its advice on cards. They can't skip a Confirm tap, show pay to someone who can't see it, or bend the law.
- AI usage: how many AI credits Orb used this month, and the monthly cap.

Tap Save settings when you're done.`,
      },
      {
        id: 'knowledge', title: 'What Orb knows about security',
        body: `As well as this guide and your live data, Orb has a library of UK security know-how, with Scotland first: SIA licences, right to work, BS 7858 vetting, licensed premises and Challenge 25, use of force, ejections and arrest, searching and drugs, vulnerability and spiking, first aid, incident reports and evidence, data protection and ban lists, Martyn's Law, self-employed officers, lone working, events and working with venues.

Ask it things like "Can a door supervisor arrest someone?", "What ID can we accept?" or "What should an incident report with force used include?". It is general guidance, not legal advice: for a specific case, check with the SIA, Police Scotland or a solicitor.`,
      },
      {
        id: 'ask', title: 'Orb, your assistant',
        body: `Tap the round Orb button (the Opulence mark, bottom right at first) on any page to ask in plain English or to get something done, for example "Who is working at Harbour Arena on Saturday?", "Add a draft door shift there on Friday 21:00 to 03:00" or "How do I send a policy to everyone?".

- Orb knows this guide and looks up live data. It only sees and does what you can.
- Small, internal changes such as draft shifts, HR notes, onboarding ticks, assigning training and reminders happen straight away. They show as Done, with Undo where possible.
- Anything involving money, anything sent to people, deleting, bans, HR outcomes, settings and logins goes on a Confirm card. Untick any line you don't want, then tap Confirm.
- Everything Orb does is in the activity log, marked as done by Orb, under your name. Previous chats are under the clock icon.
- If the button is in the way, drag it anywhere on the screen. It stays where you leave it.`,
      },
      {
        id: 'photos', title: 'Incident photo checks and AI drafts',
        body: `When an officer attaches photos to an incident, AI checks them against the written report and points out anything that doesn't match. Officers can also get an AI draft of the report to check and edit before they submit.

AI features use credits from your plan. The usage is shown in Settings.`,
      },
    ],
  },
  {
    id: 'security', title: 'For security managers', roles: ['company', 'security'],
    sections: [
      {
        id: 'day', title: 'Your day',
        body: `Your Dashboard leads with Needs you (only what's waiting, most urgent first), then Tonight & tomorrow (cover at a glance, short shifts first) and This week (hours and shifts). Use Live operations during the shift, Rota for planning, and Exceptions and Timesheets to tidy up clock times. You see pay runs only if a company manager gives you access.`,
      },
    ],
  },
  {
    id: 'venue', title: 'For venue managers', roles: ['company', 'venue'],
    sections: [
      {
        id: 'overview', title: 'Your venue at a glance', image: 'venue-dashboard.png',
        body: `Your Overview shows who is on site now, the next 48 hours of shifts, timesheets to sign, recent incidents and invoices. On site shows the live picture for your venue. Timesheets show who worked and the charge rate you are billed.`,
      },
      {
        id: 'cover', title: 'Ask for extra officers',
        body: `Open Rota to see the week's shifts at your venue, who is booked and who is on site now. Tap Request staff (or Request staff on a day), choose the times, role and number of officers, and add a note. The security company replies, and you follow it in Rota under Requests or talk it through in Messages.`,
      },
      {
        id: 'sign', title: 'Timesheets, incidents and invoices',
        body: `- Timesheets: check and sign off the hours worked at your venue.
- Incidents: read reports from your site and download them as PDF.
- Shift logs: read what happened on each shift and the handover notes.
- Ejection log: everyone ejected or refused at your venue, and the people banned (from your venue or all your venues).
- Invoices: see and download your invoices.
- Rate staff: tell the company how the officers did. It takes a few seconds.`,
      },
    ],
  },
  {
    id: 'officer', title: 'For officers', roles: ['company', 'officer'],
    sections: [
      {
        id: 'home', title: 'Your home screen', image: 'officer-home.png',
        body: `The app has four tabs at the bottom: Home, Shifts, Learn and Me.

Home shows what you need to answer first (offers, shifts to confirm and your To do list), then what's booked, open shifts you can pick up, and any warnings (for example a licence about to expire). Cover offers sit under Needs your answer with Accept and Decline. From 15 minutes before your shift, Home becomes your shift card: clock in there. Once you're in, the top of Home shows how long you've been on shift with Start break, End break and Clock out, and under it four buttons: Report incident, Log ejection or ban, Add log entry and Handover. If the office cancels a shift you are clocked into, Home says so and you can still clock out.

Back always takes you to where you came from.`,
      },
      {
        id: 'shifts', title: 'Shifts, handover, clock history and picking up work', image: 'officer-shifts.png',
        body: `Shifts shows your calendar and list. Accept or Decline offers, and use Find open shifts to Request extra work. Set your Availability so managers know when you can work. Open a confirmed shift to see everything for it: the last team's handover notes and photos, report tiles, the shift log and the site pack. Tap Add handover note to leave one for the next team. If you can't make a confirmed shift, tap I can't work this on the shift page (under 24 hours, call the office too). Tap Clock history at the top of Shifts to see your past clock-ins.`,
      },
      {
        id: 'clock', title: 'Clock in and out', image: 'officer-clock.png',
        body: `1. Clock in from the shift card on Home (or on the shift page). Clock-in opens 15 minutes before your shift.
2. Allow location when asked, then Scan QR code (the venue poster).
3. Use Start break and End break during the shift (on Home or here), and Clock out at the end.

If the app can't confirm you're on site, tap Continue anyway, add a note and Submit as exception. It goes to your supervisor to approve.

First time? Register your clock-in phone under Me, Clock-in phone. A new phone shows Waiting for approval until the office approves it. You can still clock in meanwhile: your clock-in is just marked for a manager to check. Your clock-in phone only proves where you clocked in; it doesn't affect whether you can work.`,
      },
      {
        id: 'report', title: 'Report an incident',
        body: `Reports start from the shift. While you are clocked in, Home is your shift card: tap a report tile (Ejection / refused entry, Injury / first aid, Damage, Theft or Other) or Log ejection or ban there. A report you start saves itself as a draft and waits on the shift page until you finish it. For a shift that has finished, go to Shifts, then Past: shifts from the last 30 days have Report incident and Log ejection buttons. An ejection logged after the shift is marked as logged late. If it should be a ban too, ask the office. Follow the steps: what happened, people, injuries, police or ambulance, force, witnesses and photos. Managers and the venue are alerted straight away. If your manager asks for changes, the report appears in your To do list on Home. Me, then Reports, lists every incident report and ejection you have logged.`,
      },
      {
        id: 'me', title: 'Pay, time off, training and documents',
        body: `- Pay: your remittance statements. Check and approve each one, or raise a query.
- Time off and availability: ask for holidays and see your balance.
- Learn: your training courses, quick guides and certificates.
- Me: your details, documents, contracts to sign, goals and settings.`,
      },
    ],
  },
  {
    id: 'faq', title: 'FAQ and troubleshooting', roles: ALL,
    sections: [
      {
        id: 'appfeedback', title: 'Report an app problem or idea',
        body: `While the app is being fine-tuned, anyone can tell the Orb team what's wrong or what would make it better. Tap the glowing App feedback button next to the bell (the rainbow ring around a speech bubble on phones), or Report an app problem or idea in {account}. It isn't the Feedback page in the side menu, which is where venues comment on officers.

Choose Something's wrong or I have an idea, write what happened, and add up to 3 screenshots or photos if they help. The screen you were on, your device and the app version are added for you, so you don't need to explain where you were.

Only the Orb team reads feedback; your company managers don't see it. The platform admin's own account can only be changed by the platform admin. Open My feedback to see what you've sent, its status (New, Looking at it, Planned, Fixed or Not now) and any reply. You get a notification when we reply or fix it.`,
      },
      {
        id: 'clockfail', title: 'Clock-in is refused', roles: ['officer', 'security'],
        body: `Clock-in opens 15 minutes before the shift. Make sure location is allowed for the app (phone Settings, then the browser or Orb) and that you are inside the venue. If the QR code won't scan, tap I can't scan the code. You can always submit the clock-in as an exception with a note.

A clock-in phone that shows Waiting for approval never stops you clocking in. No phone yet? Register one under Me, Clock-in phone.`,
      },
      {
        id: 'password', title: 'I forgot my password', roles: ['company', 'security', 'officer'],
        body: `On the sign-in page tap Forgot password? and enter your email. If the email doesn't arrive, ask a company manager: they can copy a password reset link for you from Settings, then Users & access.`,
      },
      {
        // Venue managers only: the company already has its own answer above
        id: 'password_venue', title: 'I forgot my password', roles: ['venue'], only: true,
        body: `On the sign-in page tap Forgot password? and enter your email. If the email doesn't arrive, ask the security company's office: they can send you a password reset link.`,
      },
      {
        id: 'email', title: 'Emails are not arriving', roles: ['company'],
        body: `Check your spam folder. Until the company's sending domain is set up, some emails may not be delivered. Everything important is also in the app: invites and reset links can be copied from Settings, and statements and invoices can be downloaded.`,
      },
      {
        id: 'logo', title: 'Our logo looks small', roles: ['company'],
        body: `Upload the logo again in Settings, then Company details, Branding. Empty borders are trimmed on upload. A wide logo with little empty space around it looks best.`,
      },
      {
        id: 'notif', title: "I don't get phone notifications",
        body: `On iPhone, install the app to your home screen first, then turn notifications on from inside the installed app. On any phone, check that notifications are allowed for Orb in the phone's settings.`,
      },
    ],
  },
];

/** The chapters a role sees (company sees everything), with the company name filled in */
export function guideFor(role, companyName) {
  const name = companyName || 'Orb Security';
  // Each role is sent to the screen it has: officers keep their account under Me, everyone else under My account
  const account = role === 'officer' ? 'Me' : 'My account';
  const everyday = role === 'venue' ? ' Venue logins are not on Everyday, so there is nothing else to switch.'
    : ' On Everyday you can switch off comments, reactions, shout-outs, tags, events and celebrations.';
  const fill = (s) => s.replace(/\{company\}/g, name).replace(/\{account\}/g, account).replace(/\{everyday\}/g, everyday);
  const own = { company: 'start', security: 'security', venue: 'venue', officer: 'officer' }[role];
  const list = CHAPTERS.filter((c) => role === 'company' || c.roles.includes(role));
  // The person's own role chapter comes first, then install, then the rest in order
  list.sort((a, b) => (b.id === own) - (a.id === own));
  return list.map((c) => ({ ...c, sections: c.sections.filter((s) => !OFF().includes(s.id) && (!s.roles || (role === 'company' && !s.only) || s.roles.includes(role))).map((s) => ({ ...s, title: fill(s.title), body: fill(s.body) })) }));
}
