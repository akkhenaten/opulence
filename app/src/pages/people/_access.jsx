// Who a manager or venue user is, and what they can reach: role, then the client they speak for, then their venues
import { useState } from 'react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Button, Input, Segmented, Sheet, Toggle, useAction, useApi, useForm } from '../../ui/index.jsx';
import { ROLE_LABEL } from '../../layouts/nav.js';
import { Chips, CopyLink } from './_parts.jsx';
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

/** Invite a manager or venue user. `preset` fills in the role, client and venues (from a venue or client page). */
export function InviteSheet({ preset = {}, onClose, onDone }) {
  const { user } = useAuth();
  const venues = useApi('venues.list');
  const clients = useApi('clients.list', {}, { skip: user.role !== 'company' });
  const { v, bind, set } = useForm({ name: '', email: '', phone: '', role: 'security', venue_ids: [], client_id: '', can_see_pay: false, ...preset });
  const [run, busy] = useAction();
  const [link, setLink] = useState(null);
  const send = async () => {
    const office = v.role === 'company';
    const r = await run(() => api('users.invite', {
      ...v, venue_ids: office ? undefined : v.venue_ids, client_id: office ? null : v.client_id || null, can_see_pay: v.role === 'security' && v.can_see_pay,
    }), 'Invite sent');
    setLink(r.invite_link);
    onDone();
  };
  return (
    <Sheet open onClose={onClose} title={link ? 'Invite sent' : 'Invite manager or venue user'}
      footer={link ? <Button onClick={onClose}>Done</Button>
        : <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!v.name || !v.email} onClick={send}>Send invite</Button></>}>
      {link ? <CopyLink link={link} /> : (
        <div className="space-y-4">
          <Segmented value={v.role} onChange={(r) => set('role', r)} options={USER_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} />
          <p className="text-footnote text-muted">{ROLE_HINT[v.role]}</p>
          <Input label="Full name" {...bind('name')} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input label="Email" type="email" {...bind('email')} />
            <Input label="Phone" type="tel" {...bind('phone')} />
          </div>
          <AccessFields role={v.role} v={v} set={set} venues={venues.data || []} clients={clients.data || []} onClientCreated={clients.reload} />
          {v.role === 'security' && <div className="rounded-2xl bg-bg px-4 py-2"><Toggle checked={v.can_see_pay} onChange={(x) => set('can_see_pay', x)} label="Can see pay" hint="Officer rates and pay statements" /></div>}
          <p className="text-caption text-faint">Officers are added from People → Staff, with App access turned on.</p>
        </div>
      )}
    </Sheet>
  );
}
