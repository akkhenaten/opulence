import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, CalendarDays, MapPin, Plus, Search, ShieldAlert, Users } from 'lucide-react';
import { api } from '../../api.js';
import {
  Button, Empty, Page, Input, List, Load, Pill, Row, Select, Sheet, Tabs, Textarea, Avatar, useAction, useApi, useForm, cx,
} from '../../ui/index.jsx';
import { useBase } from './_parts.jsx';

export default function Venues() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'venues';
  const venues = useApi('venues.list', { include_inactive: true });
  const clients = useApi('clients.list');
  const [addVenue, setAddVenue] = useState(false);
  const [client, setClient] = useState(null); // {} = new, row = edit

  return (
    <Page title="Venues & clients" subtitle="Sites you guard and the clients you bill"
      actions={<Button icon={Plus} onClick={() => (tab === 'clients' ? setClient({}) : setAddVenue(true))}>{tab === 'clients' ? 'Add client' : 'Add venue'}</Button>}>
        <Tabs value={tab} onChange={(t) => setParams(t === 'venues' ? {} : { tab: t }, { replace: true })}
          tabs={[{ value: 'venues', label: 'Venues', count: venues.data?.length }, { value: 'clients', label: 'Clients', count: clients.data?.length }]} />
        {tab === 'venues'
          ? <Load q={venues}>{(rows) => <VenueGrid rows={rows} onAdd={() => setAddVenue(true)} />}</Load>
          : <Load q={clients}>{(rows) => <ClientList rows={rows} onEdit={setClient} />}</Load>}
      <AddVenueSheet open={addVenue} onClose={() => setAddVenue(false)} clients={clients.data || []} />
      <ClientSheet client={client} onClose={() => setClient(null)} onSaved={() => { clients.reload(); venues.reload(); }} />
    </Page>
  );
}

