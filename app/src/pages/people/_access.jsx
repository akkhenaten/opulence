// Who a manager or venue user is, and what they can reach: role, then the client they speak for, then their venues
import { dateTime } from '../../ui/index.jsx';
import { Chips } from './_parts.jsx';
import { AddPersonSheet } from './_person.jsx';
import { ClientSelect } from '../money/_client.jsx';

export const USER_ROLES = ['company', 'security', 'venue'];
export const ROLE_HINT = {
  company: 'Full access to everything, including money and settings.',
  security: 'Runs the rota, live view, timesheets and incidents for their venues.',
  venue: 'Client contact. Requests cover, signs off timesheets and sees invoices for their venues.',
};

/** Venues after a change of client: the old client's venues go, the new client's come in, venues ticked by hand stay. */
export function clientVenueIds(prev, nextClientVenues, oldClientVenues = []) {
  const old = new Set(oldClientVenues);
  return [...new Set([...prev.filter((id) => !old.has(id)), ...nextClientVenues])];
}

/** Client (venue and security users) and venue ticks. `v` holds client_id and venue_ids. */
export function AccessFields({ role, v, set, venues, clients, onClientCreated }) {
  if (role === 'company') return null;
  const venuesOf = (cid) => (cid ? venues.filter((x) => x.client_id === cid).map((x) => x.id) : []);
  const pickClient = (cid) => {
    set('venue_ids', clientVenueIds(v.venue_ids, venuesOf(cid), venuesOf(v.client_id)));
    set('client_id', cid);
  };
  // The client's own venues first, so it is clear what came with the client
  const ordered = v.client_id ? [...venues].sort((a, b) => (b.client_id === v.client_id) - (a.client_id === v.client_id)) : venues;
  return (
    <>
      <ClientSelect clients={clients} value={v.client_id} onChange={pickClient} onCreated={onClientCreated}
        label={role === 'venue' ? 'Client they work for (optional)' : 'Client they look after (optional)'}
        hint={v.client_id ? "Ticks all of this client's venues. You can change them below." : 'Pick a client to tick all its venues at once.'} />
      <Chips label={role === 'venue' ? 'Venues they manage' : 'Venues they look after'} value={v.venue_ids} onChange={(x) => set('venue_ids', x)}
        options={ordered.map((x) => ({ value: x.id, label: x.name }))} />
    </>
  );
}

/** Under an invite link: whether the email went, so a failed one is never silent */
export const inviteHint = (emailed, email) => (emailed
  ? `Sent to ${email}. You can also share this link.`
  : "The email didn't go through. Copy this link and open it, or send it to them.");

/** A pending invite's last email, from the login's invite_sent_at / invite_emailed: when it went, if it failed, or never sent.
 *  "Sent" means the mail service took it; whether it reached the inbox (or spam) can't be known. */
export const inviteStatus = (u) => {
  if (!u.invite_sent_at) return { tone: 'grey', short: 'Invite not emailed yet', hint: 'Not emailed yet. Tap Resend invite to email it, or copy this link and send it to them.' };
  const when = dateTime(u.invite_sent_at);
  return u.invite_emailed
    ? { tone: 'green', short: `Invite emailed ${when}`, hint: `Emailed to ${u.email} on ${when}. If it isn't in their inbox or spam, copy this link and send it by WhatsApp or text.` }
    : { tone: 'amber', short: `Invite email failed ${when}`, hint: `The last email didn't go through (${when}). Copy this link and send it to them, or tap Resend invite.` };
};

// The platform admin's login is always a Company manager (the server enforces it; this just shows it)
export const PLATFORM_EMAILS = ['info@orbsolutions.co.uk'];

const APP_NAME = { officer: 'Officer app', company: 'Office', security: 'Security manager', venue: 'Venue manager' };
const listOf = (xs) => (xs.length <= 2 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const PLACE = ['security', 'venue'];

/** "Will gain: Security manager, Club One · Will lose: Officer app" for a change of ticks, venues and pay */
export function accessPreview(start, v, venues = []) {
  const nameOf = (id) => venues.find((x) => x.id === id)?.name;
  const apps = (x) => [x.officer && 'officer', x.manager].filter(Boolean);
  const gain = apps(v).filter((k) => !apps(start).includes(k)).map((k) => APP_NAME[k]);
  const lose = apps(start).filter((k) => !apps(v).includes(k)).map((k) => APP_NAME[k]);
  const before = PLACE.includes(start.manager) ? start.venue_ids || [] : [];
  const after = PLACE.includes(v.manager) ? v.venue_ids || [] : [];
  gain.push(...after.filter((id) => !before.includes(id)).map(nameOf).filter(Boolean));
  lose.push(...before.filter((id) => !after.includes(id)).map(nameOf).filter(Boolean));
  const kept = before.filter((id) => after.includes(id)).map(nameOf).filter(Boolean);
  const moved = start.manager && v.manager && start.manager !== v.manager && kept.length;
  const pay = (x) => x.manager === 'company' || (x.manager === 'security' && !!x.can_see_pay);
  if (pay(v) !== pay(start)) (pay(v) ? gain : lose).push('pay');
  return [gain.length && `Will gain: ${listOf(gain)}`, lose.length && `Will lose: ${listOf(lose)}`, moved && `Keeps ${listOf(kept)} as ${APP_NAME[v.manager]}`]
    .filter(Boolean).join(' · ');
}

/** Old callers: invite a manager or venue user. `preset.role` picks the manager access; the sheet is Add person. */
export function InviteSheet({ preset = {}, onClose, onDone }) {
  const { role, ...rest } = preset;
  return <AddPersonSheet title="Invite manager or venue user" preset={{ manager: role || 'security', officer: false, ...rest }} onClose={onClose} onDone={onDone} />;
}
