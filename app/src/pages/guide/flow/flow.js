// The Emergency flowchart: text-only cards, each quoting ProtectUK (citizenAID for first aid) word for word from sources.js.
// Orb's own lines go in `note`, shown apart from the quoted text. Answers are Orb's button labels, never source text.
// kind: 'question' asks something, 'step' says what to do, 'end' closes a journey (Start again / Leave).
// Flags for the map view: thin (no ProtectUK advice of its own), clinical (first aid: needs clinical review).
// Checked in the build by scripts/flow-check.mjs.

export const START = 'START';

// The first card's choices. safety is where I'm in danger lands while you are in that situation.
export const SITUATIONS = [
  { key: 'knife', label: 'Knife or weapon attack', start: 'KN-ROUTE', safety: 'KN-ROUTE' },
  { key: 'firearms', label: 'Firearms', start: 'FA-ROUTE', safety: 'FA-ROUTE' },
  { key: 'vehicle', label: 'Vehicle used as a weapon', start: 'VE-ROUTE', safety: 'VE-ROUTE' },
  { key: 'explosion', label: 'Explosion', start: 'EX-WHERE', safety: 'EX-WHERE' },
  { key: 'unattended', label: 'Unattended item', start: 'UN-HIDDEN', safety: 'SU-CLEAR' },
  { key: 'suspicious', label: 'Suspicious item', start: 'SU-CONFIRM', safety: 'SU-CLEAR' },
  { key: 'bomb', label: 'Bomb threat', start: 'BT-HOW', safety: 'SU-CLEAR' },
  { key: 'injured', label: 'Someone injured', start: 'INJ-SAFE', safety: 'INJ-SAFE' },
  { key: 'casualties', label: 'Several people injured', start: 'MC-SAFE', safety: 'MC-SAFE' },
];

const CONTROL = 'Orb: then tell your control room or supervisor.';
const ENDS = [{ label: 'Start again', to: '@start' }, { label: 'Leave', to: '@leave' }];