function VenueGrid({ rows, onAdd }) {
  const base = useBase();
  const [q, setQ] = useState('');
  const [show, setShow] = useState('active');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((v) => (show === 'all' || (show === 'active' ? v.active : !v.active))
      && (!s || [v.name, v.client_name, v.postcode, v.address].some((x) => String(x || '').toLowerCase().includes(s))));
  }, [rows, q, show]);
  const inactive = rows.filter((v) => !v.active).length;

  if (!rows.length) return <Empty icon={Building2} title="No venues yet" body="Add your first venue to start building rotas and invoicing." action={<Button icon={Plus} onClick={onAdd}>Add venue</Button>} />;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="relative min-w-0 flex-1 basis-60">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search venues, clients, postcodes"
            className="h-11 w-full rounded-xl border border-line bg-surface pl-10 pr-3.5 text-body outline-none focus:border-blue focus:ring-4 focus:ring-blue/10" />
        </label>
        {inactive > 0 && (
          <div className="flex gap-1">
            {[['active', 'Active'], ['inactive', `Inactive (${inactive})`], ['all', 'All']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setShow(v)}
                className={cx('rounded-full px-3 py-1.5 text-footnote font-semibold transition', show === v ? 'bg-ink text-white' : 'bg-surface text-muted hover:text-ink')}>{l}</button>
            ))}
          </div>
        )}
      </div>
      {!list.length ? <Empty icon={Search} title="No matching venues" /> : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
          {list.map((v) => (
            <Link key={v.id} to={`${base}/venues/${v.id}`}
              className="group block min-w-0 rounded-tile border border-black/[0.04] bg-surface p-5 shadow-tile transition hover:-translate-y-0.5 active:scale-[0.99]">
              <div className="flex items-start gap-3">
                {v.photo_url
                  ? <img src={v.photo_url} alt="" className="h-12 w-12 shrink-0 rounded-2xl object-cover" />
                  : <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-soft text-blue"><Building2 size={24} /></div>}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-headline font-bold">{v.name}</div>
                  <div className="truncate text-footnote text-muted">{v.client_name || 'No client'}</div>
                </div>
                <Pill status={v.active ? 'active' : 'closed'}>{v.active ? 'Active' : 'Inactive'}</Pill>
              </div>
              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-footnote text-muted">
                <span className="inline-flex items-center gap-1"><MapPin size={14} />{v.postcode || 'No postcode'}</span>
                <span className={cx('inline-flex items-center gap-1', v.lat == null && 'text-amber')}>
                  <span className={cx('h-2 w-2 rounded-full', v.lat == null ? 'bg-amber' : 'bg-green')} />
                  {v.lat == null ? 'No geofence' : `${v.radius_m}m geofence`}
                </span>
              </div>
              <div className="mt-3 flex gap-2 border-t border-line pt-3 text-footnote">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-bg px-2.5 py-1 font-semibold"><CalendarDays size={14} className="text-blue" /><span className="num">{v.upcoming_shifts}</span> upcoming</span>
                <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-semibold', Number(v.open_incidents) ? 'bg-red-soft text-red' : 'bg-bg')}>
                  <ShieldAlert size={14} /><span className="num">{v.open_incidents}</span> open incidents
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function ClientList({ rows, onEdit }) {
  if (!rows.length) return <Empty icon={Users} title="No clients yet" body="Clients hold billing details. Each venue belongs to a client." action={<Button icon={Plus} onClick={() => onEdit({})}>Add client</Button>} />;
  return (
    <List>
      {rows.map((c) => (
        <Row key={c.id} onClick={() => onEdit(c)} chevron left={<Avatar name={c.name} size={38} />}
          title={c.name}
          subtitle={[c.billing_email, c.vat_number && `VAT ${c.vat_number}`].filter(Boolean).join(' · ') || 'No billing details'}
          right={<span className="text-muted"><span className="num font-semibold text-ink">{c.venue_count}</span> {Number(c.venue_count) === 1 ? 'venue' : 'venues'}</span>} />
      ))}
    </List>
  );
}

function AddVenueSheet({ open, onClose, clients }) {
  const nav = useNavigate();
  const base = useBase();
  const [run, busy] = useAction();
  const f = useForm({ client_id: '', name: '', address: '', postcode: '', phone: '' });
  const save = async () => {
    const v = await run(() => api('venues.save', { ...f.v, client_id: f.v.client_id || null, postcode: f.v.postcode.toUpperCase() }), 'Venue added');
    f.setV({ client_id: '', name: '', address: '', postcode: '', phone: '' });
    onClose();
    nav(`${base}/venues/${v.id}?tab=location`);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add venue"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!f.v.name.trim()} onClick={save}>Add venue</Button></>}>
      <div className="space-y-4">
        <Select label="Client" placeholder="No client" options={clients.map((c) => ({ value: c.id, label: c.name }))} {...f.bind('client_id')} />
        <Input label="Venue name" placeholder="e.g. The Crown, Soho" autoFocus {...f.bind('name')} />
        <Textarea label="Address" rows={2} {...f.bind('address')} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Postcode" autoCapitalize="characters" {...f.bind('postcode')} />
          <Input label="Phone" type="tel" {...f.bind('phone')} />
        </div>
        <p className="text-footnote text-muted">You can set the map location and geofence on the next screen.</p>
      </div>
    </Sheet>
  );
}

function ClientSheet({ client, onClose, onSaved }) {
  const open = !!client;
  return open ? <ClientForm key={client.id || 'new'} client={client} onClose={onClose} onSaved={onSaved} /> : null;
}

function ClientForm({ client, onClose, onSaved }) {
  const [run, busy] = useAction();
  const f = useForm({ name: client.name || '', billing_email: client.billing_email || '', billing_address: client.billing_address || '', vat_number: client.vat_number || '' });
  const save = async () => {
    await run(() => api('clients.save', { ...(client.id ? { id: client.id } : {}), ...f.v }), client.id ? 'Client saved' : 'Client added');
    onSaved();
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={client.id ? 'Edit client' : 'Add client'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!f.v.name.trim()} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <Input label="Client name" autoFocus {...f.bind('name')} />
        <Input label="Billing email" type="email" hint="Invoices are sent here" {...f.bind('billing_email')} />
        <Textarea label="Billing address" rows={3} {...f.bind('billing_address')} />
        <Input label="VAT number" placeholder="GB123456789" {...f.bind('vat_number')} />
      </div>
    </Sheet>
  );
}
