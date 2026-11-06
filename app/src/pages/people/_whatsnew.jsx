// What's new: every upgrade to the platform, told as what it means for the business
import {
  ArrowRightLeft, BadgeCheck, Building2, CalendarDays, Check, ClipboardCheck, ClipboardList, FilePen, FileSignature, Fingerprint, Globe, Images, GraduationCap, LayoutGrid, MessageSquareHeart,
  Megaphone, MessageCircleWarning, MessagesSquare, Newspaper, Palette, Radar, ShieldAlert, Siren, Smartphone, Sparkles, Users, Wallet,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Pill, Sheet } from '../../ui/index.jsx';

// Newest first; the first card is the latest release. `date` (the deploy day) puts a card in the login splash for two days.
// `image` is the card's picture in app/public/whatsnew (made with app/scripts/whatsnew-images.mjs); `icon` stands in without one
export const UPDATES = [
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