export const FLOW = {
  START: { title: 'Choose the situation', kind: 'question', extract: [], answers: SITUATIONS.map((s) => ({ label: s.label, to: s.start })) },

  // Knife or weapon attack, and Vehicle: RUN HIDE TELL
  'KN-ROUTE': { title: 'Is there a safe route out?', kind: 'question', extract: ['rht-intro', 'rht-route'], answers: [{ label: 'Yes, a safe route', to: 'ATK-RUN' }, { label: 'No', to: 'ATK-HIDE' }] },
  'VE-ROUTE': {
    title: 'Is there a safe route out?', kind: 'question', thin: true, extract: ['rht-route'],
    note: 'Orb: ProtectUK has no public RUN HIDE TELL advice of its own for a vehicle attack, so this follows RUN HIDE TELL. Its Vehicle as a Weapon page notes that street furniture (bus stops, posts, walls, trees) gives some protection: get behind something solid, away from the road.',
    answers: [{ label: 'Yes, a safe route', to: 'ATK-RUN' }, { label: 'No', to: 'ATK-HIDE' }],
  },
  'ATK-RUN': { title: 'RUN', kind: 'step', extract: ['rht-run'], answers: [{ label: "I'm away", to: 'ATK-TELL' }, { label: 'The route is blocked', to: 'ATK-HIDE' }] },
  'ATK-HIDE': {
    title: 'HIDE', kind: 'step', extract: ['rht-hide', 'rht-hide-more'],
    answers: [{ label: 'Safe to call now', to: 'ATK-TELL' }, { label: 'A safe route opened', to: 'ATK-RUN' }, { label: 'Police have arrived', to: 'ATK-POLICE' }],
  },

  // Firearms: the same, with ProtectUK's cover-from-gunfire lines
  'FA-ROUTE': { title: 'Is there a safe route out?', kind: 'question', extract: ['rht-intro', 'rht-route'], answers: [{ label: 'Yes, a safe route', to: 'FA-RUN' }, { label: 'No', to: 'FA-HIDE' }] },
  'FA-RUN': { title: 'RUN', kind: 'step', extract: ['rht-run'], answers: [{ label: "I'm away", to: 'ATK-TELL' }, { label: 'The route is blocked', to: 'FA-HIDE' }] },
  'FA-HIDE': {
    title: 'HIDE from gunfire', kind: 'step', extract: ['rht-hide', 'rht-bullets', 'ss-cover', 'rht-hide-more'],
    answers: [{ label: 'Safe to call now', to: 'ATK-TELL' }, { label: 'A safe route opened', to: 'FA-RUN' }, { label: 'Police have arrived', to: 'ATK-POLICE' }],
  },

  // Shared by every attack
  'ATK-TELL': { title: 'TELL', kind: 'step', extract: ['rht-tell', 'rht-tell-list'], note: CONTROL, answers: [{ label: 'Police have arrived', to: 'ATK-POLICE' }, { label: 'Someone needs first aid', to: 'ATK-AID' }] },
  'ATK-POLICE': { title: 'Armed police response', kind: 'step', extract: ['ss-police'], answers: [{ label: 'It is safe now', to: 'ATK-AID' }, { label: 'Nobody is hurt', to: 'END-ATTACK' }] },
  'ATK-AID': { title: 'First aid', kind: 'question', extract: ['ss-firstaid', 'ev-injured'], answers: [{ label: 'Help someone injured', to: 'INJ-BLEED' }, { label: 'Nobody needs help', to: 'END-ATTACK' }] },

  // Explosion: inside means evacuate, outside (or not known) means stay inside
  'EX-WHERE': {
    title: 'Where was the explosion?', kind: 'question', extract: ['ss-judge', 'ev-inside'],
    answers: [{ label: 'Inside this building', to: 'EX-EVAC' }, { label: 'Outside', to: 'EX-INVAC' }, { label: "I don't know", to: 'EX-INVAC' }],
  },
  'EX-EVAC': { title: 'Evacuate', kind: 'step', extract: ['ss-evac'], answers: [{ label: "We're out", to: 'EX-DISPERSE' }, { label: "We can't get out", to: 'EX-LOCK' }] },
  'EX-INVAC': { title: 'Stay inside, away from the threat', kind: 'step', extract: ['ev-invac', 'ss-lock'], answers: [{ label: "We're in a safer area", to: 'EX-TELL' }, { label: 'The threat is inside after all', to: 'EX-EVAC' }] },
  'EX-LOCK': { title: 'Lockdown', kind: 'step', extract: ['ss-lock'], answers: [{ label: "We're in a safer area", to: 'EX-TELL' }, { label: 'A safe way out opened', to: 'EX-EVAC' }] },
  'EX-DISPERSE': { title: 'Do not gather', kind: 'step', extract: ['ev-disperse', 'ui-reentry'], answers: [{ label: 'Done', to: 'EX-TELL' }, { label: 'Someone is injured', to: 'INJ-SAFE' }] },
  'EX-TELL': { title: 'Tell the police', kind: 'step', extract: ['ev-report', 'ss-tell999'], note: CONTROL, answers: [{ label: 'Someone is injured', to: 'INJ-SAFE' }, { label: 'Done', to: 'END-ATTACK' }] },

  // Unattended item: the HOT test (Confirm)
  'UN-HIDDEN': { title: 'Hidden?', kind: 'question', extract: ['ui-hidden'], answers: [{ label: 'Yes, it was hidden', to: 'SU-CLEAR' }, { label: 'No', to: 'UN-OBVIOUS' }] },
  'UN-OBVIOUS': { title: 'Obviously suspicious?', kind: 'question', extract: ['ui-obvious'], answers: [{ label: 'Yes', to: 'SU-CLEAR' }, { label: 'No', to: 'UN-TYPICAL' }] },
  'UN-TYPICAL': { title: 'Typical for this place?', kind: 'question', extract: ['ui-typical'], answers: [{ label: 'Yes, typical lost property', to: 'UN-LOST' }, { label: 'No', to: 'SU-CLEAR' }] },
  'UN-LOST': {
    title: 'Unattended, not suspicious', kind: 'step', extract: ['ui-unattended'],
    note: "Orb: follow the venue's lost property procedure and log it. If anything about it changes, treat it as suspicious.",
    answers: [{ label: 'Done', to: 'END-ITEM' }, { label: 'It looks suspicious now', to: 'SU-CLEAR' }],
  },

  // Suspicious item: the 4 Cs
  'SU-CONFIRM': { title: 'Confirm', kind: 'question', extract: ['ui-4cs'], answers: [{ label: 'Check it with the HOT test', to: 'UN-HIDDEN' }, { label: 'It is clearly suspicious', to: 'SU-CLEAR' }] },
  'SU-CLEAR': { title: 'Clear the immediate area', kind: 'step', extract: ['ui-risk', 'ui-clear'], answers: [{ label: 'People are moving away', to: 'SU-COVER' }, { label: 'Call 999 first', to: 'SU-COMM' }] },
  'SU-COVER': { title: 'Out of sight, behind hard cover', kind: 'step', extract: ['ui-cover'], answers: [{ label: 'Cordon in place', to: 'SU-COMM' }, { label: 'Still clearing people', to: 'SU-CLEAR' }] },
  'SU-COMM': { title: 'Communicate', kind: 'step', extract: ['ui-comm'], answers: [{ label: 'Called', to: 'SU-CONTROL' }, { label: 'Called, still clearing', to: 'SU-COVER' }] },
  'SU-CONTROL': { title: 'Control the cordon', kind: 'step', extract: ['ui-control', 'ui-reentry'], answers: [{ label: 'Police have taken over', to: 'END-ITEM' }, { label: 'Someone is injured', to: 'INJ-SAFE' }] },

  // Bomb threat
  'BT-HOW': {
    title: 'How did the threat come?', kind: 'question', extract: ['bt-all999'],
    answers: [{ label: 'Phone call', to: 'BT-PHONE' }, { label: 'In person', to: 'BT-FACE' }, { label: 'Note, letter or graffiti', to: 'BT-WRITTEN' }, { label: 'Email, text or social media', to: 'BT-ONLINE' }],
  },
  'BT-PHONE': { title: 'A threat by phone', kind: 'step', extract: ['bt-phone'], answers: [{ label: 'The call has ended', to: 'BT-REPORT' }, { label: 'It came by text', to: 'BT-ONLINE' }] },
  'BT-FACE': { title: 'A threat in person', kind: 'step', extract: ['bt-face'], answers: [{ label: 'Done', to: 'BT-REPORT' }, { label: 'They left an item', to: 'SU-CONFIRM' }] },
  'BT-WRITTEN': { title: 'A written threat', kind: 'step', extract: ['bt-written'], answers: [{ label: 'Done', to: 'BT-REPORT' }, { label: 'There is an item too', to: 'SU-CONFIRM' }] },
  'BT-ONLINE': { title: 'A threat by message', kind: 'step', extract: ['bt-online', 'bt-text'], answers: [{ label: 'Done', to: 'BT-REPORT' }, { label: 'There is an item too', to: 'SU-CONFIRM' }] },
  'BT-REPORT': {
    title: 'Report it', kind: 'step', extract: ['bt-exact', 'bt-know', 'bt-remember'],
    note: "Orb: tell your control room straight away, and follow the venue manager's decision on searching or evacuating.",
    answers: [{ label: 'Reported', to: 'END-ITEM' }, { label: 'A suspicious item is found', to: 'SU-CLEAR' }],
  },

  // Someone injured (citizenAID order): safety, bleeding, breathing, other injuries, handover
  'INJ-SAFE': { title: 'Is it safe to help?', kind: 'question', clinical: true, extract: ['ss-firstaid', 'ev-injured'], answers: [{ label: 'It is safe', to: 'INJ-BLEED' }, { label: 'It is not safe', to: 'INJ-WAIT' }] },
  'INJ-WAIT': {
    title: 'Not safe yet', kind: 'step', clinical: true, extract: ['ev-injured', 'rht-tell'],
    note: 'Orb: get yourself safe first. Call 999 when you can, on speaker.',
    answers: [{ label: 'It is safe now', to: 'INJ-BLEED' }, { label: 'I have left', to: 'END-AID' }],
  },
  'INJ-BLEED': { title: 'Is there serious bleeding?', kind: 'question', clinical: true, extract: ['ca-seconds'], answers: [{ label: 'Yes', to: 'INJ-PRESS' }, { label: 'No', to: 'INJ-BREATH' }] },
  'INJ-PRESS': {
    title: 'Apply direct pressure', kind: 'step', clinical: true, extract: ['ca-pressure'],
    answers: [{ label: 'Bleeding is under control', to: 'INJ-BREATH' }, { label: 'Deep wound, still bleeding', to: 'INJ-PACK' }, { label: "Arm or leg, can't stop it", to: 'INJ-TQ' }],
  },
  'INJ-PACK': { title: 'Pack the wound', kind: 'step', clinical: true, extract: ['ca-pack'], answers: [{ label: 'Bleeding is under control', to: 'INJ-BREATH' }, { label: 'Arm or leg, still bleeding', to: 'INJ-TQ' }] },
  'INJ-TQ': {
    title: 'Apply a tourniquet', kind: 'step', clinical: true, extract: ['ca-tourniquet'],
    note: 'Orb: note the time it went on, and tell the paramedics.',
    answers: [{ label: 'Bleeding has stopped', to: 'INJ-BREATH' }, { label: 'Still bleeding', to: 'INJ-999' }],
  },
  'INJ-BREATH': {
    title: 'Responding and breathing normally?', kind: 'question', clinical: true, extract: ['ss-firstaid'],
    note: 'Orb: citizenAID publishes its breathing steps in its app and pocket guide, not on its website, so they are not quoted here.',
    answers: [{ label: 'Yes', to: 'INJ-OTHER' }, { label: 'No, or not sure', to: 'INJ-999' }],
  },
  'INJ-999': {
    title: 'Follow the call handler', kind: 'step', clinical: true, extract: ['rht-tell'],
    note: 'Orb: for anything this guide does not cover, call 999 on speaker and follow the call handler.',
    answers: [{ label: 'Help has arrived', to: 'INJ-HANDOVER' }, { label: 'Check bleeding again', to: 'INJ-BLEED' }],
  },
  'INJ-OTHER': {
    title: 'Other injuries', kind: 'step', clinical: true, extract: ['ev-casualties'],
    note: 'Orb: stay with them, keep them warm and tell them help is coming. Check bleeding and breathing again if anything changes.',
    answers: [{ label: 'Help has arrived', to: 'INJ-HANDOVER' }, { label: 'Something changed', to: 'INJ-BLEED' }],
  },
  'INJ-HANDOVER': {
    title: 'Hand over', kind: 'step', clinical: true, extract: ['ev-casualties'],
    note: 'Orb: tell the paramedics what happened, what you saw and what you did, with times (pressure, packing, a tourniquet).',
    answers: [{ label: 'Handed over', to: 'END-AID' }, { label: 'Another casualty', to: 'INJ-BLEED' }],
  },

  // Several people injured: who to help first, then each casualty through the steps above
  'MC-SAFE': { title: 'Is it safe to help?', kind: 'question', clinical: true, extract: ['ss-firstaid', 'ev-injured'], answers: [{ label: 'It is safe', to: 'MC-ORDER' }, { label: 'It is not safe', to: 'INJ-WAIT' }] },
  'MC-ORDER': {
    title: 'Who to help first', kind: 'step', clinical: true, extract: ['ev-casualties'],
    note: "Orb: citizenAID's own order for several casualties is in its app and pocket guide, not on its website, so it is not quoted here. Until it is: tell the 999 call handler how many are hurt, then help anyone bleeding heavily first, then anyone not responding.",
    answers: [{ label: 'Start with the first person', to: 'INJ-BLEED' }, { label: 'Call 999 first', to: 'INJ-999' }],
  },

  // Endings: aftercare, then Start again or Leave
  'END-ATTACK': {
    title: 'After the incident', kind: 'end', extract: ['ev-after'],
    note: "Orb: tell your control room you are safe, write the incident report when you can, and ask your manager about support after what you've been through.",
    answers: ENDS,
  },
  'END-ITEM': { title: 'Afterwards', kind: 'end', extract: ['ui-say', 'ev-record'], note: 'Orb: write the incident report and log the item.', answers: ENDS },
  'END-AID': {
    title: 'Afterwards', kind: 'end', extract: ['ev-record'],
    note: "Orb: write the incident report, and talk to your manager about support if what you saw stays with you.",
    answers: ENDS,
  },
};

