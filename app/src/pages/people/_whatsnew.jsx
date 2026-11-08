// What's new: every upgrade to the platform, told as what it means for the business
import {
  ArrowRightLeft, BadgeCheck, BellOff, BellRing, Building2, CalendarDays, Check, ClipboardCheck, ClipboardList, FilePen, FileSignature, Fingerprint, Globe, Images, GraduationCap, LayoutGrid, LogOut, Mail, MessageSquareHeart,
  Megaphone, MessageCircleWarning, MessagesSquare, Newspaper, Palette, Pin, Radar, Radio, ReceiptText, ScanLine, ScanSearch, Send, ShieldAlert, Store, UserRound, Siren, Smartphone, Sparkles, Users, Wallet,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Pill, Sheet } from '../../ui/index.jsx';

// Newest first; the first card is the latest release. `date` (the deploy day) puts a card in the login splash for two days.
// `image` is the card's picture in app/public/whatsnew (made with app/scripts/whatsnew-images.mjs); `icon` stands in without one
export const UPDATES = [
  {
    month: 'November 2026', date: '2026-11-08', icon: ScanSearch, title: 'Orb clears more Compliance cards on its own', image: 'orb-reads-closer',
    lede: "Orb now reads uploaded SIA cards and passports the way a person would. It looks at the front and back of a card together, and it doesn't count a smudged letter or an unreadable name as a different person when the photo or the licence number shows who it is. Everyone's uploads are being read again, so many of the cards on the Compliance page close by themselves.",
    points: ["Front and back of an SIA card count as one card, so the back (no name printed) no longer raises a name card", 'A reading slip in the surname (A. ADULOJILII for Aduloju), or the surname alone, is accepted when the photo or the licence number matches', "Part of a licence number that fits the profile number counts as a match; a number that wasn't read fully gets a quiet card with no Update button", "Expiry dates a few days apart: Orb takes the earlier date, the safe one, on the profile. Bigger gaps still come to you", "Right to work ticked by hand: a British or Irish passport whose photo matches now saves Orb's check, labelled Copy only", "No profile photo? Orb compares the passport photo with their SIA card photo instead, and reads PDFs too", "Right to work not verified now says why: a non-British passport needing a share code, or a photo Orb couldn't confirm", "Still for you: a name that's clearly different, an obscured passport and share codes to check on GOV.UK"],
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
