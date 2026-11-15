// What's new: every upgrade to the platform, told as what it means for the business
import {
  ArrowRightLeft, BadgeCheck, Calculator, Ban, CalendarClock, BellOff, BellRing, Building2, CalendarDays, Check, Compass, ClipboardCheck, ClipboardList, FilePen, FileSignature, Fingerprint, Globe, Images, GraduationCap, LayoutGrid, LayoutList, LogOut, Mail, MessageSquareHeart,
  Megaphone, MessageCircleWarning, MousePointerClick, MessagesSquare, Newspaper, Nfc, Palette, PenLine, Pin, Radar, Radio, ReceiptText, ScanLine, ScanSearch, Scale, Send, SlidersHorizontal, ShieldAlert, Store, Timer, UserRound, Siren, Smartphone, Sparkles, Users, Wallet, Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Pill, Sheet } from '../../ui/index.jsx';

// Newest first; the first card is the latest release. `date` (the deploy day) puts a card in the login splash for two days.
// `image` is the card's picture in app/public/whatsnew (made with app/scripts/whatsnew-images.mjs); `icon` stands in without one
export const UPDATES = [
  {
    month: 'November 2026', date: '2026-11-15', icon: BadgeCheck, title: 'Screens that say what was checked, changed or booked', image: 'checked-and-changed',
    lede: "The fourth round of fixes from the three-portal review. Licences say whether anyone has checked them, signed hours say when they changed, ejections and bans have one clear name, and time off shows the shifts it clashes with.",
    points: [
      "Some licences that used to show \"Valid\" now show \"In date · not checked\": the date is fine, but nobody (and not Orb) has checked the licence yet. This is a label change only. Nobody who could work before is stopped now",
      "Company document rows say \"Checked by Orb\" when Orb checked a document, instead of \"Unverified\"",
      "Grace periods read the same everywhere: \"On grace until {date}: can work while they send …\" for managers, and \"You can work until {date}. Send by then: …\" for officers. An officer's Me screen shows \"On grace until …\" instead of \"Valid until …\"",
      "Hours changed after a venue signed say so: \"Venue signed …, before the hours were changed on …\" and \"Needs the venue to sign again\". History shows the old and new times, and the timesheet labels its rows Clock proof and Hours to pay and bill",
      "A pay run says what Finalise needs before you press it: open queries resolved, a choice for staff who haven't checked their statement, and unsigned shifts moving to the next run",
      "Every button that opens the door log now says Log ejection or ban. The full Ejection report is for force, injuries or police. Every ban states where it applies, \"This venue only\" included, and a one-night ban reads \"Tonight only\"",
      "Asking for time off over a shift you've accepted lists that shift before you save. Managers see \"Booked: …\" on the request. Nothing is cancelled for you",
      "Venue managers no longer see the staff-only Everyday alerts or the officer and branding help. Their Reviews page says whose website the reviews appear on",
    ],
  },
  {
    month: 'November 2026', date: '2026-11-15', icon: Scale, title: 'Honest money totals, clearer shift logs and plain wording', image: 'plain-words',
    lede: "The third round of fixes from the three-portal review. Money totals count only what is owed, shift screens say who signs off the log, and set-up, training, feedback and audit screens say what they mean.",
    points: ["A venue's Outstanding figure and its invoices to pay now count invoices only. Before, an issued credit note was subtracted from the total and counted as one more invoice, so the figure could look lower than what was owed. The company overdue total works the same way. No venue's figure changed on the day this went live, because none had an issued credit note", "When a venue has credit notes, the Outstanding tile says Credit notes are shown on Invoices", "The shift log says who signs it off: the shift lead by name, You lead this shift for the lead, or No lead on this shift: the office signs off the log", "An officer who has clocked out sees that they can still add notes until the log is signed off", "Shift chats name the venue and date, link to the shift with View shift, and mark the shift lead in the member list", "Set-up steps only the office can finish, such as checking documents, move out of the officer's To do list into a Waiting on the office group and no longer count as things for the officer to do", "Required shows only on courses assigned to that officer. Other mandatory courses say Usually required for door work, and empty training and certificate lists no longer suggest anything has been checked", "Feedback screens say how far back they go: 7 days to rate staff, 30 days of staff and shifts for feedback, 90 days for Don't send", "The audit log reads in plain words, such as Credit note issued, Timesheet approved or Contract sent, and shows the invoice number, person or venue instead of a short code. Show detail still has the full record"],
  },
  {
    month: 'November 2026', date: '2026-11-15', icon: Timer, title: 'Your shift, all in one place', image: 'shift-card-live',
    lede: "Once an officer clocks in, Home is the shift card and everything for that shift is on it. Officers can also report on finished shifts straight from their past shift cards.",
    points: ["Cover offers now sit with shifts to confirm under Needs your answer on Home, with Accept and Decline right there", "While on shift, the top of Home shows how long the officer has been on shift, with Start break, End break and Clock out", "Four buttons sit under it: Report incident, Log ejection, Add log entry and Handover", "Past shifts from the last 30 days have Report incident and Log ejection buttons. An ejection logged after the shift is marked as logged late, and only the office can turn it into a ban", "If the office cancels a shift while an officer is clocked in, Home says so and the officer can still clock out", "Uploading right to work, ID or proof of address ticks that set-up step on its own", "Me now runs in one order: My shifts, Training, Contracts, Documents, Profile and bank, Pay, Reports, Time off"],
  },
  {
    month: 'November 2026', date: '2026-11-15', icon: Compass, title: 'Screens that tell the truth, and Back that goes where you expect', image: 'clear-screens',
    lede: "The second round of fixes from the three-portal review. When something could not be loaded, the app now says so with Try again instead of showing nothing to do or All clear, and Back always leads somewhere sensible.",
    points: ["If a check fails, officers, managers and venues see Couldn't load or Couldn't check everything with Try again, never an empty list, a zero or All clear", "An officer's set-up steps read as things to do, such as Upload your SIA licence or Sign your contractor agreement, and change to past tense once done", "Past shifts shows only finished shifts the officer accepted, starting with the last 6 weeks, with Show older shifts to go further back", "Venue phones now show Overview, On site, Rota, Logs and More. Messages, with its unread count, and Venue info sit under More", "Back names the page it returns to (Rota, Feedback, Pay run, Shift logs, Goals and one-to-ones), even when the page was opened from a link or notification", "From Analytics and Reports, tapping incidents or feedback opens that list for the same venue and period, with a chip to clear it, and Back keeps the period and venue you picked", "Timesheets and Invoices say what is empty on each tab, such as Nothing to sign this week or No overdue invoices, and an empty week shows No hours this week", "Invoice amounts say incl. VAT, invoice lines are labelled Net, and the total reads Total incl. VAT. No figures changed", "The venue Overview leads with what needs the venue and the next 48 hours, and tiles with nothing open fold into one Nothing open line"],
  },
  {
    month: 'November 2026', date: '2026-11-15', icon: ShieldAlert, title: 'Fixes from the three-portal review', image: 'review-fixes',
    lede: "The first faults found in the review of the officer, manager and venue portals are fixed, so nobody lands on a blank page or a step that goes nowhere.",
    points: ["New incident reports open again for every type, including medical. A new report broke the page until a severity was picked; now Severity shows as an empty button to tap", "If an incident report ever fails to open, officers, managers and venues see a clear message with Back and Try again instead of a blank page. Anything already written stays saved as a draft", "An officer's Sign your contract step now says Waiting for the office to send your contract until one has been sent, and managers see Issue contract for that person. Once sent, the step opens that exact contract", "Analytics no longer shows a busiest hour when there were no incidents. It says No incidents in this period", "Venues asking for repeating cover can fill in each day on a phone without the row spilling off the screen (on the narrowest phones Staff moves onto its own line), and see the pattern in plain words before sending, such as Every Fri and Sat, 22:00–04:00 (overnight), 2 officers", "Back from weekly availability goes to Shifts even when the page was opened from a notification"],
  },
  {
    month: 'November 2026', date: '2026-11-13', icon: Calculator, title: 'Your website shows the full value you save venues', image: 'landing-savings-model',
    lede: "The figures on the public website now use your real working pattern, so venues see about 615 hours and £11,320 of admin time saved a year instead of the earlier cautious 138 hours.",
    points: ["Security staff shows your team of about 35 until everyone is onboarded, then switches to the live count by itself", "Hours saved come from your planning figures: a venue runs about 3 shifts a week with 3 officers, each officer saves the venue about 10 minutes of admin a week, and each shift saves about 5 minutes chasing a busy security manager", "The money figure values that time as venue admin staff time plus employer costs, and no hourly rate is shown on the page", "How we estimate this explains the shifts, officers and hours of cover behind the numbers, and that they are estimates", "Venue numbers stay live, so every new venue adds to the hours and savings shown"],
  },
  {
    month: 'November 2026', date: '2026-11-13', icon: MousePointerClick, title: "Your website's platform cards come alive", image: 'landing-platform-cards',
    lede: "On the public website, the three promises beside the venue portal (Up to date, More efficient, Compliant & secure) are now cards a visitor can pick, and the portal example switches to show each one in action.",
    points: ["Picking a card lights it up in gold, opens its three points and switches the portal example to match: who is on the door and a same-night report, a timesheet signing itself with the rota gap filling, or licence and right-to-work checks with a renewal alert", "On a computer the cards take turns on their own every few seconds while the section is on screen, with a gold line showing the time, and stop as soon as the visitor chooses one", "On phones the cards swipe side by side with gold dots beneath, and the portal example follows the card in view", "Keyboard arrows move between cards and screen readers hear each card's title, points and what the portal now shows", "Visitors who turn off motion get the same cards and screens without the animation. The wording is unchanged"],
  },
  {
    month: 'November 2026', date: '2026-11-13', icon: Timer, title: 'Your website shows what you save venues', image: 'landing-figures',
    lede: "The public website now shows how many venues Opulence protects and how many officers are on its books, live from the app, with the hours and money that saves venue teams each year.",
    points: ["Four gold figure cards after the venue portal example, under Less time chasing last night's shift: venues we protect, security staff, hours saved a year and money saved a year", "Venue and officer numbers update by themselves as venues and officers are added or retired in the app, with a Live figures note and today's date", "Hours come from small allowances for weekly timesheets, incident reports and cover requests; the money figure values them at £15 an hour plus employer National Insurance", "How we estimate this lists every allowance and assumption and makes clear the hours and savings are estimates. Opulence's own admin is never counted", "The numbers count up once as they come into view, stay still for visitors who turn off motion, and read out in full to screen readers"],
  },
  {
    month: 'November 2026', date: '2026-11-11', icon: Mail, title: 'Signed incident reports land in your inbox', image: 'incident-complete-email',
    lede: "When the venue signs an incident report, the venue's contacts and the manager who approved it get an email saying it is complete, with a button to open it.",
    points: ["The email has your company footer and an Open report button. Sign in and tap PDF for the sealed copy with its signing certificate", "The PDF is not attached, so the report never leaves the app", "Managers can now keep editing a report while it is back with the officer. The officer is told and signs the new version", "If two people save the same report at once, the second is asked to reload instead of overwriting the other's changes"],
  },
  {
    month: 'November 2026', date: '2026-11-11', icon: ScanSearch, title: 'Crop and blur photos in incident reports', image: 'incident-photo-edit',
    lede: 'Photos in an incident report can now be cropped, turned and have faces or details blurred before the report is signed, right from the writing page.',
    points: ["Tap a photo's pencil, then Crop or blur faces. Drag the box to crop, turn it with Rotate, or paint over faces, number plates or anything private with Blur", "The edited photo takes the place of the original in the same spot, keeping its caption and the section of the report it sits under", "Only the edited photo goes in the report and the signed PDF. Orb reads the edited version too", "Works on new reports and when an officer checks and signs a report again"],
  },
  {
    month: 'November 2026', date: '2026-11-08', icon: PenLine, title: 'Write incidents like notes, sign them together', image: 'incident-notes-sign',
    lede: "An incident report is now one page you write like notes. Orb turns the notes and photos into a factual, neutral report, then the officer, their manager and the venue each sign it.",
    points: ["Write freely and add things with small icons: photos, files, a person or witness, voice, police, ambulance or force used. Type / for the same list. Every change saves as a draft", "Tap Orb and it writes the report in plain, neutral language, with each photo placed under the part it supports and captioned. It asks about anything missing", "Edit any part, or ask Orb to redo one section, then sign on the screen to send it to your manager", "The manager signs to approve it, adds a statement, edits it (the officer then signs again) or sends it back with a note", "The venue signs to say they have received and read it. They get a reminder the next morning, then every two days", "Once everyone has signed, a sealed PDF with a signing certificate and QR check is filed under the venue's incidents. Reports filed before today work as they did"],
  },
  {
    month: 'November 2026', date: '2026-11-08', icon: BellRing, title: 'Answer from the notification', image: 'push-actions',
    lede: "Orb's most urgent questions now come with buttons on the phone notification, so an officer can answer without hunting for the message.",
    points: ['Cover offers: Accept or Decline straight from the notification. First to accept still gets the shift', "Running late: On my way from the notification tells the office you're coming, the same as replying in the app", "Site pack not signed: Sign site pack opens the pack, and Signing now tells the office you're on it", "Can't make it stays in the app, where you give a reason, so nobody is stood down by a stray tap on the lock screen. Buttons show on Android and desktop; on iPhone, tap the notification as before"],
  },
  {
    month: 'November 2026', date: '2026-11-08', icon: Sparkles, title: 'A smoother, more polished app', image: 'polish-motion',
    lede: 'On phones, everything waiting on you now folds into one glowing bar instead of a long list, and the whole app moves and responds more smoothly.',
    points: ["Needs you on Today, To do on the officer home, Needs your attention on Me and the venue dashboard are one slim bar on phones. It glows in the colour of the most urgent thing; tap it to open the full list. All clear shows in green", "Back closes the list, and the To approve chip opens it straight away", "More icons in place of words where the meaning is clear: section headings, counters, and view switches like Grid or List. The words are still there for screen readers and on hover", "Cards ease in as you scroll, numbers roll to their value, counts pop when they change, the tab underline glides between tabs, and the active tab in the bottom bar sits on a soft pill", "Icons react when you hover or tap: bells ring, arrows nudge, plus signs turn and send flies off", "With Reduce motion turned on in your phone or computer settings, all of this stays still"],
  },
  {
    month: 'November 2026', date: '2026-11-08', icon: LayoutGrid, title: 'More room for the work on every page', image: 'more-room-everywhere',
    lede: 'The tidier layout that started on the rota now runs through every page for managers, officers, venues and the platform. The list, table or board starts right under the tabs.',
    points: ["Search, filters and view switches now sit on the same line as the section tabs, not stacked in rows above the content", "Options you change less often are behind one Filters or Display button. It shows a number when something is changed, and Clear puts everything back", "Counters and summary chips only show when there is something to look at. Tap one to filter, as before", "On phones, the main control stays in view and the rest open in a sheet, so the content still starts near the top", "Nothing has been taken away. Every page still does exactly what it did before"],
  },
  {
    month: 'November 2026', date: '2026-11-08', icon: LayoutGrid, title: 'More room for the rota', image: 'more-room',
    lede: 'The first step in giving every page more room for the work itself. The rota grid now starts right under the tabs instead of halfway down the screen.',
    points: ["The week picker sits beside the Rota title, and By venue / By day / By officer and the venue picker sit on the same line as the tabs", "Shift requests is now a tab beside Week, Cover and Exceptions, with its number on the tab. Old links still open it", "Unfilled, Drafts, Unconfirmed and Requests only show when there is something to look at. Tap one to filter the grid, as before", "Card size and Hide empty venues are under Display. The button shows a number when something is changed from the usual", "Every page has a slimmer title with its subtitle on the same line. The other pages follow the same pattern next"],
  },
  {
    month: 'November 2026', date: '2026-11-08', icon: Mail, title: 'Every email now ends with your company details', image: 'email-footer',
    lede: 'Everything the app emails, and every email you send from the built-in mailbox, now finishes with a neat company footer, so whoever receives it knows exactly who it is from.',
    points: ["The footer shows your company name, address, phone, email, company number and VAT number, all taken from Settings → Company. Change them there and the next email follows", "Anything left blank in Settings is simply left out, with no empty lines", "Automatic emails (invites, shift offers, payslips, invoices, reminders and the rest) carry it inside the card, above the small Orb line", "Emails you or Orb send from the mailbox get your logo and the footer under your message, above the quoted email when you reply. Drafts get it when they are sent"],
  },
  {
    month: 'November 2026', date: '2026-11-08', icon: Palette, title: 'Three new looks: Soft, Glass and Flat', image: 'more-app-styles',
    lede: 'Settings → Look now has three more styles beside Day and Night. Pick the one your team likes, and every screen follows it on phones, tablets and computers.',
    points: ["Soft: a warm stone background with buttons, cards and icons that look gently raised, fields and switches pressed into the page, and buttons that sink in when you tap them", "Glass: frosted, see-through cards, menus and pop-ups over softly drifting colour, with glossy buttons and icons", "Flat: clean and bold, with solid colours, crisp outlines, simple icons and solid buttons with a light edge underneath", "Each style covers every portal: officers, managers, venues and the platform, including the side menu, the tab bar, lists, tables and pop-ups. Documents and certificates stay plain white for printing", "Your brand colour is still used for buttons in every style, and text stays easy to read. Day and Night are unchanged"],
  },
  {
    month: 'November 2026', date: '2026-11-08', icon: Ban, title: 'Every ejection in one register', image: 'ejections-register',
    lede: 'Incidents now has a second tab, the Ejections register: everyone ejected or refused entry at your venues, newest first, in one list instead of venue by venue.',
    points: ["Managers: Incidents → Ejections register lists every ejection and refusal across your venues, with who logged it and whether it became a ban. Pick a venue to narrow it down", "Log an ejection or ban someone from the register: it asks which venue when you are looking at all of them", "The current, ended and lifted bans are tabs of the same register, and the ⋯ menu exports the list to a spreadsheet for the licensing authority or the police", "Security managers see only their own venues. Each venue's own register is still on the venue page, and venues keep their Ejections tab under Logs"],
  },
  {
    month: 'November 2026', date: '2026-11-08', icon: SlidersHorizontal, title: 'More options, kept out of the way', image: 'streamline-options',
    lede: 'The last part of tidying up the app: new things you can do, each tucked into the ⋯ menu or shown only when it is useful, so screens stay clean.',
    points: ["Spreadsheets: Staff, Timesheets, Incidents, Time off and the Audit log can be exported from their ⋯ menu. Pay columns only go to people who can see pay, and venues never get officer pay or contact details", "Managers: Approve all on pending time off, and Close all when the Incidents list is filtered to Submitted. Officers can ask to swap a shift instead of dropping it, and the request opens Assign on that shift", "Officers: the shift page has Directions, Call office and Call venue. From Wednesday to Friday, Home asks if you are free this weekend when nothing is booked, and a new pay statement shows on Home for a week", "Venues: Request again on a past cover request, Message the office from On site and Ask the office on an incident, Don't send them again (the office decides), and bank details on Invoices while something is to pay", "Platform: demo requests have a status (new, contacted, won, lost) and open ones are listed first"],
  },
  {
    month: 'November 2026', date: '2026-11-08', icon: Zap, title: 'Fewer steps for everyday jobs', image: 'streamline-fewer-steps',
    lede: 'The third part of tidying up the app: the things you do most now take fewer taps, and the next step is waiting where you finish the last one.',
    points: ["Officers: Home lists any site pack to read before a shift in the next two weeks, and the shift card says so too. A warning about your SIA licence or right to work opens the upload straight away. Request an open shift right from Home", "Officers on shift: Report in the shift bar takes the kind of incident and one line, saved to finish later. Home reminds you with 'Finish your report'", "Managers: accepting a venue's cover request opens Assign on the new shift. The rota's Requests tab is now Shift requests", "Money: Invoices has Issue all drafts (only hours the venue has signed off are billed), and Timesheets has Send to pay run once the week is reviewed. Bring drafts up to date is in the ⋯ menu", "Onboarding steps on a profile have Do it, which opens the place to finish that step. Venues can sign off the whole week from Timesheets"],
  },
  {
    month: 'November 2026', date: '2026-11-08', icon: LayoutList, title: 'A shorter menu: each thing lives in one place', image: 'streamline-one-place',
    lede: 'The second part of tidying up the app. Related pages are now tabs of one section, so the menu is short and you always know where to look. Old links and bookmarks still work.',
    points: ['Managers: the menu is Today, Messages, Rota, Incidents, Staff, Venues, Money and Reports, with Learning and Settings at the bottom. Each section has tabs across the top', 'Staff holds Officers, Recruitment, Compliance, Contracts, Time off and Phones. Venues holds Clients, Site packs, Feedback and Reviews. Money holds Timesheets, Pay runs and Invoices. Rota holds Cover and Exceptions', 'Messages and Email are tabs of Messages. Training, Toolbox and Help are under Learning. Orb settings are only in Settings, Orb, and a contract drafted from a profile goes back to that profile', "Officers: Everyday is a tab in Messages, and Me is shorter: documents and licence, pay, details, time off, then reports and goals", 'Venues: the menu is Overview, On site, Rota, Logs, Feedback, Billing and Messages. My venue and the emergency guide are in the account menu'],
  },
  {
    month: 'November 2026', date: '2026-11-08', icon: Nfc, title: 'Fewer dead ends: tag taps, shift alerts and links that land in the right place', image: 'streamline-fixes',
    lede: 'The first part of tidying up the whole app: small fixes so each tap goes straight to the thing you need.',
    points: ['Managers who also work shifts: tapping the NFC tag clocks you in when you are due on shift there, even from the manager side, and opening the app before a shift takes you to My shifts. Your shift bar shows on the manager side too', 'Officers: a new shift alert opens that shift, with Accept and Decline right there', 'Compliance: Open in Today now opens that exact card', "Venues: 'timesheets to sign' opens the list filtered to the ones to sign", 'Old settings links and wording fixed, and an unused venue chat switch removed'],
  },
  {
    month: 'November 2026', date: '2026-11-08', icon: GraduationCap, title: 'Orb knows security, and Orb settings are in Settings', image: 'orb-knowledge',
    lede: "Orb now has a library of UK security know-how, with Scotland first, so it can answer questions about the law and good practice as well as the app. Your house rules are filled in to start with, and Orb's settings have moved to where you'd look for them.",
    points: ["Ask Orb (typed or by voice) about SIA licences, right to work, BS 7858 vetting, licensed premises and Challenge 25, use of force, ejections and arrest, searching and drugs, spiking and welfare, first aid, incident reports, data protection, Martyn's Law, self-employed officers, events and venues", "Scots law and the Licensing (Scotland) Act come first. Orb says when something is general guidance rather than legal advice", "Orb's advice on compliance cards now draws on the SIA and right to work guidance", "Orb settings now live in Settings, Orb (still in the Orb menu on Today too)", "House rules for Orb start with a set written for the company: Scotland first, self-employed officers, cover preferences, hours, venues and incidents. Edit them any time"],
  },
  {
    month: 'November 2026', date: '2026-11-08', icon: Sparkles, title: 'Orb can do more, and follows your house rules', image: 'orb-more-skills',
    lede: "Orb's cards now give you more ways to deal with things, and Orb can do more for you in chat and by voice. Anything that changes records or reaches people still waits for your Confirm tap.",
    points: ["New in Orb settings: House rules for Orb. Write how your company likes things done and Orb follows it in chat, voice and its advice on cards (it can't skip a Confirm tap, show pay to the wrong person or bend the law)", "Compliance cards: mark a document you've checked yourself as verified, ask for a clearer photo, check the SIA register there and then, let a fixed-term contract end, remove a role their licence doesn't cover, and take them off shifts when right to work isn't sorted", "Cover: when you reject Orb's picks, choose to offer the next officers, use agency staff or leave the shift unfilled. Feedback: add an HR note, reply to the venue, or stop the officer going there again. Hours check: say whether the rota or the clocked hours are right", "New Incident card: when the photos or files don't match a report, or details are missing, Orb tells you what and drafts a message sending it back to the officer", "Ask Orb to give or extend a grace period, ask an officer for a document, re-file an upload, check the SIA register, run the compliance check, or offer an open shift to several officers at once"],
  },
  {
    month: 'November 2026', date: '2026-11-08', icon: BadgeCheck, title: 'More ways to sort right to work ticked by hand', image: 'rtw-hand-ticked',
    lede: "When someone's right to work was ticked by hand with no evidence or saved check, Orb's card now says the same as their profile and gives you choices instead of just a note.",
    points: ['Record their British or Irish passport as the evidence, when a good one is on file', 'Remind them to upload their passport or a share code (ticked when there is no passport to use)', "Have Orb read their passport again when it couldn't use it the first time", "Not sure? Untick right to work and give them 14 days to send it: they keep working on a grace period, Orb chases them, and it closes by itself when the document is in (company managers)", 'Cards raised before today are refreshed with the new wording and choices'],
  },
  {
    month: 'November 2026', date: '2026-11-08', icon: ArrowRightLeft, title: 'Documents sent under the wrong type are put right', image: 'doc-refile',
    lede: "An officer who uploads their passport as Proof of address, or their SIA card as Right to work, no longer leaves a gap on their profile. Orb spots it, files it where it belongs and carries on. Managers can also change any upload's type themselves, and the Right to work tile has its own Edit.",
    points: ["Orb now also reads Proof of address and Other uploads; a passport or SIA card found there is moved to Right to work or SIA licence, and the officer is told", "An upload a manager already checked isn't moved: Orb raises a card on the Compliance page with a Re-file button instead", "In the profile's Documents, the new Edit (pencil) changes an upload's type, title, number or expiry; uploads that look wrong are marked in amber", "Right to work ticked by hand with no evidence: Orb fills in British or Irish passport from their passport, or offers it on their Compliance card for you to approve", "The Right to work tile's Edit now opens just the evidence, expiry and an upload, without the SIA fields; British passport and Irish passport are in the list"],
  },
  {
    month: 'November 2026', date: '2026-11-08', icon: CalendarClock, title: 'Grace periods right on the licence and right to work cards', image: 'grace-on-cards',
    lede: "Giving an officer a grace period now sits where the problem is. The Grace period button is on Orb's compliance cards on Today, on each officer's card on the Compliance page, and on the SIA licence and Right to work tiles of their profile.",
    points: ["On the Compliance page each officer now appears once: a red Can't work line or an amber On grace line sits at the top of their card, with Give or Extend grace period beside it", "Filters at the top (Everyone, Can't work, On grace) replace the separate lists, and the Can't work link on Today opens the page filtered", "On Today, an Orb card about a missing SIA licence or right to work has a Grace period button next to Open profile; it works out whether to give a new one or extend the last", 'On the profile, the button sits on the SIA licence or Right to work tile that stops them working; the Grace period tile only shows an open grace and the history', 'Company managers only, as before; security managers see the status but not the buttons'],
  },
  {
    month: 'November 2026', date: '2026-11-08', icon: CalendarClock, title: 'Time to send documents: grace periods', image: 'grace-periods',
    lede: "An officer who can't work because a document is missing or out of date can now be given a grace period of up to 14 days. They keep clocking in and being rostered while they send it, Orb chases them, and the grace closes by itself once the documents are in.",
    points: ["On the Compliance page, Can't work lists everyone blocked, with Give grace period on each (company managers)", 'Pick 7 days, 14 days or a date, give a reason and choose what it covers; it can be extended twice, each time with a reason', 'Covering an expired SIA licence, an SIA register problem or expired right to work needs a tick to accept the risk', 'The officer sees You can work until … on their Home, and is reminded 3 days and 1 day before it ends', "When it runs out with the documents still missing they are blocked again, and Orb's compliance card offers to take them off their shifts and find cover", 'Today shows grace periods ending within 3 days; the profile, staff list (On grace filter) and the rota mark who is on one', 'Not active staff can\'t be given one; every grace, extension and ending is in the audit trail and the officer\'s history'],
  },
  {
    month: 'November 2026', date: '2026-11-08', icon: LayoutGrid, title: 'Today: everything in one place', image: 'today-one-page',
    lede: "Dashboard and Live operations are now one page, Today. Who is on the floor sits on the left, and one Needs you list on the right holds everything waiting for you: Orb's cards and the other to-dos together, most urgent first.",
    points: ['The row of chips under the greeting filters the floor (On site, Late, No-show, Issues and more); Short shifts and To approve jump to their section', "Needs you starts with what can't wait (clock exceptions, unfilled shifts, officers who can't work), then Orb's cards to approve, then timesheets, incidents, cover, time off and documents expiring soon", 'Approving a card updates the count on Today in the menu straight away', 'Orb activity and Orb settings are under … at the top of Today', "On phones, Needs you comes first, then the floor, then tonight's shifts", 'The Compliance lists and Staff pipeline now live on the Compliance and Recruitment pages; old Live operations links open Today'],
  },
  {
    month: 'November 2026', date: '2026-11-08', icon: ScanSearch, title: 'Orb clears more Compliance cards on its own', image: 'orb-reads-closer',
    lede: "Orb now reads uploaded SIA cards and passports the way a person would. It looks at the front and back of a card together, and it doesn't count a smudged letter or an unreadable name as a different person when the photo or the licence number shows who it is. Everyone's uploads are being read again, so many of the cards on the Compliance page close by themselves.",
    points: ["Front and back of an SIA card count as one card, so the back (no name printed) no longer raises a name card", 'A reading slip in the surname (A. ADULOJILII for Aduloju), or the surname alone, is accepted when the photo or the licence number matches', "Part of a licence number that fits the profile number counts as a match; a number that wasn't read fully gets a quiet card with no Update button", "Expiry dates a few days apart: Orb takes the earlier date, the safe one, on the profile. Bigger gaps still come to you", "Right to work ticked by hand: a British or Irish passport whose photo matches now saves Orb's check, labelled Copy only", "No profile photo? Orb compares the passport photo with their SIA card photo instead, and reads PDFs too", "Right to work not verified now says why: a non-British passport needing a share code, or a photo Orb couldn't confirm", "Each person's Compliance card updates within minutes of Orb re-reading their files, not at the weekly check; a card only closes once nothing is left on it", "A passport uploaded as Right to work shows in the Right to work section straight away, even before Orb has read it","Still for you: a name that's clearly different, an obscured passport and share codes to check on GOV.UK"],
  },
  {
    month: 'November 2026', date: '2026-11-08', icon: ScanLine, title: 'Uploads make officers compliant on their own', image: 'orb-auto-compliance',
    lede: "When an officer uploads their SIA card or passport, Orb now reads it straight away and, when everything on it agrees with their profile, fills it in for you. The SIA licence lands on the profile, and a British or Irish passport confirms right to work, with no manager steps.",
    points: ['SIA card: number, type and expiry go onto the profile, and with SIA Checker on the register is checked straight away', 'Names: S SCANLON is accepted for Scott Scanlon when the licence number or the photo on the card matches the profile', 'British and Irish passports: right to work is marked verified by Orb, clearly labelled Copy only — original not seen in person; Check again in person whenever you like', 'Anything that disagrees (another name, a different photo, an expired card) is still left for you on the Compliance page', 'The Compliance tab now shows the SIA card and passport pictures; tap one to see it full size', 'Every attachment (documents, payslips, invoices, message and email files) now opens inside the app, with Download there if you want a copy', 'Uploads already on file are re-read in the next few minutes, so officers who sent theirs before today are sorted too'],
  },
  {
    month: 'November 2026', date: '2026-11-08', icon: Smartphone, title: 'Everything about your work comes to your phone', image: 'work-notices',
    lede: "Anything about your own shifts, timesheets, pay, documents, training or messages now comes to your phone with its normal sound, shows on the lock screen and adds to the red count on the app icon. It can't be switched off. Managers can mark an Everyday post as an Important notice, and it reaches everyone the same way.",
    points: ['Officers are now told when a timesheet is approved or changed by a manager, when a document is checked and when their right to work is confirmed', 'Payments sent, HR notes, training, pay rises, invoices and replies to feedback now come to the phone, not only the bell', 'Important notice is under the box when a manager writes a post, poll or shout-out; the post gets an Important notice label in the feed', 'Only Everyday likes, comments, tags, shout-outs, celebrations and event reminders can be switched off', 'Managers still get notes that someone signed a contract, policy or venue pack under the bell only', 'Sound and vibration follow the phone: normal mode rings, silent mode and Do Not Disturb stay quiet'],
  },
  {
    month: 'November 2026', date: '2026-11-08', icon: Megaphone, title: 'Tell everyone from Everyday, and a red count on the app icon', image: 'everyday-notify',
    lede: "Managers can now switch on Notify everyone when they post on Everyday, and every member of staff gets it on their phone. The installed app's icon also shows a red count of unread notifications, like any other app.",
    points: ['Notify everyone is under the box when a manager writes a post, poll or shout-out; leave it off and the post just appears in the feed as before', 'Announcements made by pinning a post now reach phones too, not only the bell', 'Anyone who has switched off Announcements from managers in Notifications isn\'t sent them', 'The red count on the app icon goes down as notifications are read under the bell, and goes away when they are all read', 'The count shows on iPhone (home-screen app, iOS 16.4 or later) and Android once phone notifications are on'],
  },
  {
    month: 'November 2026', date: '2026-11-08', icon: BellRing, title: 'The phone only buzzes when it matters', image: 'notify-tiers',
    lede: "Every notice now has a level. Urgent ones (a no-show, a high-risk incident, a shift cancelled at short notice) come to the phone and by email. Things to do today come to the phone. Everything else waits quietly under the bell.",
    points: ['Urgent: phone, email and bell, and on Android the alert stays on screen until it is seen', 'Action: phone and bell, for new shifts, cover, late clock-ins, queries and things to sign', 'FYI: bell only, for contracts signed, payments sent, applications, reactions and the like', 'Clients now hear straight away when an officer can\'t make it to their venue, and again when a replacement is confirmed', 'The Orb platform account no longer gets Opulence\'s day-to-day alerts, only platform matters such as demo requests and app feedback'],
  },
  {
    month: 'November 2026', date: '2026-11-08', icon: BellRing, title: 'Phone notifications you can check', image: 'push-test',
    lede: "Anyone can now check phone notifications work, from their own phone, in one tap: Notifications → Send a test. If the phone's notification service turns it down, it says why, so it can be fixed instead of guessed.",
    points: ['Send a test in Notifications (account menu, or Me for officers) sends a notification to this phone only', 'If it doesn\'t arrive, it says what to check: phone settings, Focus or Do Not Disturb, or an expired sign-up to turn on again', 'Every sign-in now re-saves the phone\'s notification sign-up, so a phone that said "On" but never got anything starts getting them', 'Shift, cover and safety alerts are sent as urgent, so phones in battery saver deliver them straight away'],
  },
  {
    month: 'November 2026', date: '2026-11-08', icon: LogOut, title: 'Clock out an officer who forgot', image: 'manager-clock-out',
    lede: "When an officer forgets to clock out, a manager can now do it for them in two taps: choose now, the shift end or another time, pick a reason, done. Their real clock-in and its checks stay as recorded, the timesheet updates, and the officer gets a notification.",
    points: ['Live operations: open an officer who is on shift and tap Clock out; anyone still on after their shift ended shows Past shift end', 'Rota: Clock out is in each clocked-in officer\'s … menu', 'Timesheets: shifts closed at the scheduled end because nobody clocked out get Set clock-out time, so the hours match what was really worked', 'Unlike Set times manually, their clock-in, phone, location and selfie checks are kept', 'The officer is told who clocked them out, when and why, and it is kept in the timesheet history and audit log'],
  },
  {
    month: 'November 2026', date: '2026-11-07', icon: BellRing, title: 'Phone set-up and notifications, sorted', image: 'phone-and-push',
    lede: "Officers are now asked to register their clock-in phone before their first shift, with a Register now button on their Home page, so clock-ins stop showing \"Phone not verified\". Everyone is also asked to turn on phone notifications, so shift offers, changes and safety alerts arrive straight away.",
    points: ['Officers without a clock-in phone see a Register now card on Home (amber when a shift starts within 24 hours) and a button in Profile; it takes seconds, with their face, fingerprint or PIN', 'Opened on a laptop, it shows a code to scan instead, so the laptop never becomes the clock-in device', 'On a new phone, the clock-in check offers Use this phone instead; a manager still approves it under Exceptions → Phones', 'Exceptions → Phones lists active officers who haven\'t registered a phone, and Staff has an App set-up filter and column: No phone, No notifications', 'Each officer\'s profile shows whether their phone is registered and whether notifications are on', 'Every Home page shows a Turn on notifications card until this device has them; Not now hides it for a week, and on iPhone it explains Add to Home Screen first'],
  },
  {
    month: 'November 2026', date: '2026-11-07', icon: CalendarDays, title: 'A clearer Rota', image: 'rota-layout',
    lede: "The Rota now opens on the week by venue: venues down the side, the seven days across, and a totals row underneath so you can see at a glance where places are still open. Cards show who is on each shift and how many places are left.",
    points: ['The whole week fits on a laptop screen; day names and venue names stay in view as you scroll, and today is highlighted', 'Totals under the grid show open places, drafts and hours booked for each day; tap the red count to see just the unfilled shifts', 'Quick filters for Unfilled, Drafts, Unconfirmed and Requests, and empty venues are hidden', 'Cards show faces for who is on and a dashed circle for each open place; unconfirmed shifts have a clock, drafts a dashed edge', 'Comfortable or compact cards, remembered on your computer', 'In a shift, ‹ › or the arrow keys move to the next shift, and each officer\'s actions sit under one … menu', 'On phones, pick a day from the strip at the top (a red dot marks days with open places) and see its shifts by venue', 'Repeat shift, Copy last week and Print are under … beside New shift'],
  },
  {
    month: 'November 2026', date: '2026-11-07', icon: BellOff, title: 'Orb stops repeating itself', image: 'orb-no-repeats',
    lede: "Once you've decided an Orb card, it stays decided. Orb only raises it again when something behind it actually changes, such as a new document, a new website or new profile details. Names on documents now match however they're written.",
    points: ['A dismissed "No logo" card stays dismissed, and uploading a logo clears the card straight away', 'Approving part of a venue setup card (say, just the radius) dismisses the rest, so it doesn\'t come straight back', 'Declining a document or photo card keeps it quiet until that document or the profile changes; Re-check reads the scan again from fresh', 'Names match whatever the capitals, accents or punctuation: Scott and SCOTT, O\'Brien and OBRIEN, Mc Donald and MCDONALD, and a middle name on the SIA register', 'The phone chip on a clock-in says why: Phone skipped or Phone not recognised'],
  },
  {
    month: 'November 2026', date: '2026-11-07', icon: Radio, title: 'Live operations, laid out better', image: 'live-ops-layout',
    lede: "On a computer, Live operations now gives the board the full width it needs, one card per venue, with Orb beside it in its own scrolling column. Orb cards that need a fix by hand, like a missing logo, take you straight to where you fix it.",
    points: ['Each venue is one card: its name, how many are on site and the Shift card button along the top, then the officers', 'Orb scrolls on its own beside the board, so the page stays the same length however many cards are waiting; Decided and Select several are under its three dots', "Cards with nothing for Orb to apply show Open Setup (or the officer's profile) and Dismiss, and clear by themselves once the detail is added", 'Flagged clock-ins show as a banner at the top with a link to Exceptions', 'Filters with nobody in them step back, so the ones that matter stand out', 'Updated time and the refresh button sit beside the tabs'],
  },
  {
    month: 'November 2026', date: '2026-11-07', icon: Smartphone, title: 'A tidier top bar on phones', image: 'phone-top-bar',
    lede: "On phones, when you scroll down a page its title moves into the black bar at the top. The logo now steps aside for it, so the two no longer sit on top of each other. Pay runs also names your pay period properly.",
    points: ['The page title in the top bar no longer overlaps the logo when you scroll', 'The logo comes back as soon as you scroll to the top', 'Pay runs says which pay period it uses (weekly unless you chose otherwise in Settings) instead of "undefined"'],
  },
  {
    month: 'November 2026', date: '2026-11-07', icon: Sparkles, title: 'Clearer pages across the app, with one main button each', image: 'clearer-everywhere',
    lede: "The remaining pages had the same clean-up: one main button at the top, everything else under the three dots, and your filters and date ranges kept in the page address so Back returns to the same view. On phones, the things that need you come first.",
    points: ['Dashboard and venue home: Needs you comes first on phones; venue managers see timesheets to sign, late officers and invoices to pay at the top', 'Exceptions and Reviews are now in the side menu', 'Invoices: Bring up to date is the main button; each invoice shows the one next step for its status', 'Pay: a one-line summary with Pay runs and Statements tabs; Reports and Analytics keep their date range at the top as you scroll, with jump links to each section', 'Reviews: an On the website switch on each review; each message has a three-dot menu with the same options as a long press', 'Officers: Shifts opens on Offers when one is waiting, My details saves from a bar that stays in view, Learn starts with the Emergency guide, and passwords can be shown while typing'],
  },
  {
    month: 'November 2026', date: '2026-11-07', icon: LayoutGrid, title: 'Lists remember your filters, records open beside the list', image: 'lists-drawers-records',
    lede: "Timesheets, Rota, Cover requests, Staff, Venues and Compliance now keep your filters in the page address, so Back brings you to the same view. On a computer, timesheets, shifts and cover requests open in a panel beside the list, and the arrow keys step to the next one. Staff profiles, venues and Settings are grouped into fewer, clearer tabs.",
    points: ['Approve or decline several rota requests or clock-in exceptions at once', 'Each timesheet row has one clear button (Approve or Sign off); the rest are under the three dots', 'Staff list view: name, role, SIA expiry, status and compliance in one table', 'Venues missing an address, map pin or logo show Setup incomplete', 'Staff profile tabs: Overview, Compliance, Work, Pay and HR; venue tabs: Setup, People, Instructions, Feedback, Records, Analytics', 'Long forms ask before throwing away unsaved changes, and save from a bar that stays in view'],
  },
  {
    month: 'November 2026', date: '2026-11-07', icon: Radio, title: 'Your shift in one bar, and Live operations made easier to scan', image: 'shift-bar-live-drawer',
    lede: "Officers now have their shift in a bar above the tab bar on every page, from the moment clock-in opens until they clock out. It holds the next step, Report an incident and the Emergency guide. In Live operations, each person opens in a panel on the right on a computer, so the board stays in view, and one row of filters remembers your choice.",
    points: ['Officers: Clock in, Clock out or End break, one tap from any page during the shift', 'Report an incident and the Emergency guide sit beside it, one tap away', 'Officer Home opens with the next shift; offers and reminders are one-line rows below it', 'Live operations: a single filter row (On site, Late, No-show and more), kept when you go back', 'Open a person to see them in a side panel; step through people with the arrow keys; Call and Open shift card at the bottom', 'On phones, Orb\'s approvals have their own To approve tab, so the board comes first'],
  },
  {
    month: 'November 2026', date: '2026-11-07', icon: Building2, title: 'Venue managers with several venues: a tile for each venue', image: 'multi-venue-tiles',
    lede: "Venue managers who look after more than one venue now see a tile for each venue on their home page, showing who is on site, who is late, the next shift and anything waiting for them. Tap a venue and every page shows just that venue until they switch back to All venues.",
    points: ['A tile for each venue: on site, late, the next shift, timesheets to sign, staff requests and incidents this week', 'Tap a venue to see only that venue on the Rota, On site, Timesheets, Incidents, Shift logs, Invoices and Feedback pages', 'Switch venue from the top of any page; the app remembers the choice', 'All venues shows everything together, with the venue name on each row', 'Staff requests, ratings and bans go to the venue they are for; the app asks which venue when it is not clear', 'The staff setup form lets a venue manager write down every venue they look after', 'Managers with one venue see no change'],
  },
  {
    month: 'November 2026', date: '2026-11-07', icon: UserRound, title: 'New staff get a welcome post with their photo', image: 'welcome-post',
    lede: "The moment a new officer or manager signs in for the first time, Everyday welcomes them to the team with a post everyone sees. Their profile photo sits at the centre of the post, and if they add one later, it appears there by itself.",
    points: ['Posted on their first sign-in, not the next morning', 'Their profile photo, name and role on the post', 'No photo yet: their initials, then their photo once they add it', 'Every new joiner who uses the app, including people hired from applications', 'They are notified, and can take the post down themselves'],
  },
  {
    month: 'November 2026', date: '2026-11-07', icon: BadgeCheck, title: 'Right to work checks, from share code to saved record', image: 'rtw-check',
    lede: "Officers can now send their right to work share code from the app or the staff setup form. It goes straight to Compliance, ready to check. Check right to work takes you to GOV.UK with the code and date of birth to copy. You then upload the GOV.UK page, the AI reads the result, and the check is saved as your record.",
    points: ['Officers type their share code, or send a screenshot and the AI picks the code out', 'Compliance shows each share code ready to check, and asks for a new one when it is over 80 days old', 'Upload the GOV.UK PDF: the name, no time limit or end date are filled in for you', 'British or Irish passport: record your in-person check with a copy', 'Time-limited permission: reminders for the follow-up check before it ends', 'Right to work is only marked verified with a saved check; ticks made by hand are flagged to redo'],
  },
  {
    month: 'November 2026', date: '2026-11-07', icon: Mail, title: 'App emails now come from your company', image: 'email-sender-name',
    lede: "Every email the app sends (invites, password resets, notifications, contracts to sign, application updates) now shows your company name as the sender, so staff and clients recognise it straight away. When someone replies, the reply goes to your company email.",
    points: ['The sender name is the company name in Settings → Company', 'Replies go to the email in Settings → Company', 'Change either one there and the next email uses it', 'The look of the email is unchanged: your logo and colour'],
  },
  {
    month: 'November 2026', date: '2026-11-07', icon: Mail, title: 'See when an invite was emailed', image: 'invite-sent-status',
    lede: "Every invite now shows whether its email went out, and when. Open someone's login in Settings → Users, or their staff profile, and you can see at a glance whether to wait for them or send the link another way.",
    points: ['"Emailed on Sat 7 Nov, 14:02", "The last email didn\'t go through" or "Not emailed yet", next to the invite link', 'Resend invite updates it straight away', 'If it was sent but never arrived, copy the link and send it by WhatsApp or text', 'Invites sent before today show as not emailed yet, until they are sent again'],
  },
  {
    month: 'November 2026', date: '2026-11-07', icon: Send, title: 'Staff setup: create and send the invite in one tap', image: 'staff-setup-invite',
    lede: "When an officer or venue manager sends their details, the Orb team can now set them up and email them their app invite in one go. They get a link to set their password straight away, with no second trip to their profile.",
    points: ['Create and send invite: the profile or login is made and the invite email goes out', 'Create profile (or Create login) still sets them up with no email, for when you are not ready', 'If the email does not arrive, the invite link is shown to send by WhatsApp or text'],
  },
  {
    month: 'November 2026', date: '2026-11-07', icon: ClipboardCheck, title: 'Staff setup: every form now becomes a profile', image: 'staff-setup-fix',
    lede: "Some officers' forms could not be turned into a staff profile when the officer had left \"Known as\" blank. That is fixed: Create profile now works for every form, and the forms that were stuck are still waiting, untouched.",
    points: ['Create profile works whether or not the officer gave a preferred name', 'Forms that failed before are still in Staff setup; tap Create profile again'],
  },
  {
    month: 'November 2026', date: '2026-11-07', icon: UserRound, title: 'Venue managers add their own profile photo', image: 'venue-manager-photo',
    lede: "The venue managers' form now lets each manager add a profile photo. It goes straight onto their Venue Manager login, so your officers and your team can see who they are dealing with at each venue.",
    points: ['An optional photo on the venue managers\' form, taken on the phone or picked from the camera roll', 'It becomes the photo on their login when the account is made', 'The office sees it before creating the login'],
  },
  {
    month: 'November 2026', date: '2026-11-07', icon: Store, title: 'Venue managers can send their details too', image: 'venue-manager-form',
    lede: "Alongside the officers' form, the Orb team can now send your venue managers their own shared link. Each manager adds their name, contact details and the venue they look after, and the team turns it into a Venue Manager login for the right venue, with Orb doing the typing.",
    points: ['A short form: name, job title, email, mobile and the venue they manage', 'They type their own venue\'s name and never see your other venues; it is matched to your venue for you', 'Each one becomes a Venue Manager login linked to their venues', 'No email goes out until you send the invite from Settings → Users', 'Its own link, switched on, off or replaced separately from the officers\' one'],
  },
  {
    month: 'November 2026', date: '2026-11-07', icon: ClipboardList, title: 'Setting up your staff is faster: officers send their own details', image: 'staff-setup-form',
    lede: "When the Orb team sets up your app, they can now send your officers one shared link. Each officer fills in their own details on their phone, with no login, and the team turns every submission into a staff profile, with Orb doing the typing.",
    points: ['One form for name, contact details, address, SIA licence, pay details and an emergency contact', 'Officers can add a photo of their SIA badge, right to work, proof of address and a profile photo', 'New profiles arrive in Staff as active, with their documents waiting to be verified', 'No login invites go out; send them from each profile when you are ready', 'The link can be switched off or replaced at any time, and details not used are deleted after 60 days'],
  },
  {
    month: 'November 2026', date: '2026-11-07', icon: Pin, title: 'A sidebar that gets out of the way', image: 'sidebar-pin',
    lede: 'On a computer, the menu on the left can now shrink to a slim strip of icons and give the page more room. Rest the mouse on it and it slides open over the page, then tucks away again. Pin it and it stays open, the way it was.',
    points: ['Tap the small pin next to the logo, or press [ on the keyboard, to shrink or pin the menu', 'Your choice is remembered on that computer', 'While it is shrunk, unread counts show as small dots on the icons and each icon shows its name when you point at it', 'The gold marker glides to the page you open', 'Every icon has its own little motion: the calendar flips, the tick draws itself, the radio waves ripple', 'Phones are unchanged; reduced motion in your device settings turns the movement off'],
  },
  {
    month: 'November 2026', date: '2026-11-07', icon: Sparkles, title: 'Orb spots venues with missing details, and you approve in bulk', image: 'orb-venue-setup',
    lede: "Orb now checks every venue for a missing address, map pin, logo or a clock-in radius nobody has confirmed. It looks up what it can online and puts one card per venue in To approve, with everything ready to save. Nothing changes until you approve, and cards of the same kind can now be approved or declined together.",
    points: ['One Venue setup card per venue, with the address, map pin, website and logo Orb found', 'Untick anything that looks wrong, or pick a different clock-in radius before you apply', 'Venues with shifts booked in the next two weeks come first', 'Dismiss a detail you don\'t need and Orb stops asking until it changes', 'Select in To approve picks cards of one kind; Approve or Decline them all at once with the choices Orb ticked', 'Turn the check off in Orb settings under Check venue details'],
  },
  {
    month: 'November 2026', date: '2026-11-07', icon: CalendarDays, title: 'Venues get their own rota, and one Site setup', image: 'venue-rota-setup',
    lede: "Venue managers now have a Rota of their own venue: the week's shifts, who is booked and who is on site right now. They ask for extra officers straight from a day, and the request reaches you in Cover requests as before. On your side, each venue's Location, Venue codes and Charge rates now sit together on one Site setup tab.",
    points: ['Venue Rota replaces their Cover page; requests and replies sit under its Requests tab', 'Venue timesheets show who worked, who is on site and the charge rate they are billed, never the officer rate', 'Charge rates are set per role in one list, and roles with no rate are flagged with the shifts and timesheets waiting', 'A new rate can start from the first unrated shift, so those timesheets can be approved', 'Approval fixes the rate, and the invoice bills exactly that'],
  },
  {
    month: 'November 2026', date: '2026-11-07', icon: Sparkles, title: 'Orb fills in your venues: address, map pin and logo', image: 'orb-venue-lookup',
    lede: "Orb can now look a venue up online. It reads the venue's own website and OpenStreetMap, then offers the address, postcode, map pin, website link and logo for you to check and save. A new venue shows a small Let Orb fill this in button until those details are in.",
    points: ["Says where each address came from: the venue's website or the map", 'Pick from up to three logos found on their website, or upload your own', 'The logo shows next to the venue name in Venues and on the venue page', 'Ask Orb in chat to find the addresses for all your venues; it shows them on a Confirm card first', 'Nothing is saved until you press Save or Confirm', 'Security managers can look up their own venues; the platform admin always has the full Company manager side'],
  },
  {
    month: 'November 2026', date: '2026-11-07', icon: ReceiptText, title: 'Invoices and pay runs fill themselves', image: 'invoices-live',
    lede: "Approve a timesheet and it goes straight onto the venue's draft invoice and the officer's draft pay statement. There's nothing to generate any more. The drafts are laid out day by day like Timesheets, and only shifts the venue has signed off are billed or paid.",
    points: ['Approved shifts show on the draft invoice and the pay run straight away, in green once the venue signs and amber until then', 'Rate changes, queries, declines and cancelled shifts update the drafts on their own', 'Issue bills the signed shifts; the rest move to the next draft automatically', 'A late approval for a week that is already invoiced goes on the next draft, marked with its real date', 'Timesheets shows On draft invoice or Invoiced with the invoice number', 'Issued invoices never change: corrections after issue need a credit note'],
  },
  {
    month: 'November 2026', date: '2026-11-07', icon: Globe, title: 'Every client is now a venue', image: 'website-venues',
    lede: "Every tile under Who we protect on the website now comes straight from Venues. The 22 client cards that were built into the page are now real venues with the same name, line, link and photo, so the website and the app tell one story.",
    points: ['Change a venue\'s welcome line, photo or website link and its tile follows', 'Switch off Show on website, or make the venue inactive, and the tile goes', 'A new venue gets its own tile automatically, under its city', 'Shanghai shows once now, from its real venue', 'The 22 new venues need an address, geofence and rates before you book shifts there', 'Reviews collected under the old cards still show on their tiles'],
  },
  {
    month: 'November 2026', date: '2026-11-07', icon: ClipboardCheck, title: 'Timesheets, day by day', image: 'timesheets-table',
    lede: 'Timesheets is now a week table like the Rota: every confirmed shift, day by day, with the scheduled and actual times, the hours, the charge rate and the officer rate side by side. The colour tells you where each shift is, and Approve, Query and Decline sit on the row.',
    points: ['Confirmed shifts faded, live ones outlined, awaiting review amber, queried red, approved green', 'How each officer clocked in: QR, NFC tag, on location or set by a manager', 'Decline means not worked: no pay and no charge, with the reason sent to the officer', 'Rates are fixed on approval, and pay runs and invoices use exactly those', 'Company managers can change a rate for one shift, with a reason', 'No-shows stay on the table until someone sets their times or declines them'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: Siren, title: 'Emergency flowchart: a clear first line', image: 'emergency-flowchart-banner',
    lede: "The banner at the top of the Emergency flowchart now says what it is and what to do first: Guidance from ProtectUK and citizenAID. Always call 999 and follow the call handler.",
    points: ['Says where the advice comes from', 'Puts calling 999 first, every time', "The call handler's instructions come before the flowchart"],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: Siren, title: 'Emergency flowchart: on every shift card', image: 'emergency-flowchart-live',
    lede: "The text-only Emergency flowchart is now live for everyone. A red Emergency flowchart button sits at the top of every shift card, for officers, managers and venue users, and it's in the Toolbox too. One tap takes you to the situation, and Leave brings you back to the shift.",
    points: ['A red button at the top of every shift card', 'Knife, firearms, vehicle, explosion, items, bomb threats and injuries', "I'm in danger and Call 999 always on screen; it never dials for you", 'Word for word from ProtectUK and citizenAID', 'The platform admin can take it offline with one switch in Toolbox'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: Siren, title: 'Emergency guide: a text-only flowchart to compare', image: 'emergency-flowchart',
    lede: "Beside the illustrated Emergency guide there is now a text-only flowchart, quoted word for word from the police's ProtectUK advice and citizenAID first aid. Each answer stays on screen as a trail, so you can see the whole path and tap any step to go back. A map view lays out every card on one page for review and printing.",
    points: ['Nine situations, including a bomb threat by phone, in person, in writing or online', 'Every line quoted word for word, with its source; Orb notes kept apart', "I'm in danger jumps to the safety card for your situation", 'A full map for reviewers, printable as an outline', 'Platform admin only until ProtectUK and citizenAID give permission'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: Images, title: 'Every upgrade, in pictures', image: 'whatsnew-pictures',
    lede: 'What’s new now tells its story in pictures. Every upgrade has its own illustration, so you can see at a glance how far the platform has come.',
    points: ['A picture for every upgrade, made to match it', 'Designed in the Opulence navy and gold', 'Pictures in the welcome after each release too', 'Light and quick to load, even on a phone'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: Siren, title: 'Emergency guide: more injuries, and help for every casualty', image: 'emergency-injuries',
    lede: "Other injuries in the Emergency guide now covers blast, crush and chest injuries, and an injury the guide doesn't cover gets clear steps instead of a dead end. Multiple casualties and Help an injured person have their own Get yourself safe and Police and ambulance arriving screens. All new wording is an AI draft waiting for clinical review.",
    points: ['Blast, crush and chest injuries, severe bleeding always first', "Outside what this guide covers: call 999 on speaker and stay with them", "I'm in danger fits a casualty scene: traffic, fire, gas, falling objects", 'Police and ambulance arriving: who you helped and what you did', 'Still an AI draft, waiting for clinical review'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: Siren, title: 'Emergency guide: checked against ProtectUK', image: 'emergency-protectuk',
    lede: "The AI-drafted Emergency guide journeys now follow the police's own ProtectUK advice and speak to Orb officers: the HOT test and the 4Cs for unattended and suspicious items, with the safe distances, Run Hide Tell for firearms, and a first question for an explosion: inside or outside this building?",
    points: ['Unattended items: the HOT test, CCTV via your control room, lost property procedure', 'Suspicious items: Clear, Communicate, Control, with 100/200/400 m and no radio within 15 m', 'Firearms: cover from bullets means heavy walls, and what to expect from armed police', 'Explosion: inside, get out; outside, stay in away from glass', 'Still an AI draft, waiting for clinical review'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: Siren, title: 'Emergency guide: help that fits the situation', image: 'emergency-fits-situation',
    lede: "In the Emergency guide, I'm in danger and Police arriving now take you to the advice for the situation you chose, so a firearms incident says to get behind something solid and a suspicious item says to move away. Vehicle has a gun option, Explosion warns about a second device on its first screen, and the Toolbox button lists every situation.",
    points: ["I'm in danger and Police arriving follow your situation", 'Own Police arriving screens for Explosion and suspicious items', 'Vehicle: someone got out with a knife or with a gun', 'Explosion: second device warning first, cover your nose and mouth', 'Fewer repeated buttons; Someone owns it goes back to Choose the situation'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: Siren, title: 'Emergency guide: every situation can be opened', image: 'emergency-all-situations',
    lede: 'Firearms, Vehicle, Explosion, Unattended item, Suspicious item, Multiple casualties and Help an injured person can now be chosen in the Emergency guide. Their wording is an AI first draft for review, marked on every screen; the Knife journey is unchanged, and the guide is still shown only to the Orb team.',
    points: ['All eight situations open from Choose the situation', 'AI draft, for review on every new card and screen', "I'm in danger, Call 999 and Police arriving still on every screen", 'Nothing dials by itself: you tap to call'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: ClipboardList, title: 'Shift cards on the Live board', image: 'live-shift-cards',
    lede: 'Every venue on Live now has a Shift card button next to its name, and Open shift card is the first button when you tap an officer. When a new version of the app is out, a bar under the top bar offers Reload, so an open tab never stays on the old app.',
    points: ['Shift card on every venue on Live', "Open shift card at the top of an officer's details", 'The app tells you when a new version is ready, with Reload'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: Megaphone, title: 'See the live shift card and send instructions', image: 'shift-instructions',
    lede: 'From Live, tap an officer on shift and choose Open shift card. Switch to Officer\'s view to see their card exactly as they do, and send an instruction to the whole team or one officer: they get a notification, and it stays on top of their card until they tap Got it.',
    points: ['Open shift card from Live', "Officer's view: their card, as they see it", 'Send to the whole team or one officer, with a notification', 'Read by n of m, with names and times', 'Officers are told when shift notes change during the shift'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: ClipboardCheck, title: 'Face check notes are readable again', image: 'face-check-notes',
    lede: 'In Exceptions and Live, the note explaining a face check (for example, a selfie too dark to compare) now sits next to the profile photo and selfie as normal text, instead of being squeezed into a thin column.',
    points: ['Profile and selfie side by side, at their normal size', 'The face check note reads across the card', 'Tap a photo to enlarge it, as before'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: Siren, title: 'Emergency guide: Back and Start on every screen', image: 'emergency-back-start',
    lede: 'Every screen of the Emergency guide now has Back and Start at the top, so you can always step back or return to Choose the situation, and the opening screen has Leave guide to get back to the app.',
    points: ['Back on every screen, always one step', 'Start returns to Choose the situation', 'Leave guide on the opening screen', 'Your danger taps and call time are kept'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: Siren, title: 'Emergency guide (draft)', image: 'emergency-guide',
    lede: 'A step-by-step Emergency guide is coming to the Toolbox, starting with a knife attack: get safe, call 999, help the injured and hand over. Its wording is still being clinically reviewed, so for now only the Orb team can open it; it will reach managers, officers and venue teams once it is approved.',
    points: ["I'm in danger, Call 999 and Police arriving on every screen", 'Big pictures and short steps made for a phone', 'Nothing dials by itself: you tap to call', 'Shown only to the Orb team until approved'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: MessageCircleWarning, title: 'Tell us what to fix', image: 'app-feedback',
    lede: 'While the app is being fine-tuned, everyone (managers, venue teams and officers) can send problems and ideas straight to the Orb team from the glowing App feedback button next to the bell. Each report comes with the screen, device and app version, so it gets fixed faster.',
    points: ['App feedback (the rainbow button) in the top bar, My account and Me', "Something's wrong or I have an idea, with up to 3 photos", 'My feedback shows the status and our reply', 'Only the Orb team reads it'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: Smartphone, title: 'Install the app from Settings', image: 'install-app',
    lede: 'Closed the Get the Orb app card on your Dashboard? It now lives in Settings, so you can install the app on another phone or computer whenever you like.',
    points: ['Get the Orb app in Settings, Company details', 'Closing the Dashboard card tells you where it went', 'Officers find it under Me, other managers under My account'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: Newspaper, title: 'Help is up to date', image: 'help-up-to-date',
    lede: 'Help, the downloadable guide and Orb’s answers now explain everything from the latest releases, so your team can look it up or just ask Orb.',
    points: ['The new Dashboard: Needs you, Tonight & tomorrow, This week', 'The officer app’s four tabs and the shift page', 'Moving the Orb button', 'Your website: venue tiles, welcome lines and reviews'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: Globe, title: 'Your website tiles flip like a departure board', image: 'departure-board',
    lede: 'On your public website, the Our services and venue tiles now split into a grid when tapped and turn over in a wave, like an old airport board, then join up again to show the details and reviews. Visitors who prefer less motion get a gentle fade.',
    points: ['Services and venue tiles turn over in a diagonal wave', 'Fewer, bigger cells on phones', 'Links, reviews and Request cover work as before', 'A simple fade for visitors who prefer less motion'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: ArrowRightLeft, title: 'Everything for the shift, on the shift', image: 'shift-handover',
    lede: 'Once an officer confirms a shift, its page holds the whole night: what the last team left them, report tiles that start the right form, their saved draft, and a way to say they can’t make it. Back now always returns to where they came from.',
    points: ['Back takes you to where you came from', 'Handover notes inside the shift', 'One tap to start a report by type, and your draft is waiting', 'Can’t make it? Say so from the shift', 'Clock in from Home'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: Smartphone, title: 'Your shift, all in one place', image: 'officer-shift',
    lede: 'Your officers’ app is now built around the shift. Home shows what they need to answer and what’s booked, and once they clock in the shift card takes over, with the log, incident reports and ejections in one place.',
    points: ['Home shows what to answer, what’s confirmed and what’s open', 'Clock in from 15 minutes before', 'Once you’re on, the shift card is your Home: log, incidents, ejections', 'Set-up items tick themselves and link to the fix', 'Every report and ejection in one Reports page'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: LayoutGrid, title: 'A Dashboard that tells you what matters', image: 'dashboard-matters',
    lede: 'Your Dashboard now leads with what needs you, then tonight’s cover, then the week in numbers. On a quiet night it simply says all clear.',
    points: ['A Needs you list with only what’s waiting, most urgent first', 'A one-line summary under your greeting', 'Tonight’s cover at a glance, short shifts first', 'Hours, shifts and money for the week in one strip', 'Clearer numbers across the app'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: Sparkles, title: 'Never miss an upgrade', image: 'never-miss-upgrade',
    lede: 'New features now greet you when you open the app, and your website comes alive as visitors scroll.',
    points: ['A What’s new welcome for managers for two days after each release', 'One tap to see every upgrade', 'Venue and service cards glide in from the sides', 'Numbers that count up and headings underlined in gold'],
  },
  {
    month: 'November 2026', icon: Building2, title: 'Venue tiles that fill themselves in', image: 'venue-tiles',
    lede: 'A venue’s tile on your website now takes everything it needs from the venue’s own details. Add the venue once and it appears in the right city, wearing its own photo.',
    points: ['The venue photo becomes the tile picture, even for venues added before tiles existed', 'The right city worked out from the postcode or address', 'Hand-made tiles keep their own pictures', 'A warm welcome on the back until the first praise is ticked'],
  },
  {
    month: 'November 2026', icon: Smartphone, title: 'A calmer app on your phone', image: 'calmer-phone',
    lede: 'The frame around every screen has been pared back, so on a phone you see your work first and the buttons second. Nothing has gone; it is simply where you expect it.',
    points: ['A clean top bar: just your messages and alerts', 'A More menu laid out like the desktop, in clear sections with live counts', 'Orb slips out of the way while you scroll and returns the moment you stop', 'The last row of every list always stays in clear view'],
  },
  {
    month: 'November 2026', icon: LayoutGrid, title: 'Designed for the phone in your pocket', image: 'phone-first',
    lede: 'Every page has been reworked for the phone, so a manager on the door gets the same clarity as one at the desk.',
    points: ['Page actions tucked into a tidy … menu', 'Lighter, edge-to-edge panels and slimmer photo headers', 'Long tab lists become a simple picker', 'Tables turn into compact, readable rows', 'Photos load in a fraction of the time'],
  },
  {
    month: 'November 2026', icon: FilePen, title: 'Incident reports that wait for you', image: 'report-drafts',
    lede: 'A report can now be started in the moment and finished when the night is over. Nothing is lost if the signal drops or the phone locks.',
    points: ['Drafts save as you write, private to you until you send them', 'A reminder after the shift and the next morning', 'A roomier form on the phone, with clear Yes and No answers', 'Jump to any step, and see at a glance what is still missing'],
  },
  {
    month: 'November 2026', icon: Globe, title: 'Every venue, on your website', image: 'every-venue',
    lede: 'Each venue you look after now has its own tile on your website from day one. A warm welcome line greets visitors until the praise starts arriving.',
    points: ['A tile for every active venue, with a switch to hide it', 'A welcome line written by AI, yours to edit', 'The venue photo from Details becomes its picture', 'Ticked praise appears on the tile automatically'],
  },
  {
    month: 'November 2026', icon: MessageSquareHeart, title: 'Praise, straight to your website', image: 'praise-website',
    lede: 'The kind words your venues share now go straight onto their tile on your website when you tick them. No retyping, and no second approval step.',
    points: ['One switch on each praise card: Show on website', 'Quotes appear under the venue’s name, never a person’s', 'Take any quote down again in a second', 'A Feedback tab on every venue, with replies and follow-ups in one place'],
  },
  {
    month: 'November 2026', icon: Building2, title: 'Clients, venues and the people behind them', image: 'clients-venues',
    lede: 'Every client now has a home of its own: its venues, its contacts and its correspondence, all connected and all in one view.',
    points: ['Create a client right from a venue, without leaving the page', 'Link a user to a client and their venues tick themselves', 'Invite or remove venue managers from the venue itself', 'Customers per night and a full analytics module'],
  },
  {
    month: 'November 2026', icon: Sparkles, title: 'Orb, your operations assistant', image: 'orb-assistant',
    lede: 'A quietly brilliant colleague that knows your rota, your venues and your people, and can act on all of them when you ask.',
    points: ['Ask in plain English and Orb does the work across the app', 'Talk to Orb by voice, or dictate on the move', 'Ask Orb about any pay run before you approve it', 'A movable button wearing the Opulence mark'],
  },
  {
    month: 'November 2026', icon: Radar, title: 'Live operations, ahead of the night', image: 'live-operations',
    lede: 'See every shift as it happens and let the platform chase the details before doors open, so you never have to.',
    points: ['One Live view for every venue tonight', 'Pre-shift checks that chase missing site packs automatically', 'Cover suggestions the moment someone drops out', 'Signed site packs shown right on Live'],
  },
  {
    month: 'October 2026', icon: FileSignature, title: 'A complete contracts suite', image: 'contracts-suite',
    lede: 'From first draft to signature, every agreement your business runs on, written for the law of the place you trade.',
    points: ['Eight ready contract packs for England & Wales, Scotland and Northern Ireland', 'An AI drafting partner that knows your business', 'Upload outside contracts and invite outside signers', 'Variations, extensions and a searchable contract library'],
  },
  {
    month: 'October 2026', icon: ClipboardCheck, title: 'Site packs that are read, then signed', image: 'site-packs',
    lede: 'Assignment instructions written in moments and acknowledged by every officer before they can clock in. Evidence you can stand behind.',
    points: ['AI-drafted instructions for each venue', 'Signature required before clock-in', 'A signing register for audits and clients'],
  },
  {
    month: 'October 2026', icon: Fingerprint, title: 'Clock-in you can prove', image: 'clock-in',
    lede: 'Each clock-in is tied to the right person, on the right phone, at the right door. That gives you timesheets nobody can argue with.',
    points: ['Passkey-protected phones', 'NFC tags on site', 'Selfie face check', 'Phone approvals for the office'],
  },
  {
    month: 'October 2026', icon: MessagesSquare, title: 'Conversation, all in one place', image: 'conversation',
    lede: 'Your team, your venues and your inbox, brought together so nothing important gets lost in someone’s personal phone.',
    points: ['Messages for everyone, with typing, reactions and pins', 'Voice messages', 'Your Gmail or Outlook inbox inside the app'],
  },
  {
    month: 'October 2026', icon: Newspaper, title: 'Everyday, the heartbeat of your team', image: 'everyday-feed',
    lede: 'A team feed that makes a dispersed workforce feel like one company, and keeps everyone informed without a single group chat.',
    points: ['Announcements and shout-outs', 'Polls, events and RSVPs', 'Photo posts with built-in editing'],
  },
  {
    month: 'October 2026', icon: GraduationCap, title: 'An academy of your own', image: 'academy',
    lede: 'Training that people actually finish, with the records to prove it when an inspector or client asks.',
    points: ['Illustrated lessons and a practical toolbox', 'Outside certificates kept in one place', 'An AI compliance overview of who is due what'],
  },
  {
    month: 'October 2026', icon: CalendarDays, title: 'Rota and shifts, refined', image: 'rota-shifts',
    lede: 'Planning that shows you, at a glance, who is confirmed, who leads the door and where the gaps still are.',
    points: ['Shift calendar and a page for every shift', 'Head doorman on each shift', 'Repeating cover requests', 'Unconfirmed shifts highlighted in amber'],
  },
  {
    month: 'October 2026', icon: ShieldAlert, title: 'Incidents, recorded properly', image: 'incidents',
    lede: 'Reports that are complete, evidenced and reviewed. The kind that protect your licence and your people.',
    points: ['Photos and files, with AI review of each report', 'Report past incidents after the fact', 'Ejection log with an optional ban', 'Weekly compliance checks'],
  },
  {
    month: 'October 2026', icon: Users, title: 'People and HR, done with care', image: 'people-hr',
    lede: 'The conversations that keep good people are now planned, recorded and followed through.',
    points: ['One-to-ones, goals and pay-rise agreements', 'Online applications flowing into Recruitment', 'Staff can keep their own profile up to date', '“Goes by” names everywhere'],
  },
  {
    month: 'October 2026', icon: BadgeCheck, title: 'SIA licence verification', image: 'sia-licence',
    lede: 'A guided check against the public SIA register, with the history saved, so every licence on your books has a clear audit trail.',
    points: ['Step-by-step verification assistant', 'Check history kept on each officer', 'Status shown wherever the officer appears'],
  },
  {
    month: 'October 2026', icon: Wallet, title: 'Pay runs and invoicing', image: 'pay-invoicing',
    lede: 'Pay your team and bill your clients with confidence, and with fewer late-night spreadsheets.',
    points: ['Pay runs reviewed by staff before they are final', 'Saved PDF payslips', 'Invoices held back until the hours are approved'],
  },
  {
    month: 'October 2026', icon: Palette, title: 'The Opulence look and feel', image: 'opulence-look',
    lede: 'An experience as polished as the service you provide, on every screen and in every light.',
    points: ['Opulence Day and Night themes with your branding', 'Smooth iOS-style motion', 'Flip cards and picture cards for staff and venues', 'Install-the-app help, offline notices and a user guide'],
  },
  {
    month: 'October 2026', icon: Globe, title: 'A landing page that wins work', image: 'landing-page',
    lede: 'A public face that shows off your clients and turns visitors into enquiries.',
    points: ['Your client venues as flip-card tiles', 'Real quotes from the venues you protect', 'Demo and enquiry requests straight to your inbox', '“Join the team” applications straight into Recruitment'],
  },
];

// The card's picture; the icon on a navy-to-gold wash when there is no picture or it fails to load
function Picture({ u }) {
  const [broken, setBroken] = useState(false);
  if (!u.image || broken) {
    return (
      <div className="grid aspect-[16/9] w-full place-items-center bg-gradient-to-br from-night to-gold text-white">
        <u.icon size={36} aria-hidden />
      </div>
    );
  }
  return <img src={`${import.meta.env.BASE_URL}whatsnew/${u.image}.webp`} alt="" loading="lazy" decoding="async" onError={() => setBroken(true)} className="aspect-[16/9] w-full bg-bg object-cover" />;
}

export function WhatsNew() {
  return (
    <div className="space-y-4">
      <div className="rounded-tile bg-surface p-5 shadow-tile">
        <div className="flex items-center gap-2 text-footnote font-semibold uppercase tracking-wide text-blue"><Sparkles size={16} aria-hidden /> What’s new</div>
        <h2 className="mt-1.5 text-title3 font-bold">Your platform keeps getting better</h2>
        <p className="mt-1.5 max-w-2xl text-body text-muted">
          Since October, {UPDATES.length} major upgrades have arrived, each built around how Opulence actually works.
          Here’s what has changed, and what it means for your business.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {UPDATES.map((u, i) => (
          <UpdateCard key={u.title} u={u} isNew={i === 0} />
        ))}
      </div>
    </div>
  );
}

export function UpdateCard({ u, isNew }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-tile bg-surface shadow-tile">
      <div className="relative">
        <Picture u={u} />
        {isNew && <span className="absolute left-3 top-3"><Pill tone="green">New</Pill></span>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="text-subhead font-semibold">{u.title}</div>
        <div className="mt-2 flex flex-wrap gap-1.5"><Pill>{u.month}</Pill></div>
        <p className="mt-2 text-body">{u.lede}</p>
        <ul className="mt-2.5 space-y-1">
          {u.points.map((p) => (
            <li key={p} className="flex gap-2 text-footnote text-muted"><Check size={14} className="mt-0.5 shrink-0 text-green" aria-hidden />{p}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

const SPLASH_DAYS = 2;
const seenKey = (id) => `orb.whatsnew.seen.${id}`;
// Dated cards released in the last two days, newest first
export const freshUpdates = (now = Date.now()) =>
  UPDATES.filter((u) => u.date && now >= Date.parse(u.date) && now - Date.parse(u.date) < SPLASH_DAYS * 864e5).slice(0, 3);

/** Greets managers with the latest upgrades for two days after a release, until they tap Got it */
export function WhatsNewSplash({ user }) {
  const nav = useNavigate();
  const [fresh] = useState(() => freshUpdates());
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!fresh.length) return undefined;
    let seen = null;
    try { seen = localStorage.getItem(seenKey(user.id)); } catch { /* private mode */ }
    if (seen === fresh[0].title) return undefined;
    const t = setTimeout(() => setOpen(true), 1200);
    return () => clearTimeout(t);
  }, [fresh, user.id]);
  if (!fresh.length) return null;
  const close = () => {
    try { localStorage.setItem(seenKey(user.id), fresh[0].title); } catch { /* private mode */ }
    setOpen(false);
  };
  return (
    <Sheet open={open} onClose={close} title="What’s new"
      footer={<>
        {user.role === 'company' && <Button variant="secondary" onClick={() => { close(); nav('/company/audit?tab=new'); }}>See every upgrade</Button>}
        <Button onClick={close}>Got it</Button>
      </>}>
      <div className="flex items-center gap-2 text-footnote font-semibold uppercase tracking-wide text-blue"><Sparkles size={16} aria-hidden /> {fresh[0].month}</div>
      <p className="mt-1 text-body text-muted">Fresh upgrades to your platform, ready to use today.</p>
      <div className="mt-3 space-y-3">{fresh.map((u) => <UpdateCard key={u.title} u={u} isNew />)}</div>
    </Sheet>
  );
}
