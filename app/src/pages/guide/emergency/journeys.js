// The guide as the app shows it: the handover pack (screens.js, generated) plus the AI-drafted journeys (drafts.js).
// A pack card with its own journey keeps it; an unwritten one opens its AI draft. A draft never replaces a pack screen.
import { CARDS as PACK_CARDS, SCREENS as PACK_SCREENS } from './screens.js';
import { DRAFT_SCREENS, JOURNEYS, KNIFE_SAFETY } from './drafts.js';

for (const id of Object.keys(DRAFT_SCREENS)) if (PACK_SCREENS[id]) throw new Error(`AI draft ${id} would replace a pack screen`);

export { JOURNEYS };
export const CARDS = PACK_CARDS.map((c) => (c.to || !JOURNEYS[c.key] ? c : { ...c, to: JOURNEYS[c.key].start, aiDraft: true }));
export const SCREENS = { ...PACK_SCREENS, ...DRAFT_SCREENS };

/** The journey a screen belongs to, or null for the shared pack screens (they keep the journey you came from) */
export const journeyOf = (id) => SCREENS[id]?.journey || (KNIFE_SAFETY.includes(id) ? 'knife' : null);
