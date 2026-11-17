// Clients (who is billed): pick one or make one on the spot, and the client sheet with its venues and contacts
import { useState } from 'react';
import { Building2, Plus, UserPlus, Users } from 'lucide-react';
import { api } from '../../api.js';
import {
  Avatar, Button, Empty, Input, List, Pill, Row, Section, Select, Sheet, Textarea, useAction, useApi, useForm,
} from '../../ui/index.jsx';
import RecentEmail from '../email/_recent.jsx';
import { ROLE_LABEL } from '../../layouts/nav.js';
import { AddPersonSheet } from '../people/_person.jsx';
import { useBase } from './_parts.jsx';

const NEW = '__new';

/** A client picker with "+ New client…" at the bottom. onChange gets the client id ('' for none); onCreated gets the new client row. */
export function ClientSelect({ clients, value, onChange, onCreated, label = 'Client', placeholder = 'No client', ...p }) {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <Select label={label} placeholder={placeholder} value={value || ''} {...p}
        options={[...clients.map((c) => ({ value: c.id, label: c.name })), { value: NEW, label: '+ New client…' }]}
        onChange={(e) => (e.target.value === NEW ? setAdding(true) : onChange(e.target.value))} />
      {adding && <ClientForm client={{}} onClose={() => setAdding(false)} onSaved={(c) => { onCreated?.(c); onChange(c.id); }} />}
    </>
  );
}

export function ClientSheet({ client, onClose, onSaved }) {
  return client ? <ClientForm key={client.id || 'new'} client={client} onClose={onClose} onSaved={onSaved} /> : null;
}

function ClientForm({ client, onClose, onSaved }) {
  const [run, busy] = useAction();
  const f = useForm({ name: client.name || '', billing_email: client.billing_email || '', billing_address: client.billing_address || '', vat_number: client.vat_number || '' });
  const save = async () => {
    const c = await run(() => api('clients.save', { ...(client.id ? { id: client.id } : {}), ...f.v }), client.id ? 'Client saved' : 'Client added');
    onSaved(c);
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={client.id ? client.name || 'Edit client' : 'Add client'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!f.v.name.trim()} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <Input label="Client name" autoFocus={!client.id} {...f.bind('name')} />
        <Input label="Billing email" type="email" hint="Invoices are sent here" {...f.bind('billing_email')} />
        <Textarea label="Billing address" rows={3} {...f.bind('billing_address')} />
        <Input label="VAT number" placeholder="GB123456789" {...f.bind('vat_number')} />
      </div>
      {client.id && <ClientPeople id={client.id} onChanged={onSaved} />}
      {client.id && <RecentEmail type="client" id={client.id} />}
    </Sheet>
  );
}

// The client's venues (add one from the venue list) and its contacts (invite one, already linked to the client)
function ClientPeople({ id, onChanged }) {
  const base = useBase();
  const q = useApi('clients.get', { id });
  const all = useApi('venues.list', { include_inactive: true });
  const [run, busy] = useAction();
  const [pick, setPick] = useState('');
  const [inviting, setInviting] = useState(false);
  const c = q.data;
  if (!c) return null;
  const mine = new Set(c.venues.map((v) => v.id));
  const others = (all.data || []).filter((v) => !mine.has(v.id));
  const attach = () => run(() => api('clients.setVenue', { venue_id: pick, client_id: id }), 'Venue added to this client')
    .then(() => { setPick(''); q.reload(); all.reload(); onChanged?.(); }).catch(() => {});
  return (
    <>
      <Section title="Venues" icon={Building2} count={c.venues.length}>
        {c.venues.length ? (
          <List>
            {c.venues.map((v) => (
              <Row key={v.id} to={`${base}/venues/${v.id}?tab=details`} chevron left={<Building2 size={18} className="text-muted" />} title={v.name}
                right={!v.active && <Pill status="closed">Inactive</Pill>} />
            ))}
          </List>
        ) : <Empty icon={Building2} title="No venues yet" body="Add one below, or choose this client on a venue's Details tab." />}
        {others.length > 0 && (
          <div className="mt-3 flex items-end gap-2">
            <Select className="min-w-0 flex-1" label="Add a venue to this client" placeholder="Choose a venue" value={pick} onChange={(e) => setPick(e.target.value)}
              options={others.map((v) => ({ value: v.id, label: `${v.name}${v.client_name ? ` (now ${v.client_name})` : ''}${v.active ? '' : ' · inactive'}` }))} />
            <Button variant="soft" icon={Plus} busy={busy} disabled={!pick} onClick={attach}>Add</Button>
          </div>
        )}
      </Section>
      <Section title="Contacts" icon={Users} count={c.contacts.length} action={<Button size="sm" variant="soft" icon={UserPlus} onClick={() => setInviting(true)}>Invite contact</Button>}>
        {c.contacts.length ? (
          <List>
            {c.contacts.map((u) => (
              <Row key={u.id} to={`/company/staff/${u.id}`} left={<Avatar name={u.name} size={36} />} title={u.name}
                subtitle={[ROLE_LABEL[u.role], u.venues.length ? u.venues.join(', ') : 'No venues yet', u.email].filter(Boolean).join(' · ')}
                right={u.status !== 'active' && <Pill status={u.status === 'invited' ? 'pending' : 'cancelled'}>{u.status === 'invited' ? 'Invited' : 'Disabled'}</Pill>} />
            ))}
          </List>
        ) : <Empty icon={Users} title="No contacts yet" body="Invite the client's manager. They get access to this client's venues." />}
      </Section>
      {inviting && <AddPersonSheet title="Invite contact" preset={{ manager: 'venue', officer: false, client_id: id, venue_ids: c.venues.filter((v) => v.active).map((v) => v.id) }}
        onClose={() => setInviting(false)} onDone={() => { q.reload(); onChanged?.(); }} />}
    </>
  );
}
