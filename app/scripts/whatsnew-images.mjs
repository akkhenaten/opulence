// Makes the picture for each What's new card (app/public/whatsnew/<slug>.webp) with the OpenKBS image model.
// Skips pictures that already exist, so a new card only costs one generation.
// Run from the project root: node app/scripts/whatsnew-images.mjs [slug ...]   (delete a .webp to redo it)
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync } from 'node:fs';

const OUT = 'app/public/whatsnew';
const STYLE = 'Premium cinematic photo-illustration for a luxury nightlife security brand. Deep navy palette with warm gold (#C9A45C) accents, soft night light, shallow depth of field, elegant and calm. '
  + 'Absolutely no text, no letters, no numbers, no logos, no brand names. People only seen from behind or softly out of focus, no recognisable faces. No weapons, no violence.';

export const PROMPTS = {
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
