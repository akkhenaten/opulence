// AI-drafted journeys for the seven situations the handover pack left unwritten (Firearms to Help an injured person).
// Written by AI on 6 Nov 2026 so the reviewer corrects something concrete, as the pack's DRAFT-WORDING.md did for M01-M03.
// Not from the pack, not clinically approved: every screen carries `aiDraft` and shows a banner. The Knife journey
// (screens.js) is untouched; these screens only link into its shared screens (K04, K07, K10, K12, X01-X06, C01).
// Art is the pack's own, using the assets it reserved for each scenario (asset-manifest.csv).
// Checked against ProtectUK (Run Hide Tell, the HOT test, the 4Cs) on 6 Nov 2026, written for Orb security officers.
const DRAFT = { clinical: 'AI draft, unverified', status: 'AI draft - for review', unwritten: false, aiDraft: true, variants: [] };
const PREFIX = { FA: 'firearms', VE: 'vehicle', EX: 'explosion', UN: 'unattended', SU: 'suspicious', MC: 'casualties', HI: 'injured' };
const screen = (id, type, title, art, text, buttons) => ({ id, type, title, text, art, buttons, journey: PREFIX[id.slice(0, 2)], ...DRAFT });

// Each situation, by the pack's card key: where its card starts, where "I'm in danger" → Get yourself safe goes,
// and where Police arriving goes. Knife is the pack's own; the shared pack screens follow whichever journey you are in.
export const JOURNEYS = {
  knife: { start: 'K01', safe: 'K01', police: 'K10' },
  firearms: { start: 'FA01', safe: 'FA01', police: 'FA06' },
  vehicle: { start: 'VE01', safe: 'VE01', police: 'K10' },
  explosion: { start: 'EX00', safe: 'EX00', police: 'EX05' },
  unattended: { start: 'UN01', safe: 'SU01', police: 'SU04' },
  suspicious: { start: 'SU01', safe: 'SU01', police: 'SU04' },
  casualties: { start: 'MC01', safe: 'MC02', police: 'MC03' },
  injured: { start: 'HI01', safe: 'HI02', police: 'HI03' },
};
// M03 (Other injuries, pack): the AI-drafted injuries join its picker, and "outside what this guide covers" gets a screen
export const M03_EXTRA = [{ label: 'Blast, crush or chest injury', to: 'IN00' }];
export const M03_OUTSIDE = 'IN04';
// The pack's Knife safety screens: arriving on one means you are now in the Knife journey.
// Not K03a (Staying hidden): Firearms shares it, so it keeps the journey you came from.
export const KNIFE_SAFETY = ['K01', 'K02', 'K02a', 'K03'];