// The situation a card belongs to on the map (card id prefix → band)
export const BANDS = [
  { prefix: 'START', label: 'Start' },
  { prefix: 'KN-', label: 'Knife or weapon attack' },
  { prefix: 'FA-', label: 'Firearms' },
  { prefix: 'VE-', label: 'Vehicle used as a weapon' },
  { prefix: 'ATK-', label: 'Every attack (shared)' },
  { prefix: 'EX-', label: 'Explosion' },
  { prefix: 'UN-', label: 'Unattended item' },
  { prefix: 'SU-', label: 'Suspicious item' },
  { prefix: 'BT-', label: 'Bomb threat' },
  { prefix: 'INJ-', label: 'Someone injured' },
  { prefix: 'MC-', label: 'Several people injured' },
  { prefix: 'END-', label: 'Endings' },
];
export const bandOf = (id) => BANDS.find((b) => id.startsWith(b.prefix));

// Shortest answer path from the first card to a card, for opening the guide at any box on the map
export function pathTo(target) {
  const prev = { [START]: null };
  const queue = [START];
  while (queue.length) {
    const id = queue.shift();
    if (id === target) break;
    for (const a of FLOW[id].answers) if (FLOW[a.to] && !(a.to in prev)) { prev[a.to] = { id, label: a.label }; queue.push(a.to); }
  }
  if (!(target in prev)) return null;
  const steps = [];
  for (let at = target; prev[at]; at = prev[at].id) steps.unshift(prev[at]);
  return steps;
}
