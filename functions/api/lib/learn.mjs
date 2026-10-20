// Shared by Academy and Toolbox: who is on a venue's team, and the rules AI drafting follows.
import { q } from './db.mjs';
import { addDays, londonDate } from './time.mjs';

/** Venues an officer has worked in the last 90 days or is booked at in the next 30. */
export async function officerVenues(officerId) {
  if (!officerId) return [];
  return (await q(`SELECT DISTINCT s.venue_id FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id
    WHERE a.officer_id = $1 AND a.status IN ('assigned','accepted') AND s.starts_at > now() - interval '90 days' AND s.starts_at < now() + interval '30 days'`, [officerId])).map((r) => r.venue_id);
}

/** Active officers on a venue's team (same window as above). */
export async function venueTeam(venueId) {
  return (await q(`SELECT DISTINCT a.officer_id FROM shift_assignments a JOIN shifts s ON s.id = a.shift_id JOIN officers o ON o.id = a.officer_id
    WHERE s.venue_id = $1 AND a.status IN ('assigned','accepted') AND o.status = 'active'
      AND s.starts_at > now() - interval '90 days' AND s.starts_at < now() + interval '30 days'`, [venueId])).map((r) => r.officer_id);
}

export const reviewDate = () => addDays(londonDate(new Date()), 365);

// Every AI-drafted lesson, question and card follows these; a manager approves before officers see it
export const CONTENT_RULES = `You write training material for licensed security officers working for a UK manned-guarding company (door supervisors, security guards, CCTV operators, stewards).
Rules:
- Base everything on current law and guidance for England and Wales unless told otherwise, and on recognised UK sources: SIA licence-linked qualification specifications and guidance, Police and Criminal Evidence Act 1984 (s24A any-person arrest), Criminal Law Act 1967 s3 and common law on reasonable force, Licensing Act 2003, Equality Act 2010, UK GDPR / Data Protection Act 2018 and ICO guidance on CCTV and body-worn video, Protect Duty / Terrorism (Protection of Premises) Act 2025 (Martyn's Law), ACT / NaCTSO guidance, Resuscitation Council UK guidelines, St John Ambulance and British Red Cross first aid guidance, NHS advice, Ask for Angela and WAVE vulnerability guidance.
- Name the sources you relied on. Never invent case names, section numbers, statistics or quotations; if unsure, describe the principle without a citation.
- First aid is awareness level: always say to call 999 for emergencies, follow the trained first aider and the 999 call handler, and that this does not replace a certified first aid course. Never give drug doses or anything beyond standard lay first aid.
- Be practical and plain: short sentences, British English, second person ("you"). Explain what the officer may and may not do and why.
- Never describe people by ethnicity or other protected characteristics. Use "they" for people.
- Scotland and Northern Ireland differ on some law: say so briefly where it matters.
- When rating options: "best" is what UK law and SIA guidance expect; "ok" is safe and lawful but not ideal; "poor" must say the legal or safety risk.`;
