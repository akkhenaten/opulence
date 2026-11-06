// What's new: every upgrade to the platform, told as what it means for the business
import {
  ArrowRightLeft, BadgeCheck, Building2, CalendarDays, Check, ClipboardCheck, FilePen, FileSignature, Fingerprint, Globe, GraduationCap, LayoutGrid, MessageSquareHeart,
  MessageCircleWarning, MessagesSquare, Newspaper, Palette, Radar, ShieldAlert, Siren, Smartphone, Sparkles, Users, Wallet,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Pill, Sheet } from '../../ui/index.jsx';

// Newest first; the first card is the latest release. `date` (the deploy day) puts a card in the login splash for two days
export const UPDATES = [
  {
    month: 'November 2026', date: '2026-11-06', icon: ClipboardCheck, title: 'Face check notes are readable again',
    lede: 'In Exceptions and Live, the note explaining a face check (for example, a selfie too dark to compare) now sits next to the profile photo and selfie as normal text, instead of being squeezed into a thin column.',
    points: ['Profile and selfie side by side, at their normal size', 'The face check note reads across the card', 'Tap a photo to enlarge it, as before'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: Siren, title: 'Emergency guide: Back and Start on every screen',
    lede: 'Every screen of the Emergency guide now has Back and Start at the top, so you can always step back or return to Choose the situation, and the opening screen has Leave guide to get back to the app.',
    points: ['Back on every screen, always one step', 'Start returns to Choose the situation', 'Leave guide on the opening screen', 'Your danger taps and call time are kept'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: Siren, title: 'Emergency guide (draft)',
    lede: 'A step-by-step Emergency guide is coming to the Toolbox, starting with a knife attack: get safe, call 999, help the injured and hand over. Its wording is still being clinically reviewed, so for now only the Orb team can open it; it will reach managers, officers and venue teams once it is approved.',
    points: ["I'm in danger, Call 999 and Police arriving on every screen", 'Big pictures and short steps made for a phone', 'Nothing dials by itself: you tap to call', 'Shown only to the Orb team until approved'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: MessageCircleWarning, title: 'Tell us what to fix',
    lede: 'While the app is being fine-tuned, everyone (managers, venue teams and officers) can send problems and ideas straight to the Orb team from the glowing App feedback button next to the bell. Each report comes with the screen, device and app version, so it gets fixed faster.',
    points: ['App feedback (the rainbow button) in the top bar, My account and Me', "Something's wrong or I have an idea, with up to 3 photos", 'My feedback shows the status and our reply', 'Only the Orb team reads it'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: Smartphone, title: 'Install the app from Settings',
    lede: 'Closed the Get the Orb app card on your Dashboard? It now lives in Settings, so you can install the app on another phone or computer whenever you like.',
    points: ['Get the Orb app in Settings, Company details', 'Closing the Dashboard card tells you where it went', 'Officers find it under Me, other managers under My account'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: Newspaper, title: 'Help is up to date',
    lede: 'Help, the downloadable guide and Orb’s answers now explain everything from the latest releases, so your team can look it up or just ask Orb.',
    points: ['The new Dashboard: Needs you, Tonight & tomorrow, This week', 'The officer app’s four tabs and the shift page', 'Moving the Orb button', 'Your website: venue tiles, welcome lines and reviews'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: Globe, title: 'Your website tiles flip like a departure board',
    lede: 'On your public website, the Our services and venue tiles now split into a grid when tapped and turn over in a wave, like an old airport board, then join up again to show the details and reviews. Visitors who prefer less motion get a gentle fade.',
    points: ['Services and venue tiles turn over in a diagonal wave', 'Fewer, bigger cells on phones', 'Links, reviews and Request cover work as before', 'A simple fade for visitors who prefer less motion'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: ArrowRightLeft, title: 'Everything for the shift, on the shift',
    lede: 'Once an officer confirms a shift, its page holds the whole night: what the last team left them, report tiles that start the right form, their saved draft, and a way to say they can’t make it. Back now always returns to where they came from.',
    points: ['Back takes you to where you came from', 'Handover notes inside the shift', 'One tap to start a report by type, and your draft is waiting', 'Can’t make it? Say so from the shift', 'Clock in from Home'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: Smartphone, title: 'Your shift, all in one place',
    lede: 'Your officers’ app is now built around the shift. Home shows what they need to answer and what’s booked, and once they clock in the shift card takes over, with the log, incident reports and ejections in one place.',
    points: ['Home shows what to answer, what’s confirmed and what’s open', 'Clock in from 15 minutes before', 'Once you’re on, the shift card is your Home: log, incidents, ejections', 'Set-up items tick themselves and link to the fix', 'Every report and ejection in one Reports page'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: LayoutGrid, title: 'A Dashboard that tells you what matters',
    lede: 'Your Dashboard now leads with what needs you, then tonight’s cover, then the week in numbers. On a quiet night it simply says all clear.',
    points: ['A Needs you list with only what’s waiting, most urgent first', 'A one-line summary under your greeting', 'Tonight’s cover at a glance, short shifts first', 'Hours, shifts and money for the week in one strip', 'Clearer numbers across the app'],
  },
  {
    month: 'November 2026', date: '2026-11-06', icon: Sparkles, title: 'Never miss an upgrade',
    lede: 'New features now greet you when you open the app, and your website comes alive as visitors scroll.',
    points: ['A What’s new welcome for managers for two days after each release', 'One tap to see every upgrade', 'Venue and service cards glide in from the sides', 'Numbers that count up and headings underlined in gold'],
  },
  {
    month: 'November 2026', icon: Building2, title: 'Venue tiles that fill themselves in',
    lede: 'A venue’s tile on your website now takes everything it needs from the venue’s own details. Add the venue once and it appears in the right city, wearing its own photo.',
    points: ['The venue photo becomes the tile picture, even for venues added before tiles existed', 'The right city worked out from the postcode or address', 'Hand-made tiles keep their own pictures', 'A warm welcome on the back until the first praise is ticked'],
  },
  {
    month: 'November 2026', icon: Smartphone, title: 'A calmer app on your phone',
    lede: 'The frame around every screen has been pared back, so on a phone you see your work first and the buttons second. Nothing has gone; it is simply where you expect it.',
    points: ['A clean top bar: just your messages and alerts', 'A More menu laid out like the desktop, in clear sections with live counts', 'Orb slips out of the way while you scroll and returns the moment you stop', 'The last row of every list always stays in clear view'],
  },
  {
    month: 'November 2026', icon: LayoutGrid, title: 'Designed for the phone in your pocket',
    lede: 'Every page has been reworked for the phone, so a manager on the door gets the same clarity as one at the desk.',
    points: ['Page actions tucked into a tidy … menu', 'Lighter, edge-to-edge panels and slimmer photo headers', 'Long tab lists become a simple picker', 'Tables turn into compact, readable rows', 'Photos load in a fraction of the time'],
  },
  {
    month: 'November 2026', icon: FilePen, title: 'Incident reports that wait for you',
    lede: 'A report can now be started in the moment and finished when the night is over. Nothing is lost if the signal drops or the phone locks.',
    points: ['Drafts save as you write, private to you until you send them', 'A reminder after the shift and the next morning', 'A roomier form on the phone, with clear Yes and No answers', 'Jump to any step, and see at a glance what is still missing'],
  },
  {
    month: 'November 2026', icon: Globe, title: 'Every venue, on your website',
    lede: 'Each venue you look after now has its own tile on your website from day one. A warm welcome line greets visitors until the praise starts arriving.',
    points: ['A tile for every active venue, with a switch to hide it', 'A welcome line written by AI, yours to edit', 'The venue photo from Details becomes its picture', 'Ticked praise appears on the tile automatically'],
  },
  {
    month: 'November 2026', icon: MessageSquareHeart, title: 'Praise, straight to your website',
    lede: 'The kind words your venues share now go straight onto their tile on your website when you tick them. No retyping, and no second approval step.',
    points: ['One switch on each praise card: Show on website', 'Quotes appear under the venue’s name, never a person’s', 'Take any quote down again in a second', 'A Feedback tab on every venue, with replies and follow-ups in one place'],
  },
  {
    month: 'November 2026', icon: Building2, title: 'Clients, venues and the people behind them',
    lede: 'Every client now has a home of its own: its venues, its contacts and its correspondence, all connected and all in one view.',
    points: ['Create a client right from a venue, without leaving the page', 'Link a user to a client and their venues tick themselves', 'Invite or remove venue managers from the venue itself', 'Customers per night and a full analytics module'],
  },
  {
    month: 'November 2026', icon: Sparkles, title: 'Orb, your operations assistant',
    lede: 'A quietly brilliant colleague that knows your rota, your venues and your people, and can act on all of them when you ask.',
    points: ['Ask in plain English and Orb does the work across the app', 'Talk to Orb by voice, or dictate on the move', 'Ask Orb about any pay run before you approve it', 'A movable button wearing the Opulence mark'],
  },
  {
    month: 'November 2026', icon: Radar, title: 'Live operations, ahead of the night',
    lede: 'See every shift as it happens and let the platform chase the details before doors open, so you never have to.',
    points: ['One Live view for every venue tonight', 'Pre-shift checks that chase missing site packs automatically', 'Cover suggestions the moment someone drops out', 'Signed site packs shown right on Live'],
  },
  {
    month: 'October 2026', icon: FileSignature, title: 'A complete contracts suite',
    lede: 'From first draft to signature, every agreement your business runs on, written for the law of the place you trade.',
    points: ['Eight ready contract packs for England & Wales, Scotland and Northern Ireland', 'An AI drafting partner that knows your business', 'Upload outside contracts and invite outside signers', 'Variations, extensions and a searchable contract library'],
  },
  {
    month: 'October 2026', icon: ClipboardCheck, title: 'Site packs that are read, then signed',
    lede: 'Assignment instructions written in moments and acknowledged by every officer before they can clock in. Evidence you can stand behind.',
    points: ['AI-drafted instructions for each venue', 'Signature required before clock-in', 'A signing register for audits and clients'],
  },
  {
    month: 'October 2026', icon: Fingerprint, title: 'Clock-in you can prove',
    lede: 'Each clock-in is tied to the right person, on the right phone, at the right door. That gives you timesheets nobody can argue with.',
    points: ['Passkey-protected phones', 'NFC tags on site', 'Selfie face check', 'Phone approvals for the office'],
  },
  {
    month: 'October 2026', icon: MessagesSquare, title: 'Conversation, all in one place',
    lede: 'Your team, your venues and your inbox, brought together so nothing important gets lost in someone’s personal phone.',
    points: ['Messages for everyone, with typing, reactions and pins', 'Voice messages', 'Your Gmail or Outlook inbox inside the app'],
  },
  {
    month: 'October 2026', icon: Newspaper, title: 'Everyday, the heartbeat of your team',
    lede: 'A team feed that makes a dispersed workforce feel like one company, and keeps everyone informed without a single group chat.',
    points: ['Announcements and shout-outs', 'Polls, events and RSVPs', 'Photo posts with built-in editing'],
  },
  {
    month: 'October 2026', icon: GraduationCap, title: 'An academy of your own',
    lede: 'Training that people actually finish, with the records to prove it when an inspector or client asks.',
    points: ['Illustrated lessons and a practical toolbox', 'Outside certificates kept in one place', 'An AI compliance overview of who is due what'],
  },
  {
    month: 'October 2026', icon: CalendarDays, title: 'Rota and shifts, refined',
    lede: 'Planning that shows you, at a glance, who is confirmed, who leads the door and where the gaps still are.',
    points: ['Shift calendar and a page for every shift', 'Head doorman on each shift', 'Repeating cover requests', 'Unconfirmed shifts highlighted in amber'],
  },
  {
    month: 'October 2026', icon: ShieldAlert, title: 'Incidents, recorded properly',
    lede: 'Reports that are complete, evidenced and reviewed. The kind that protect your licence and your people.',
    points: ['Photos and files, with AI review of each report', 'Report past incidents after the fact', 'Ejection log with an optional ban', 'Weekly compliance checks'],
  },
  {
    month: 'October 2026', icon: Users, title: 'People and HR, done with care',
    lede: 'The conversations that keep good people are now planned, recorded and followed through.',
    points: ['One-to-ones, goals and pay-rise agreements', 'Online applications flowing into Recruitment', 'Staff can keep their own profile up to date', '“Goes by” names everywhere'],
  },
  {
    month: 'October 2026', icon: BadgeCheck, title: 'SIA licence verification',
    lede: 'A guided check against the public SIA register, with the history saved, so every licence on your books has a clear audit trail.',
    points: ['Step-by-step verification assistant', 'Check history kept on each officer', 'Status shown wherever the officer appears'],
  },
  {
    month: 'October 2026', icon: Wallet, title: 'Pay runs and invoicing',
    lede: 'Pay your team and bill your clients with confidence, and with fewer late-night spreadsheets.',
    points: ['Pay runs reviewed by staff before they are final', 'Saved PDF payslips', 'Invoices held back until the hours are approved'],
  },
  {
    month: 'October 2026', icon: Palette, title: 'The Opulence look and feel',
    lede: 'An experience as polished as the service you provide, on every screen and in every light.',
    points: ['Opulence Day and Night themes with your branding', 'Smooth iOS-style motion', 'Flip cards and picture cards for staff and venues', 'Install-the-app help, offline notices and a user guide'],
  },
  {
    month: 'October 2026', icon: Globe, title: 'A landing page that wins work',
    lede: 'A public face that shows off your clients and turns visitors into enquiries.',
    points: ['Your client venues as flip-card tiles', 'Real quotes from the venues you protect', 'Demo and enquiry requests straight to your inbox', '“Join the team” applications straight into Recruitment'],
  },
];

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
    <div className="flex flex-col rounded-tile bg-surface p-4 shadow-tile">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue/10 text-blue"><u.icon size={18} aria-hidden /></span>
        <div className="min-w-0 flex-1 text-subhead font-semibold">{u.title}</div>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {isNew && <Pill tone="green">New</Pill>}
        <Pill>{u.month}</Pill>
      </div>
      <p className="mt-2 text-body">{u.lede}</p>
      <ul className="mt-2.5 space-y-1">
        {u.points.map((p) => (
          <li key={p} className="flex gap-2 text-footnote text-muted"><Check size={14} className="mt-0.5 shrink-0 text-green" aria-hidden />{p}</li>
        ))}
      </ul>
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
