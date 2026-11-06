// The Emergency guide (Knife journey plus seven AI-drafted ones) is draft clinical copy: the platform admin decides who sees it
import { isPlatformAdmin } from './platform.mjs';

export const GUIDE_LEVELS = ['platform', 'managers', 'everyone'];
const OPEN = { platform: [], managers: ['company', 'security'], everyone: ['company', 'security', 'officer', 'venue'] };

export const canSeeGuide = (user, level = 'platform') => isPlatformAdmin(user) || (OPEN[level] || []).includes(user?.role);

// The flowchart quotes ProtectUK and citizenAID verbatim; without both permissions recorded it stays platform admin only, whatever the guide level
export const canSeeFlow = (user, level = 'platform', licensed = false) => canSeeGuide(user, licensed ? level : 'platform');
