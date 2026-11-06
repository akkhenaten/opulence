// AI-drafted journeys for the seven situations the handover pack left unwritten (Firearms to Help an injured person).
// Written by AI on 6 Nov 2026 so the reviewer corrects something concrete, as the pack's DRAFT-WORDING.md did for M01-M03.
// Not from the pack, not clinically approved: every screen carries `aiDraft` and shows a banner. The Knife journey
// (screens.js) is untouched; these screens only link into its shared screens (K04, K07, K10, K12, X01-X06, C01).
// Art is the pack's own, using the assets it reserved for each scenario (asset-manifest.csv).
const DRAFT = { clinical: 'AI draft, unverified', status: 'AI draft - for review', unwritten: false, aiDraft: true, variants: [] };
const screen = (id, type, title, art, text, buttons) => ({ id, type, title, text, art, buttons, ...DRAFT });

// Where each opening card starts, by the pack's card key
export const STARTS = { firearms: 'FA01', vehicle: 'VE01', explosion: 'EX01', unattended: 'UN01', suspicious: 'SU01', casualties: 'MC01', injured: 'HI01' };

const LIST = [
  // Firearms: Run, Hide, Tell, with cover that stops bullets rather than only hides you
  screen('FA01', 'journey screen', 'Get yourself safe', 'card-firearms.png',
    'If you hear shots, act now. Get away if there is a safe route. If there is not, get behind something solid and out of sight.',
    [{ label: 'Run', to: 'FA02' }, { label: 'Hide', to: 'FA03' }, { label: 'Tell police', to: 'FA04' }]),
  screen('FA02', 'journey screen', 'Run', 'k02-escape.png',
    'Move away from the sound of the shots. Leave your belongings. Take others only if they come straight away. Keep going and do not go back.',
    [{ label: 'Tell police', to: 'FA04' }, { label: "Your route isn't safe", to: 'FA03' }]),
  screen('FA03', 'journey screen', 'Hide behind something solid', 'hide-general.png',
    'Glass, doors and car doors will not stop bullets. Get behind brick or concrete. Lock or block the door. Silence your phone, including vibrate. Stay low and away from the door. Open it only to police.',
    [{ label: 'Tell police', to: 'FA04' }, { label: 'Staying hidden', to: 'K03a' }, { label: 'Run', to: 'FA02' }]),
  screen('FA04', 'journey screen', 'Tell police', 'prompts-attacker.png',
    'Call 999 when you can do it safely. Tell them where you are, where the attackers are, how many there are, what they look like, what they are carrying, and which way they went.',
    [{ label: 'If you cannot speak', to: 'X01' }, { label: "It isn't safe to call yet", to: 'X02' }, { label: 'Before you help', to: 'FA05' }, { label: 'Police arriving', to: 'K10' }]),
  screen('FA05', 'journey screen', 'Before you help', 'k06b-before-you-help.png',
    'Only go to someone once the shooting has stopped and you can reach them without being seen from where it came from. If not, stay where you are and tell police where they are.',
    [{ label: 'How many people are hurt?', to: 'K07' }, { label: 'Hide', to: 'FA03' }, { label: "No casualties, or you can't reach them", to: 'X03' }]),

  // Vehicle used as a weapon: move off the road at an angle, get behind solid structure, watch for anyone getting out
  screen('VE01', 'journey screen', 'Get away from the road', 'escape-vehicle.png',
    'Move away from the road at an angle, not along it. Get behind something solid: a wall, a pillar or a building. Do not stop to look back or film.',
    [{ label: 'Take cover', to: 'VE02' }, { label: 'Tell police', to: 'VE03' }, { label: 'Someone got out with a weapon', to: 'K01' }]),
  screen('VE02', 'journey screen', 'Take cover', 'hide-vehicle.png',
    'Stay behind solid structure, away from the kerb. Shop windows, bins and railings will not stop a vehicle. Stay there until it has gone.',
    [{ label: 'Tell police', to: 'VE03' }, { label: 'Someone got out with a weapon', to: 'K01' }, { label: 'Before you help', to: 'VE04' }]),
  screen('VE03', 'journey screen', 'Tell police', 'k05-police-prompts.png',
    'Call 999. Tell them where you are, the colour and type of vehicle, the number plate if you saw it, which way it went, and whether anyone got out.',
    [{ label: 'If you cannot speak', to: 'X01' }, { label: 'Before you help', to: 'VE04' }, { label: 'Police arriving', to: 'K10' }]),
  screen('VE04', 'journey screen', 'Before you help', 'k06b-before-you-help.png',
    'Check the vehicle has stopped or gone, and that nobody got out with a weapon. Watch for other traffic. Do not try to move a vehicle off someone. If it is not safe, stay put and tell police.',
    [{ label: 'How many people are hurt?', to: 'K07' }, { label: 'Take cover', to: 'VE02' }, { label: "No casualties, or you can't reach them", to: 'X03' }]),

  // Explosion: get out, keep away from glass and crowds, a second device is possible
  screen('EX01', 'journey screen', 'Get out', 'escape-building.png',
    'Leave by the nearest safe exit. Leave your belongings. Do not use lifts. Watch for broken glass and falling debris. Do not go back in.',
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

  // Unattended item: most are simply lost; don't touch, ask around, tell staff
  screen('UN01', 'journey screen', 'Unattended item', 'card-unattended.png',
    'Most bags left alone have simply been forgotten. Do not touch it, open it or move it. Ask people nearby if it is theirs.',
    [{ label: 'Nobody owns it', to: 'UN02' }, { label: 'It looks suspicious', to: 'SU01' }, { label: 'Someone owns it', to: '@end' }]),
  screen('UN02', 'journey screen', 'Tell staff or security', 'prompts-item.png',
    'Tell staff or security where it is, what it looks like and when you first saw it. If there is nobody to tell, call 999. Make the call away from the item, not next to it.',
    [{ label: 'It looks suspicious', to: 'SU01' }, { label: 'Tell police', to: 'K04' }, { label: 'End', to: '@end' }]),

  // Suspicious item: don't touch, move away out of sight behind something solid, no phone or radio near it
  screen('SU01', 'journey screen', 'Move away', 'gate-no-threat.png',
    'Do not touch it. Move away and keep going until you are out of sight of it, behind something solid. Take others with you. Do not use your phone or radio close to it.',
    [{ label: 'Tell police', to: 'SU02' }, { label: 'Keep people away', to: 'SU03' }]),
  screen('SU02', 'journey screen', 'Tell police', 'prompts-item.png',
    'Once you are well away, call 999. Tell them where the item is, what it looks like, why it worries you and when you saw it. Tell staff or security too.',
    [{ label: 'If you cannot speak', to: 'X01' }, { label: 'Keep people away', to: 'SU03' }, { label: 'Police arriving', to: 'K10' }]),
  screen('SU03', 'journey screen', 'Keep people away', 'card-suspicious.png',
    'If you can do it from a safe distance, stop others walking towards it. Do not go back to check on it. Wait for police and tell them what you saw.',
    [{ label: 'Police arriving', to: 'K10' }, { label: 'Tell police', to: 'SU02' }, { label: 'Aftercare and support', to: 'K12' }]),

  // Multiple casualties and Help an injured person: a safety check, then the pack's own casualty screens
  screen('MC01', 'journey screen', 'Check it is safe first', 'card-casualties.png',
    'Before you go to anyone, look around. Is whatever hurt them still a danger? If you do not know what happened, or it is not safe, stay back and call 999.',
    [{ label: 'It is safe to help', to: 'C01' }, { label: 'It is not safe', to: 'K01' }]),
  screen('HI01', 'journey screen', 'Check it is safe first', 'card-injured.png',
    'Before you go to them, check it is safe for you: traffic, fire, or someone who could hurt you. If it is safe, go to them and find out what is wrong.',
    [{ label: 'It is safe to help', to: 'K08' }, { label: 'It is not safe', to: 'K01' }, { label: 'Several people hurt', to: 'C01' }]),
];

export const DRAFT_SCREENS = Object.fromEntries(LIST.map((s) => [s.id, s]));
