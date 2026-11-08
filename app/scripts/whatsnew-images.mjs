// Makes the picture for each What's new card (app/public/whatsnew/<slug>.webp) with the OpenKBS image model.
// Skips pictures that already exist, so a new card only costs one generation.
// Run from the project root: node app/scripts/whatsnew-images.mjs [slug ...]   (delete a .webp to redo it)
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';

const OUT = 'app/public/whatsnew';
const STYLE = 'Premium cinematic photo-illustration for a luxury nightlife security brand. Deep navy palette with warm gold (#C9A45C) accents, soft night light, shallow depth of field, elegant and calm. '
  + 'Absolutely no text, no letters, no numbers, no logos, no brand names. People only seen from behind or softly out of focus, no recognisable faces. No weapons, no violence.';

export const PROMPTS = {
  'polish-motion': 'A sleek phone lying on a dark navy desk, its screen showing a calm app page with one softly glowing gold bar at the top with a small bell icon, faint motion trails of tiny gold icons gliding upward from the screen, a brass compass and a soft-focus lamp behind, warm light, premium and minimal, dark navy and gold.',
  'more-room-everywhere': 'A desktop monitor, a tablet and a phone arranged on a dark navy desk, each showing a clean app page where the list or table fills nearly the whole screen under one slim line of small gold controls, a brass spirit level lying in front of them, warm lamp light, minimal and spacious, dark navy and gold.',
  'more-room': 'A wide laptop on a dark navy desk showing a clean weekly rota grid filling almost the whole screen, a slim header line with small gold controls tucked neatly along the top edge, a brass ruler resting below the laptop, warm lamp light, minimal and spacious, dark navy and gold.',
  'email-footer': 'A crisp folded letter sliding out of a cream envelope on a dark navy desk, the bottom of the letter finished with a thin gold rule and a neat small block of fine grey lines beneath it, a gold wax seal and a brass pen beside the envelope, warm lamp light, dark navy and gold.',
  'more-app-styles': 'Three phones standing side by side on a dark navy desk, each showing the same app screen in a different finish: the first with soft raised stone-coloured buttons and cards, the second with frosted see-through glass cards over glowing gold and violet blurred lights, the third with crisp solid flat colour blocks, a small gold paint swatch fan resting in front of them, warm lamp light, dark navy and gold.',
  'push-actions': 'A phone lying face up on a dark navy desk showing a softly glowing notification card with two small gold pill-shaped buttons beneath it, a thumb hovering just above one button out of focus, a set of keys and a door-staff lanyard with a gold clip beside the phone, warm lamp light, dark navy and gold.',
  'ejections-register': 'An open leather-bound register book on a dark navy desk, neat handwritten rows down the page with a few lines marked by a small gold stamp, a brass pen resting in the spine, a door-staff lanyard with a gold clip lying beside it, warm lamp light, dark navy and gold.',
  'streamline-options': 'A neat dark navy desk with a closed leather organiser and a small gold three-dot tab on its edge, a few slim gold-edged cards fanned just behind it, a small brass slider control beside them, warm lamp light, minimal and uncluttered, dark navy and gold.',
  'streamline-fewer-steps': 'A short flight of three wide stone steps on a dark navy background, each step edged with a thin line of gold light, a small gold arrow resting on the top step, soft warm lamp light, minimal and calm, dark navy and gold.',
  'streamline-one-place': 'A tidy dark navy desk with a single neat row of labelled folder tabs in gold standing in a wooden tray, a few loose papers gathered and squared into it, a small brass label holder on the front, warm lamp light, dark navy and gold.',
  'streamline-fixes': 'A phone lying on a dark navy desk beside a small round NFC tag with a soft gold ripple of light between them, a neat paper map with a single gold path running straight from a door icon to a tick, warm lamp light, dark navy and gold.',
  'orb-knowledge': 'A glowing gold orb resting on a stack of leather-bound books on a dark navy desk, an SIA-style licence card and a small Scottish saltire pin beside the books, an open notebook with neat handwritten rules, warm lamp light, dark navy and gold.',
  'orb-more-skills': 'A glowing gold orb hovering above a dark navy desk, around it a fan of small paper cards each with a different simple icon (a calendar, an envelope, a passport, a clipboard, a shield), a short handwritten note pinned beside it titled with neat lines of text, warm lamp light, dark navy and gold.',
  'rtw-hand-ticked': 'A paper checklist on a dark navy desk with one hand-drawn tick in pencil beside a blank line, a passport lying open next to it, a small gold hourglass and a soft gold pen resting across the page, warm lamp light, dark navy and gold.',
  'doc-refile': 'Two open paper folders on a dark navy desk, one labelled with a small house icon and one with a small passport icon, a passport gliding along a soft gold arc of light from the first folder into the second, a security licence card already tucked in a third folder, warm lamp light, dark navy and gold.',
  'grace-on-cards': 'A neat row of three paper compliance cards on a dark navy desk, each with a small photo, a red or amber status strip at the top and a soft gold calendar button stamped on the card, a gold hourglass resting against the middle card, warm lamp light, dark navy and gold.',
  'grace-periods': 'A wall calendar on a dark navy office wall with a run of fourteen days softly highlighted in gold and the last day circled, below it on the desk a security licence card and a passport waiting in an open envelope, a small gold hourglass beside them, warm lamp light, dark navy and gold.',
  'today-one-page': 'A wide laptop on a dark navy desk showing one calm page: a dark header band with a soft greeting line, a row of small rounded coloured chips beneath it, a wide column of venue cards with rows of round avatars on the left and a narrower column on the right of neat to-do rows and cards marked by a small gold spark icon, a coffee cup at dawn beside it, warm lamp light, dark navy and gold.',
  'orb-reads-closer': 'Two halves of a security licence card (front and back) and a passport photo page on a dark navy desk, a soft gold magnifying lens over a slightly smudged printed name, thin gold lines linking the photos on the card and the passport, a stack of paper compliance cards fading away to one side, warm lamp light, dark navy and gold.',
  'orb-auto-compliance': 'A security licence card and a passport photo page lying on a dark navy desk, a soft gold scanning line of light passing across them, a small glowing gold tick rising above, a phone beside them showing a profile with green ticks, warm lamp light, dark navy and gold.',
  'work-notices': 'A phone lock screen on a dark navy bedside table, a stack of three notification banners with small gold icons for a clock, a pound coin and a document with a tick, sound waves softly rippling from the phone, warm lamp light, dark navy and gold.',
  'everyday-notify': 'A phone home-screen icon on a dark navy background with a bright red round badge showing the number 1 in its corner, a notification banner sliding down above it with a small gold megaphone icon, soft glow, warm lamp light, dark navy and gold.',
  'notify-tiers': 'Three phones lying side by side on a dark navy desk: the first lit with a bright gold alert banner and a soft glow, the second with a calm small banner, the third dark with only a tiny bell icon, warm lamp light, dark navy and gold.',
  'push-test': 'A phone standing on a dark navy bedside table at night, a single notification banner glowing at the top of the lock screen with a small gold bell icon and a soft gold tick beside it, a hand reaching towards it out of focus, warm lamp light, dark navy and gold.',
  'manager-clock-out': 'A manager\'s hand tapping a tablet on a dark navy desk, the screen showing a single officer card with a round avatar, a clock face and a bold gold Clock out button, a small door sign glowing softly in the background of a late-night venue, warm lamp light, dark navy and gold.',
  'phone-and-push': 'A hand holding a phone above a dark navy table, the screen showing a large fingerprint symbol in a soft gold circle, a small notification banner sliding down at the top of the screen with a gold bell icon, warm lamp light, dark navy and gold.',
  'rota-layout': 'A wide laptop on a dark navy desk showing a weekly rota grid: venue names down the left, seven day columns across the top with one column softly highlighted, small rounded shift cards in the cells with rows of tiny round avatars and a few dashed empty circles, a slim totals row along the bottom with one small red dot, warm lamp light, dark navy and gold.',
  'orb-no-repeats': 'A laptop on a dark navy desk showing a tidy inbox with a few calm cards, one card softly folded away with a small gold tick, a small gold spark icon in the corner and a bell with a quiet slash beside it, warm lamp light, dark navy and gold.',
  'live-ops-layout': 'A wide laptop on a dark navy desk showing a live operations board: neat cards stacked in a wide column on the left, each with a bold heading, a small green dot and rows of round avatars, and a narrower column on the right with small cards marked by a gold spark icon, warm lamp light, dark navy and gold.',
  'phone-top-bar': 'A hand holding a phone above a dark navy table, the screen showing an app page with a slim black bar along the top holding one short line of light text and nothing overlapping it, a gold card below, warm lamp light, dark navy and gold.',
  'clearer-everywhere': 'A phone and a laptop side by side on a dark navy desk, each screen showing a calm uncluttered page with a single gold button at the top right and a short list of rows marked with small coloured dots, a small three-dot menu icon beside the gold button, warm lamp light, dark navy and gold.',
  'lists-drawers-records': 'A wide laptop on a dark navy desk showing a tidy list of rows with small gold filter chips across the top and a detail panel slid open on the right side with a gold button at its bottom, a sticky note with a small gold tick beside the laptop, warm lamp light, dark navy and gold.',
  'shift-bar-live-drawer': 'A phone on a dark navy desk showing an app screen with a slim bar along the bottom holding a gold Clock out button and a small red emergency siren icon, beside it a laptop showing a live operations board of name rows with a panel slid open on the right side, warm lamp light, dark navy and gold.',
  'multi-venue-tiles': 'A venue manager seen from behind at a dark navy bar counter holding a phone that shows a home screen of three venue tiles, each with a small building icon and a few small coloured dots, one tile outlined in gold, a slim chip at the top of the screen with a down arrow, warm amber bar lights out of focus, dark navy and gold.',
  'welcome-post': 'A phone on a dark navy desk showing a social feed post with a large round profile photo silhouette framed in a gold ring, a waving hand emoji and small gold heart and clap reactions floating up from it, a new staff ID lanyard beside the phone, warm lamp light, dark navy and gold.',
  'rtw-check': 'A laptop on a dark navy desk showing a right to work check page with a passport-style photo and a large gold tick, a phone beside it displaying a short share code in gold letters, a printed PDF page with a gold stamp sliding into a folder, warm lamp light, dark navy and gold.',
  'email-sender-name': 'Close view of a phone on a dark navy desk showing an email inbox where the newest message is from a company name in bold with a small gold shield logo, a reply arrow glowing gold beside it, an open laptop behind with a company settings form, warm lamp light, dark navy and gold.',
  'invite-sent-status': 'Close view of a laptop on a dark navy desk showing a person\'s account card with an invite link box and a small gold envelope icon with a gold tick and a timestamp beside it, a phone next to it showing an incoming email notification, warm lamp light, dark navy and gold.',
  'staff-setup-invite': 'A laptop on a dark navy desk showing a new staff details submission with a gold Create and send invite button being pressed, a paper-plane envelope with a gold trail flying from the screen to a phone on the desk that lights up with an invite and a set password screen, warm lamp light, dark navy and gold.',
  'staff-setup-fix': 'A laptop on a dark navy desk showing a staff details submission with a large gold Create profile button just pressed, a new staff profile card sliding into a list beside it with a small gold tick, a phone with the filled-in form resting nearby, warm lamp light, dark navy and gold.',
  'venue-manager-photo': 'Close view of a phone held over a dark navy bar counter, its screen showing a round profile photo placeholder with a soft gold ring and a small camera icon being tapped, a blurred venue manager in a dark suit behind, warm amber bar lights out of focus, dark navy and gold.',
  'venue-manager-form': 'A venue manager seen from behind at a dark navy bar counter at dusk, holding a phone showing a short clean form with venue tiles being ticked, a second phone on the counter with a gold tick, a laptop nearby showing a list of venues with small person icons, warm amber bar lights out of focus, dark navy and gold.',
  'staff-setup-form': 'A phone on a dark navy desk showing a clean staff details form with name, address and an SIA badge photo being filled in, several more phones fanned behind it each with a small gold tick, a laptop beside them showing a list of new staff profiles, warm lamp light, dark navy and gold.',
  'sidebar-pin': 'A widescreen monitor on a dark navy desk showing an app with a slim dark side menu folding into a narrow strip of glowing gold icons, a small brass pin resting beside it, faint gold motion trails around the icons, warm lamp light.',
  'orb-venue-setup': 'A laptop on a dark navy desk showing a column of neat approval cards, each with a small venue logo, a map pin and a tick box, a glowing blue orb above them, a hand tapping one gold Approve button that ticks several cards at once, warm lamp light, dark navy and gold.',
  'venue-rota-setup': 'A tablet on a dark navy bar counter showing a weekly rota of shift cards with small green dots beside officer names, one day with a dashed card for a staffing request, beside it a phone showing one settings page with a map pin, a QR code and a short list of role rates, thin gold lines linking them, warm lamp light, dark navy and gold.',
  'orb-venue-lookup': 'A phone on a dark navy desk showing a venue page with a small round bar logo next to the venue name, a map pin dropping onto a street map, a glowing blue orb beside it drawing thin gold lines from a website and a map into the address fields, warm lamp light, dark navy and gold.',
  'invoices-live': 'A laptop on a dark desk showing an invoice laid out as a table grouped by day, most rows tinted soft green and a few amber, beside it a stack of timesheet cards with thin gold lines flowing from each card into the invoice rows, warm lamp light, dark navy and gold.',
  'website-venues': 'A laptop on a dark desk showing an elegant website grid of venue photo tiles grouped under city headings, beside it a phone showing a matching list of venues, thin gold lines linking each venue to its tile, warm lamp light, dark navy and gold.',
  'timesheets-table': 'A laptop on a dark desk showing a clean weekly table of rows grouped by day, rows softly tinted green, amber and red with one row outlined in gold, a manager hand tapping a checkmark button, warm lamp light.',
  'emergency-flowchart-banner': 'Close-up of a phone screen at night with a slim amber banner across the top above calm text cards, a thumb resting near it, soft gold light, dark navy background.',
  'emergency-flowchart-live': 'A security officer at night by a venue entrance holding a phone that shows a shift card with one bold red button at the top, warm gold door lights behind, dark navy sky, calm and ready.',
  'emergency-flowchart': 'A phone on a dark navy desk showing a clean flowchart of plain text cards joined by thin gold arrows, one card highlighted, a trail of earlier answers above it, soft gold light, no pictures on the cards.',
  'emergency-injuries': 'A phone on a dark surface showing a calm step-by-step first aid guide with large buttons, beside an open first aid kit with bandages and gloves, an ambulance light glowing softly blue in the distance, gold accents.',
  'emergency-protectuk': 'A security officer seen from behind at night calmly guiding people back from a taped-off area around a small abandoned bag far in the distance, a phone in their hand showing a simple checklist, soft blue and gold light.',
  'emergency-fits-situation': 'A phone showing a step-by-step guide whose illustrated tile changes to match a situation, branching paths of gold light leading from it to different calm scenes, dark navy background.',
  'emergency-all-situations': 'A phone showing a neat grid of eight large illustrated emergency tiles, resting on a dark table beside a first aid kit and a radio, soft gold light.',
  'live-shift-cards': 'A tablet on a dark desk showing a live board of venue rows each with a small glowing card button, a manager’s hand reaching to tap one, venue lights through the window.',
  'shift-instructions': 'A manager seen from behind sending a message from a tablet, glowing gold notification ripples travelling out to several phones held by security officers at different venue doors.',
  'face-check-notes': 'Two portrait photo frames side by side on a dark screen, both deliberately blurred and anonymous, with a neat readable note card beneath them, soft gold highlight.',
  'emergency-back-start': 'A phone showing a simple step-by-step guide with large back and home arrow buttons at the top, held steady by a security officer at night, calm and reassuring.',
  'emergency-guide': 'An emergency guide on a phone with large clear illustrated steps, next to a first aid kit and a radio on a venue bar counter at night, blue emergency light reflections, calm and prepared.',
  'app-feedback': 'A glowing rainbow-gradient button on a dark phone screen, small gold envelopes and idea light bulbs flying from it, a hand holding the phone in a venue at night.',
  'install-app': 'A sleek phone and a laptop on a dark desk, a golden app icon tile floating from the laptop screen down onto the phone home screen, soft light.',
  'help-up-to-date': 'An elegant open guide book and a tablet on a dark desk, a soft golden orb of light above them answering a question with glowing lines, bookshelf behind.',
  'departure-board': 'A grid of website tiles flipping over in a diagonal wave like an old split-flap airport departure board, navy and gold flaps mid-turn, blank tiles without characters.',
  'shift-handover': 'A security officer seen from behind at a venue door at night holding a phone showing a shift page with handover notes, a colleague handing over a radio.',
  'officer-shift': 'A security officer seen from behind clocking in with a phone at the staff entrance of a venue at dusk, the phone showing a single glowing shift card.',
  'dashboard-matters': 'A clean dashboard on a laptop on a dark desk with a short prioritised list, a tonight panel and a strip of simple charts, gold highlights, calm evening light.',
  'never-miss-upgrade': 'A phone opening with a gentle gold welcome sheet of feature cards sliding up, confetti of tiny gold light particles, dark elegant venue background.',
  'whatsnew-pictures': 'A gallery wall of small framed glowing pictures on a dark navy wall, each frame lit by a gold picture light, a phone in the foreground showing a scrolling feed of picture cards.',
  'venue-tiles': 'A sleek laptop on a dark desk showing a grid of glowing venue picture tiles, Edinburgh skyline at dusk through a window behind.',
  'calmer-phone': 'A door supervisor in a dark smart coat seen from behind, outside an elegant venue at night, holding a phone with a clean, uncluttered softly glowing screen.',
  'phone-first': 'A smartphone resting upright on a polished dark marble venue bar at night, its screen showing neat, tidy cards and panels in navy and gold, bokeh lights behind.',
  'report-drafts': 'A phone on a dark table at the end of a night shift showing a half-finished form, a gold pen beside it, a cup of coffee and early dawn light through a window.',
  'every-venue': 'A web page of elegant flip-card tiles floating in dark space, each tile a small lit venue facade, cards gently turning to reveal their backs.',
  'praise-website': 'Glowing gold speech bubbles drifting up from a lively venue entrance at night towards a floating website panel.',
  'clients-venues': 'An elegant constellation map on dark navy: gold nodes for buildings connected by fine lines to smaller nodes for people, like a refined network diagram made of light.',
  'orb-assistant': 'A softly glowing golden orb of light hovering above a phone on a dark desk, gentle sound waves rippling around it, a calm futuristic assistant.',
  'live-operations': 'A dark operations room with a large wall display showing a city map at night with gold glowing venue markers, a manager silhouette watching.',
  'contracts-suite': 'A fountain pen signing an elegant document on a dark leather desk, a neat stack of bound contracts and a brass desk lamp.',
  'site-packs': 'A security officer seen from behind reading an instruction booklet on a tablet at a venue doorway, then signing on screen with a finger, warm gold light.',
  'clock-in': 'A phone being tapped against a small NFC tag on a brass plaque by a venue door at night, a faint fingerprint pattern of gold light around it.',
  'conversation': 'Several phones and a laptop arranged on a dark table, glowing gold chat bubbles and envelopes flowing between them in a single stream.',
  'everyday-feed': 'A team huddle of security staff seen from behind before a shift, one holding a phone showing a social feed of photos, warm gold venue lights.',
  'academy': 'An elegant open book on a dark desk with glowing gold diagrams rising from its pages, a graduation cap and a certificate ribbon beside it.',
  'rota-shifts': 'A beautiful wall planner calendar on dark navy with gold highlighted time blocks, a few blocks glowing amber, a phone showing the same calendar.',
  'incidents': 'A tablet on a clipboard at a venue entrance at night showing a structured report with photo thumbnails, a torch and a radio beside it.',
  'people-hr': 'Two people seen from behind having a friendly one-to-one conversation at a small table in a warm, elegant lounge, notebook and coffee cups.',
  'sia-licence': 'A blank security licence card under a gold magnifying glass on a dark desk, a check mark made of soft gold light glowing above it.',
  'pay-invoicing': 'Neat payslips and invoices fanned out on a dark desk with a gold pen, a calculator and a laptop showing a tidy table, soft lamp light.',
  'opulence-look': 'A phone and a laptop side by side showing the same elegant navy and gold interface, one in day mode and one in night mode, on a marble surface.',
  'landing-page': 'A grand venue entrance at night seen through a glowing website frame, a welcoming gold-lit doorway inviting visitors in, velvet rope.',
};

const wanted = process.argv.slice(2);
const todo = Object.keys(PROMPTS).filter((s) => (wanted.length ? wanted.includes(s) : true) && !existsSync(`${OUT}/${s}.webp`));
mkdirSync(OUT, { recursive: true });
mkdirSync('/tmp/whatsnew', { recursive: true });

const make = (slug) => new Promise((done) => {
  const png = `/tmp/whatsnew/${slug}.png`;
  const p = spawn('openkbs', ['image', '--aspect-ratio', '16:9', '-o', png, `${PROMPTS[slug]} ${STYLE}`], { stdio: 'ignore' });
  p.on('close', (code) => {
    if (code !== 0 || !existsSync(png)) { console.log(`FAIL ${slug}`); return done(); }
    execFileSync('convert', [png, '-resize', '800x', '-quality', '72', `${OUT}/${slug}.webp`]);
    rmSync(png);
    console.log(`ok ${slug}`);
    done();
  });
});

// A few at a time; each takes about a minute
const queue = [...todo];
await Promise.all(Array.from({ length: 6 }, async () => { while (queue.length) await make(queue.shift()); }));
