// The company user guide: one source for the in-app Help page and the PDF manual.
// body: paragraphs separated by a blank line; "- " lines are bullets, "1. " lines are steps.
// {company} is replaced with the company's name. Images live in the app under /app/help/.

const ALL = ['company', 'security', 'venue', 'officer'];
const MGR = ['company', 'security'];

export const CHAPTERS = [
  {
    id: 'install', title: 'Install the app on your phone', roles: ALL,
    sections: [
      {
        id: 'why', title: 'Why install it',
        body: `{company} runs in the browser, but installing it puts an icon on your home screen. It then opens full screen like any other app, starts faster, and can send phone notifications for shifts, alerts and messages.

You only need to do this once on each phone or computer. You stay signed in.`,
      },
      {
        id: 'android', title: 'Android phones and computers (Chrome or Edge)', image: 'install-card.png',
        body: `1. Sign in to the app in Chrome or Edge.
2. On your home page, tap Install the app on the "Get the Orb app" card. If you closed the card, open My account (managers) or Me (officers) and tap Install the app.
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
        body: `Open My account (managers) or Me (officers), tap Notifications, then Turn on. Allow notifications when your phone asks.

Shift and safety alerts always come through. You can switch the others (mentions, comments, announcements, training reminders) on or off.`,
      },
      {
        id: 'updates', title: 'Updates and working offline',
        body: `When a new version of the app is released, a "A new version of Orb is available" message appears. Tap Refresh to start using it.

If your phone loses signal, an amber "You're offline" bar appears under the top bar. The app still opens, but nothing is saved until you are back online. Clocking in and sending reports need a connection.`,
      },
    ],
  },
  {
    id: 'start', title: 'Getting started (company)', roles: ['company'],
    sections: [
      {
        id: 'first', title: 'First sign-in and company details', image: 'company-dashboard.png',
        body: `Sign in with the email and password you were given. Your Dashboard shows what needs attention today: who is on site, unfilled shifts, timesheets to approve, open incidents and money owed.

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

- **Classic** is light and rounded, with an iPhone feel. It is the default.
- **Control Room** is dark and compact, with sharper corners and numbers in a console font. It is easier on the eyes at night and fits more on screen. Buttons use your brand colour, or amber if you have not set one.

Tap a style to preview the whole app, then Save to apply it for every manager, officer and venue user. Cancel goes back. Printouts, PDFs and emails always keep the light look. Every change is recorded in the audit log.`,
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
        id: 'staff', title: 'Add your officers', image: 'staff.png',
        body: `Open Staff and tap Add staff member. Enter their name, email, phone and SIA licence. The app checks licence expiry and warns you before it runs out.

For new starters use Recruitment: add an applicant, tick off onboarding tasks (right to work, documents, training), then activate them. You can email them an app login when they are ready.`,
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
        body: `Live operations shows every shift happening now: who is on site, who is late and who hasn't turned up. Alerts appear at the top. Tap a shift to see the officers, their clock times and the shift log.`,
      },
      {
        id: 'clock', title: 'Clocking in and exceptions',
        body: `Officers clock in on their phone by scanning the venue's QR code and sharing their location. If the location or QR check fails, they can submit the clock-in as an exception with a reason.

Exceptions appear under Exceptions. Approve or Reject each one. Approved times go into the timesheet.`,
      },
      {
        id: 'log', title: 'Shift page and shift log',
        body: `Each shift has its own page with a shift log. Officers and managers add notes and photos as things happen, and can mark notes For handover so the next team sees them. The shift lead signs off the log at the end of the shift, and the venue can read it under Shift logs.`,
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
        id: 'bans', title: 'Bans',
        body: `Officers and venues can record people banned from a venue, with a photo and reason. The ban list is shown on the shift page so the team on the door can check it.`,
      },
      {
        id: 'training', title: 'Academy, Toolbox and compliance', image: 'training.png',
        body: `Training (the Academy) holds courses with lessons and quizzes. Assign courses to officers and track who has passed. Certificates are issued automatically.

The Toolbox holds quick guides for officers (first aid, situations, the law at a glance).

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
        body: `Everyday is the team news feed: announcements, shout-outs and updates. Managers can post, pin and moderate. Officers can comment and react if you allow it.`,
      },
      {
        id: 'alerts', title: 'Notifications',
        body: `The bell shows alerts such as late officers, new incidents, cover requests and expiring licences. Choose which alerts you get under My account, then Notifications. Critical alerts always come through.`,
      },
    ],
  },
  {
    id: 'ai', title: 'AI helpers', roles: MGR,
    sections: [
      {
        id: 'ops', title: 'Ops AI', image: 'ops.png',
        body: `Ops AI is your AI operations manager. It watches the rota, clocking, incidents and compliance, and suggests what to do next, for example filling an unfilled shift or chasing an expiring licence. Nothing changes until you approve it. The number on Ops AI shows items waiting for you.`,
      },
      {
        id: 'ask', title: 'Ask Orb',
        body: `Tap the sparkle button in the top bar to ask questions in plain English, for example "Who is working at Harbour Arena on Saturday?" or "How many hours did Marcus work last week?".`,
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
        body: `Your Dashboard shows today's shifts, people on site, exceptions and incidents. Use Live operations during the shift, Rota for planning, and Exceptions and Timesheets to tidy up clock times. You see pay runs only if a company manager gives you access.`,
      },
    ],
  },
  {
    id: 'venue', title: 'For venue managers', roles: ['company', 'venue'],
    sections: [
      {
        id: 'overview', title: 'Your venue at a glance', image: 'venue-dashboard.png',
        body: `Your Overview shows who is on site now, the next 48 hours of shifts, timesheets to sign, recent incidents and invoices. On site shows the live picture for your venue.`,
      },
      {
        id: 'cover', title: 'Ask for extra officers',
        body: `Tap Request cover, choose the date, times, role and number of officers, and add a note. The security company replies in Cover requests, and you can talk it through in Messages.`,
      },
      {
        id: 'sign', title: 'Timesheets, incidents and invoices',
        body: `- Timesheets: check and sign off the hours worked at your venue.
- Incidents: read reports from your site and download them as PDF.
- Shift logs: read what happened on each shift and the handover notes.
- Bans: see and add people banned from your venue.
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
        body: `Home shows your next shift, whether you need to confirm it, your hours, open shifts you can pick up, and any warnings (for example a licence about to expire).`,
      },
      {
        id: 'shifts', title: 'Shifts and picking up work', image: 'officer-shifts.png',
        body: `Shifts shows your calendar and list. Accept or Decline offers, and use Find open shifts to Request extra work. Set your Availability so managers know when you can work.`,
      },
      {
        id: 'clock', title: 'Clock in and out', image: 'officer-clock.png',
        body: `1. Tap the big Clock button. Clock-in opens 30 minutes before your shift.
2. Allow location when asked, then Scan QR code (the venue poster).
3. Use Start break and End break during the shift, and Clock out at the end.

If the app can't confirm you're on site, tap Continue anyway, add a note and Submit as exception. It goes to your supervisor to approve.`,
      },
      {
        id: 'report', title: 'Report an incident',
        body: `From the shift or Me, tap Incident reports and start a new report. Follow the steps: what happened, people, injuries, police or ambulance, force, witnesses and photos. Managers and the venue are alerted straight away. If your manager asks for changes, the report appears under Needs your attention.`,
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
        id: 'clockfail', title: 'Clock-in is refused',
        body: `Clock-in opens 30 minutes before the shift. Make sure location is allowed for the app (phone Settings, then the browser or Orb) and that you are inside the venue. If the QR code won't scan, tap I can't scan the code. You can always submit the clock-in as an exception with a note.`,
      },
      {
        id: 'password', title: 'I forgot my password',
        body: `On the sign-in page tap Forgot password? and enter your email. If the email doesn't arrive, ask a company manager: they can copy a password reset link for you from Settings, then Users & access.`,
      },
      {
        id: 'email', title: 'Emails are not arriving',
        body: `Check your spam folder. Until the company's sending domain is set up, some emails may not be delivered. Everything important is also in the app: invites and reset links can be copied from Settings, and statements and invoices can be downloaded.`,
      },
      {
        id: 'logo', title: 'Our logo looks small',
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
  const fill = (s) => s.replace(/\{company\}/g, name);
  const own = { company: 'start', security: 'security', venue: 'venue', officer: 'officer' }[role];
  const list = CHAPTERS.filter((c) => role === 'company' || c.roles.includes(role));
  // The person's own role chapter comes first, then install, then the rest in order
  list.sort((a, b) => (b.id === own) - (a.id === own));
  return list.map((c) => ({ ...c, sections: c.sections.map((s) => ({ ...s, title: fill(s.title), body: fill(s.body) })) }));
}
