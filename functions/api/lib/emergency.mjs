// The Emergency guide (Knife journey plus seven AI-drafted ones) is draft clinical copy: the platform admin decides who sees it
import { isPlatformAdmin } from './platform.mjs';

export const GUIDE_LEVELS = ['platform', 'managers', 'everyone'];
const OPEN = { platform: [], managers: ['company', 'security'], everyone: ['company', 'security', 'officer', 'venue'] };

export const canSeeGuide = (user, level = 'platform') => isPlatformAdmin(user) || (OPEN[level] || []).includes(user?.role);

// The flowchart (ProtectUK and citizenAID verbatim) is live for every signed-in user on every shift card, unless the platform admin takes it offline.
// The owner chose to go live before both permissions were in (6 Nov 2026); flow_licensed only records when they arrive.
export const canSeeFlow = (user, live = true) => isPlatformAdmin(user) || (!!live && !!user);