const LIST = [
  // Firearms: Run, Hide, Tell, with cover that stops bullets rather than only hides you
  screen('FA01', 'journey screen', 'Get yourself safe', 'card-firearms.png',
    'If you hear shots, act now. Get away if there is a safe route. If there is not, get behind something solid and out of sight.',
    [{ label: 'Run', to: 'FA02' }, { label: 'Hide', to: 'FA03' }, { label: 'Tell police', to: 'FA04' }]),
  screen('FA02', 'journey screen', 'Run', 'k02-escape.png',
    'Move away from the danger. Leave your belongings. Tell others to come with you, but do not wait for them. Do not stop to film. Keep going and do not go back. If you can do it safely, stop others going in.',
    [{ label: 'Tell police', to: 'FA04' }, { label: "Your route isn't safe", to: 'FA03' }]),
  screen('FA03', 'journey screen', 'Hide behind something solid', 'hide-general.png',
    'Bullets can go through glass, doors, wood, metal and even brick. Get behind a solid, heavy wall such as thick concrete. Know your exits so you do not get trapped. Lock or block the door. Silence your phone, including vibrate. Stay low and away from the door. Open it only to police.',
    [{ label: 'Tell police', to: 'FA04' }, { label: 'Staying hidden', to: 'K03a' }, { label: 'Run', to: 'FA02' }]),
  screen('FA04', 'journey screen', 'Tell police', 'prompts-attacker.png',
    'Call 999 when you can do it safely. Tell them where you are, where the attackers are and which way they went, how many there are, what they look like and what they are carrying. Then how many people are hurt and how, the entrances and exits, and any hostages. Tell your control room when you can.',
    [{ label: 'If you cannot speak', to: 'X01' }, { label: "It isn't safe to call yet", to: 'X02' }, { label: 'Before you help', to: 'FA05' }]),
  screen('FA05', 'journey screen', 'Before you help', 'k06b-before-you-help.png',
    'Only go to someone once the shooting has stopped and you can reach them without being seen from where it came from. If not, stay where you are and tell police where they are.',
    [{ label: 'How many people are hurt?', to: 'K07' }, { label: 'Hide', to: 'FA03' }, { label: "No casualties, or you can't reach them", to: 'X03' }]),
  screen('FA06', 'journey screen', 'Police arriving', 'k10-police-arriving.png',
    'Armed officers may point guns at you, treat you firmly and question you: they cannot yet tell you from the attackers. Keep your hands empty and in view. Stay calm, do not point, and do what they tell you straight away. Tell them where the attackers went and where the injured are.',
    [{ label: 'Handing over', to: 'K11' }, { label: 'Before you help', to: 'FA05' }, { label: 'Aftercare and support', to: 'K12' }]),

  // Vehicle used as a weapon: ProtectUK has no public advice of its own (it points to Run Hide Tell); get off the road, behind something solid
  screen('VE01', 'journey screen', 'Get away from the road', 'escape-vehicle.png',
    'Get away from the road. Get behind something solid: a wall, a pillar or a building. Do not stop to look back or film.',
    [{ label: 'Take cover', to: 'VE02' }, { label: 'Tell police', to: 'VE03' }, { label: 'Someone got out with a knife', to: 'K01' }, { label: 'Someone got out with a gun', to: 'FA01' }]),
  screen('VE02', 'journey screen', 'Take cover', 'hide-vehicle.png',
    'Get behind something solid: a wall, a building, a pillar or heavy street furniture such as a bus stop, posts or trees. Glass shopfronts will not protect you. Keep away from the kerb and stay there until it has gone.',
    [{ label: 'Tell police', to: 'VE03' }, { label: 'Before you help', to: 'VE04' }, { label: 'Someone got out with a knife', to: 'K01' }, { label: 'Someone got out with a gun', to: 'FA01' }]),
  screen('VE03', 'journey screen', 'Tell police', 'k05-police-prompts.png',
    'Call 999. Tell them where you are, the colour and type of vehicle, the number plate if you saw it, which way it went, whether anyone got out, and how many people are hurt. Tell your control room when you can.',
    [{ label: 'If you cannot speak', to: 'X01' }, { label: 'Before you help', to: 'VE04' }]),
  screen('VE04', 'journey screen', 'Before you help', 'k06b-before-you-help.png',
    'Check the vehicle has stopped or gone, and that nobody got out with a weapon. Watch for other traffic. Do not try to move a vehicle off someone. If it is not safe, stay put and tell police.',
    [{ label: 'How many people are hurt?', to: 'K07' }, { label: 'Take cover', to: 'VE02' }, { label: "No casualties, or you can't reach them", to: 'X03' }]),

  // Explosion: inside your building, get out; outside it, stay in away from glass (ProtectUK: fragments travel far). A second device is possible
  screen('EX00', 'journey screen', 'Where was the explosion?', 'card-explosion.png',
    'Glass and debris can injure people a long way from an explosion, and there may be a second device. What you do first depends on where it was.',
    [{ label: 'Inside this building', to: 'EX01' }, { label: 'Outside this building', to: 'EX06' }]),
  screen('EX01', 'journey screen', 'Get out', 'escape-building.png',
    'Leave by the nearest safe exit. There may be a second device. Leave your belongings and do not use lifts. Cover your nose and mouth if there is dust or smoke. Do not go back in.',
    [{ label: 'Once you are out', to: 'EX03' }, { label: "You can't get out", to: 'EX02' }, { label: 'Tell police', to: 'K04' }]),
  screen('EX02', 'journey screen', "You can't get out", 'hide-general.png',
    'Move away from the damaged area to a room with solid walls, away from windows. Stay low if there is smoke. Call 999 and tell them exactly where you are.',
    [{ label: 'Tell them where you are', to: 'X06' }, { label: 'Tell police', to: 'K04' }, { label: 'Get out', to: 'EX01' }]),
  screen('EX03', 'journey screen', 'Once you are out', 'card-explosion.png',
    'Keep moving away. There may be a second device. Do not gather in a crowd, near glass, or next to parked cars and bins. Follow what police and staff tell you.',
    [{ label: 'Tell police', to: 'K04' }, { label: 'Before you help', to: 'EX04' }, { label: 'Aftercare and support', to: 'K12' }]),
  screen('EX04', 'journey screen', 'Before you help', 'gate-explosion.png',
    'Stop and look before you go in. Is the building stable? Is there fire, smoke or a smell of gas? Could there be a second device? If you are not sure, stay out and tell police where the injured are.',
    [{ label: 'How many people are hurt?', to: 'K07' }, { label: 'Once you are out', to: 'EX03' }, { label: "No casualties, or you can't reach them", to: 'X03' }]),
  screen('EX05', 'journey screen', 'Police arriving', 'k10-police-arriving.png',
    'Officers will not know who you are. Keep your hands empty and visible and do what they tell you straight away. Tell them where you were, what you saw and heard, where the injured are, and anything that looked out of place.',
    [{ label: 'Handing over', to: 'K11' }, { label: 'Before you help', to: 'EX04' }, { label: 'Aftercare and support', to: 'K12' }]),
  screen('EX06', 'journey screen', 'Stay inside', 'hide-general.png',
    'Do not go out to look. Move people away from windows, glass doors and the street side of the building, to an inner room or corridor. Keep everyone inside. There may be a second device. Wait until police or your control room tell you it is safe to leave.',
    [{ label: 'Tell police', to: 'K04' }, { label: 'Before you help', to: 'EX04' }, { label: 'You have to leave', to: 'EX01' }]),

  // Unattended item: Confirm with the HOT test; most are simply lost, and those go to the venue's lost property procedure
  screen('UN01', 'journey screen', 'Confirm: lost or suspicious?', 'card-unattended.png',
    'Most bags left alone have simply been forgotten. Do not touch it, open it or move it.\nCheck it with HOT. If any answer worries you, treat it as suspicious.\n- Hidden: has it been hidden on purpose?\n- Obviously suspicious: can you see wires, batteries, tape, liquids or putty?\n- Typical: is it the kind of thing usually left here?\nAsk who left it or saw it left, look for a name label, and ask your control room to check CCTV.',
    [{ label: 'Nobody owns it, not suspicious', to: 'UN02' }, { label: 'It looks suspicious', to: 'SU01' }, { label: 'Someone owns it', to: '@start' }]),
  screen('UN02', 'journey screen', 'Lost property', 'prompts-item.png',
    'Tell your control room or supervisor where it is, what it looks like and when it was found. Follow the venue\'s lost property procedure. If anything about it worries you when it is checked, stop and treat it as suspicious.',
    [{ label: 'It looks suspicious', to: 'SU01' }, { label: 'End', to: '@end' }]),

  // Suspicious item, the 4Cs after Confirm: Clear (ProtectUK's distances, out of line of sight), Communicate, Control
  screen('SU01', 'journey screen', 'Clear: move people away', 'gate-no-threat.png',
    'Do not touch it. Move yourself and others away: at least 100 metres from a bag or rucksack, 200 metres from a car or wheelie bin, 400 metres from a van or lorry. Get out of its line of sight, behind brick or concrete, not glass or parked cars. Do not use your phone or radio within 15 metres of it.',
    [{ label: 'Tell police', to: 'SU02' }, { label: 'Keep people away', to: 'SU03' }]),
  screen('SU02', 'journey screen', 'Communicate: tell police', 'prompts-item.png',
    'Once you are well away and out of sight of it, call 999. Tell your control room or supervisor too. Say where the item is, what it looks like, why you think it is suspicious and when it was found.',
    [{ label: 'If you cannot speak', to: 'X01' }, { label: 'Keep people away', to: 'SU03' }]),
  screen('SU03', 'journey screen', 'Control: keep people away', 'card-suspicious.png',
    'From behind your cordon, stop anyone walking towards it. Do not go back to check on it. Keep witnesses with you, or take their names and numbers, so police can speak to them.',
    [{ label: 'Tell police', to: 'SU02' }, { label: 'Aftercare and support', to: 'K12' }]),
  screen('SU04', 'journey screen', 'Police arriving', 'k10-police-arriving.png',
    'Stay where you are, well away from the item. Keep your hands visible and do what officers tell you straight away. Tell them where the item is, what it looks like, when it was found, and which witnesses you kept.',
    [{ label: 'Keep people away', to: 'SU03' }, { label: 'Aftercare and support', to: 'K12' }]),

  // Multiple casualties and Help an injured person: a safety check, then the pack's own casualty screens.
  // Their own Get yourself safe (danger is whatever hurt them, not only an attacker) and Police arriving (often with an ambulance)
  screen('MC01', 'journey screen', 'Check it is safe first', 'card-casualties.png',
    'Before you go to anyone, look around. Is whatever hurt them still a danger? If you do not know what happened, or it is not safe, stay back and call 999.',
    [{ label: 'It is safe to help', to: 'C01' }, { label: 'It is not safe', to: 'MC02' }]),
  screen('MC02', 'journey screen', 'Get yourself safe', 'k01-safety-entry.png',
    'If whatever hurt them could still hurt you, such as traffic, fire, smoke, a smell of gas, something falling or a person, get yourself and others away from it first. You cannot help anyone if you are hurt too. Call 999 from somewhere safe and tell them what you can see. Tell your control room.',
    [{ label: 'It is safe now', to: 'MC01' }, { label: 'Someone is attacking people', to: 'K01' }]),
  screen('MC03', 'journey screen', 'Police and ambulance arriving', 'k10-police-arriving.png',
    'Police, ambulance and fire crews may arrive together and will take charge. Keep your hands visible and do what they tell you straight away. Tell them how many people are hurt and where, who you have helped and what you did, and anything that is still dangerous.',
    [{ label: 'Handing over', to: 'K11' }, { label: 'Who to help first', to: 'C02' }, { label: 'Aftercare and support', to: 'K12' }]),
  screen('HI01', 'journey screen', 'Check it is safe first', 'card-injured.png',
    'Before you go to them, check it is safe for you: traffic, fire, or someone who could hurt you. If it is safe, go to them and find out what is wrong.',
    [{ label: 'It is safe to help', to: 'K08' }, { label: 'It is not safe', to: 'HI02' }, { label: 'Several people hurt', to: 'C01' }]),
  screen('HI02', 'journey screen', 'Get yourself safe', 'k01-safety-entry.png',
    'If something could still hurt you, such as traffic, fire, something falling or a person, keep back or move away from it. Do not become a second casualty. Call 999 from somewhere safe and tell them where the injured person is. Go to them only when it is safe.',
    [{ label: 'It is safe now', to: 'HI01' }, { label: 'Someone is attacking people', to: 'K01' }]),
  screen('HI03', 'journey screen', 'Police and ambulance arriving', 'k10-police-arriving.png',
    'When the ambulance or police arrive, wave them over or send someone to meet them and bring them to you. Keep your hands visible and do what they tell you. Stay with the injured person until they take over.',
    [{ label: 'Medical handover', to: 'M05' }, { label: 'Monitor and reassess', to: 'M04' }, { label: 'Aftercare and support', to: 'K12' }]),

  // More injuries for M03 (Other injuries). Severe bleeding first, as in the pack (citizenAID's order).
  // No art yet: the pack has none for these, and borrowing another injury's picture would mislead.
  screen('IN00', 'clinical module', 'Blast, crush or chest injury', null,
    'Choose the injury. If there is bleeding that will not stop, deal with that first.',
    [{ label: 'Blast injury', to: 'IN01' }, { label: 'Crush injury', to: 'IN02' }, { label: 'Chest injury', to: 'IN03' }, { label: 'Severe bleeding', to: 'M01' }]),
  screen('IN01', 'clinical module', 'Blast injury', null,
    'Deal with any bleeding that will not stop first.\n- Someone close to a blast can be badly hurt inside with little to see: chest, belly and ears. Treat anyone who was close as seriously hurt, even if they say they are fine.\n- Look for wounds on the back, armpits, groin and under clothing.\n- Do not pull out anything stuck in a wound. Press around it.\n- Keep them still and warm. Tell the ambulance crew how close they were to the blast.',
    [{ label: 'Severe bleeding', to: 'M01' }, { label: 'Chest injury', to: 'IN03' }, { label: 'Monitor and reassess', to: 'M04' }]),
  screen('IN02', 'clinical module', 'Crush injury', null,
    'Do not try to lift something heavy on your own or put yourself in danger. Call 999 and tell them someone is trapped, by what, and since when.\n- If you can free them safely and quickly, do.\n- Once they are free they can become very unwell quickly. Keep them lying still and warm and deal with any bleeding.\n- Watch their breathing. If they stop responding or breathing normally, go to Unresponsive.',
    [{ label: 'Severe bleeding', to: 'M01' }, { label: 'Unresponsive or abnormal breathing', to: 'M02' }, { label: 'Monitor and reassess', to: 'M04' }]),
  screen('IN03', 'clinical module', 'Chest injury', null,
    'If there is a wound to the chest that is bleeding, press on it with a pad, or your gloved hand.\n- Do not seal the wound with tape, plastic or anything airtight.\n- Do not pull out anything stuck in it. Press around it.\n- If they are struggling to breathe, let them sit in the position they find easiest, often sitting up and leaning towards the injured side.\n- If they stop responding or breathing normally, go to Unresponsive.',
    [{ label: 'Unresponsive or abnormal breathing', to: 'M02' }, { label: 'Severe bleeding', to: 'M01' }, { label: 'Monitor and reassess', to: 'M04' }]),
  screen('IN04', 'clinical module', 'Outside what this guide covers', null,
    'This guide does not cover this injury. Call 999 on speaker and do what the call handler tells you. Stay with them, keep them still and warm, and watch their breathing. If they stop responding or breathing normally, go to Unresponsive.',
    [{ label: 'Unresponsive or abnormal breathing', to: 'M02' }, { label: 'Monitor and reassess', to: 'M04' }, { label: 'Medical handover', to: 'M05' }]),
];

export const DRAFT_SCREENS = Object.fromEntries(LIST.map((s) => [s.id, s]));
