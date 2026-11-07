// Orb's venue setup check: what a venue is missing (address, map pin, logo, a confirmed geofence radius)
// and what Orb found to fill it in. Pure rules here; the runner and the card decisions are in modules/venueSetup.mjs.
import { createHash } from 'node:crypto';

export const RADIUS_DEFAULT = 150;
export const RADIUS_CHOICES = [50, 75, 100, 150, 200, 300, 500];
const blank = (x) => !String(x ?? '').trim();
const sig = (...parts) => createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 12);
const host = (u) => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return u; } };

/** Which details are missing, with a signature of the values behind each, so a dismissal holds until they change. */
export function missing(v) {
  const out = [];
  const noAddress = blank(v.address) || blank(v.postcode);
  const noPin = v.lat == null || v.lng == null;
  if (noAddress) out.push({ key: 'address', sig: sig(v.address || '', v.postcode || '', noPin) });
  else if (noPin) out.push({ key: 'pin', sig: sig(v.postcode) });
  if (!v.logo_url) out.push({ key: 'logo', sig: sig(v.website_url || '') });
  if (!v.radius_confirmed_at) out.push({ key: 'radius', sig: sig(v.radius_m) });
  return out;
}

/** Keys still to raise: missing and not dismissed for the same values. */
export const toRaise = (v, dismissed = []) => missing(v).filter((m) => !dismissed.some((d) => d.issue_key === m.key && d.sig === m.sig));

/**
 * The card's issues from what is missing and what Orb found.
 * found: { address: { best, website }, pin: { lat, lng }, logos: [...], website }; soon: shifts booked there in the next 14 days.
 */
export function buildIssues(v, keys, found = {}, { soon = 0 } = {}) {
  const urgentIfBooked = soon ? 'soon' : 'advisory';
  const booked = soon ? ` ${soon} shift${soon === 1 ? ' is' : 's are'} booked there in the next two weeks.` : '';
  const issues = [];
  for (const m of keys) {
    if (m.key === 'address') {
      const best = found.address?.best;
      const noPin = v.lat == null || v.lng == null;
      const actions = [];
      if (best) {
        const where = [best.address, best.postcode].filter(Boolean).join(', ');
        actions.push({ id: 'address', kind: 'address', default: true, params: { address: best.address || '', postcode: best.postcode, lat: best.lat, lng: best.lng, source: best.source },
          label: `Save the address ${where}${best.lat != null && noPin ? ' and drop the map pin there' : ''} (from ${best.source === 'website' ? 'their website' : 'the map'})` });
      }
      const site = found.address?.website || found.website;
      if (site && blank(v.website_url)) actions.push({ id: 'website', kind: 'website', default: true, company_only: true, params: { url: site }, label: `Save their website, ${host(site)}` });
      issues.push({
        key: 'address', sig: m.sig, severity: urgentIfBooked, actions,
        title: noPin ? 'No address or map pin' : 'No full address',
        detail: (best ? 'Orb found it online. Check it before you save.' : "Orb couldn't find it online. Add it in Site setup.") + (noPin ? ' Officers can\'t clock in on location without a pin.' : '') + booked,
      });
    } else if (m.key === 'pin') {
      const p = found.pin;
      issues.push({
        key: 'pin', sig: m.sig, severity: urgentIfBooked, title: 'No map pin',
        detail: `Officers can't clock in on location without a pin.${p ? '' : ` Orb couldn't place ${v.postcode}; drop the pin in Site setup.`}${booked}`,
        actions: p ? [{ id: 'pin', kind: 'pin', default: true, params: { lat: p.lat, lng: p.lng }, label: `Drop the map pin at ${v.postcode}` }] : [],
      });
    } else if (m.key === 'logo') {
      const logo = (found.logos || [])[0];
      issues.push({
        key: 'logo', sig: m.sig, severity: 'advisory', title: 'No logo',
        detail: logo ? 'Orb found one on their website. It shows next to the venue name in the app.' : "Orb couldn't find one on their website. Upload one in Site setup.",
        actions: logo ? [{ id: 'logo', kind: 'logo', default: true, params: { url: logo.url }, label: `Use the logo from ${host(logo.url)}` }] : [],
      });
    } else if (m.key === 'radius') {
      const r = Number(v.radius_m) || RADIUS_DEFAULT;
      issues.push({
        key: 'radius', sig: m.sig, severity: 'advisory', title: 'Clock-in radius not confirmed',
        detail: `Officers clock in on location within ${r} m of the pin. Nobody has checked that suits this venue yet: a small bar needs less, a stadium or park more.`,
        actions: [{ id: 'radius', kind: 'radius', default: true, params: { radius_m: r }, label: `Keep the clock-in radius at ${r} m` }],
      });
    }
  }
  const rank = { soon: 0, advisory: 1 };
  return issues.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export const cardTitle = (v, issues) => `${v.name}: ${issues[0].title.charAt(0).toLowerCase()}${issues[0].title.slice(1)}${issues.length > 1 ? ` (+${issues.length - 1} more)` : ''}`;

export function cardReason(issues) {
  const found = issues.filter((i) => i.actions.some((a) => a.kind !== 'radius')).length;
  const lost = issues.filter((i) => ['address', 'pin', 'logo'].includes(i.key) && !i.actions.some((a) => a.kind !== 'website')).length;
  return [found && `Orb found ${found === 1 ? 'what is missing' : 'most of what is missing'} and has it ready to save.`, lost && `${lost === 1 ? 'One detail needs' : `${lost} details need`} adding by hand in Site setup.`,
    issues.some((i) => i.actions.length) ? 'Tick what to apply. Nothing is saved until you approve.' : 'Then this card clears by itself.'].filter(Boolean).join(' ');
}

/** The default choices, as bulk approve uses them: ticked by default and allowed for this role. */
export const defaultActions = (issues, role) => issues.flatMap((i) => i.actions.filter((a) => a.default && (!a.company_only || role === 'company')).map((a) => a.id));

export const clampRadius = (r) => Math.max(25, Math.min(1000, Math.round(Number(r) || RADIUS_DEFAULT)));
