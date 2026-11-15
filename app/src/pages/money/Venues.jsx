import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { Building2, Layers, Plus, Power, PowerOff, Search, Users } from 'lucide-react';
import { api } from '../../api.js';
import {
  Avatar, Button, Empty, Input, List, Load, Page, PhotoCard, Pill, Row, SearchInput, Segmented, Sheet, Textarea, useAction, useApi, useForm, useUrlState,
} from '../../ui/index.jsx';
import { useBase, VenueBadge } from './_parts.jsx';
import { ClientSelect, ClientSheet } from './_client.jsx';
import { useAuth } from '../../auth.jsx';

export default function Venues() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const venues = useApi('venues.list', { include_inactive: true });
  // Clients (who is billed) are the company manager's; security managers add and run venues
  const clients = useApi('clients.list', {}, { skip: user.role !== 'company' });
  const [addVenue, setAddVenue] = useState(false);
  // Search and Active · Inactive · All stay in the address so Back returns to the same list; they sit on the tab line
  const [url, setUrl] = useUrlState({ q: '', show: 'active' });
  const show = ['active', 'inactive', 'all'].includes(url.show) ? url.show : 'active';
  const inactive = (venues.data || []).filter((v) => !v.active).length;
  // Clients used to be a tab here
  if (params.get('tab') === 'clients') return <Navigate to="../clients" replace />;
  const tools = venues.data?.length > 0 && <>
    <SearchInput className="w-full sm:w-64" value={url.q} onChange={(e) => setUrl({ q: e.target.value })} placeholder="Search venues, clients, postcodes" />
    {inactive > 0 && <Segmented value={show} onChange={(v) => setUrl({ show: v })} options={[{ value: 'active', label: 'Active', icon: Power }, { value: 'inactive', label: 'Inactive', icon: PowerOff, count: inactive }, { value: 'all', label: 'All', icon: Layers }]} />}
  </>;
  return (
    <Page title="Venues" subtitle="Sites you guard" tools={tools} actions={<Button icon={Plus} onClick={() => setAddVenue(true)}>Add venue</Button>}>
      <Load q={venues}>{(rows) => <VenueGrid rows={rows} q={url.q} show={show} onAdd={() => setAddVenue(true)} />}</Load>
      <AddVenueSheet open={addVenue} onClose={() => setAddVenue(false)} clients={user.role === 'company' ? clients.data || [] : null} onClientCreated={clients.reload} />
    </Page>
  );
}

export function Clients() {
  const clients = useApi('clients.list');
  const [client, setClient] = useState(null); // {} = new, row = edit
  const [sp, setSp] = useSearchParams();
  const linked = sp.get('client') && (clients.data || []).find((c) => c.id === sp.get('client')); // opened from a link (e.g. an email)
  return (
    <Page title="Clients" subtitle="Who you bill, and their venues" actions={<Button icon={Plus} onClick={() => setClient({})}>Add client</Button>}>
      <Load q={clients}>{(rows) => <ClientList rows={rows} onEdit={setClient} />}</Load>
      <ClientSheet client={client || linked || null} onClose={() => { setClient(null); if (sp.get('client')) setSp({}, { replace: true }); }} onSaved={clients.reload} />
    </Page>
  );
}

// What Orb's venue setup check would ask for (address and postcode, map pin, logo), for active venues
const blank = (x) => !String(x ?? '').trim();
function setupMissing(v) {
  if (!v.active) return [];
  const noAddress = blank(v.address) || blank(v.postcode);
  return [noAddress && 'address', !noAddress && (v.lat == null || v.lng == null) && 'map pin', !v.logo_url && 'logo'].filter(Boolean);
}

function VenueGrid({ rows, q, show, onAdd }) {
  const base = useBase();
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((v) => (show === 'all' || (show === 'active' ? v.active : !v.active))
      && (!s || [v.name, v.client_name, v.postcode, v.address].some((x) => String(x || '').toLowerCase().includes(s))));
  }, [rows, q, show]);
  if (!rows.length) return <Empty icon={Building2} title="No venues yet" body="Add your first venue to start building rotas and invoicing." action={<Button icon={Plus} onClick={onAdd}>Add venue</Button>} />;

  return (
    <>
      {!list.length ? <Empty icon={Search} title="No matching venues" /> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6">
          {list.map((v) => {
            const gaps = setupMissing(v);
            return (
              <PhotoCard key={v.id} to={`${base}/venues/${v.id}`} name={v.name}
                srcs={[v.photo_url, v.site_client && `/img/opulence/clients/${v.site_client}-480.jpg`]}
                badge={(v.logo_url || gaps.length > 0) && (
                  <span className="flex items-end gap-1.5">
                    {v.logo_url && <VenueBadge name={v.name} logo={v.logo_url} size={40} />}
                    {gaps.length > 0 && <span title={`Missing: ${gaps.join(', ')}`} className="rounded-full bg-surface px-2 py-0.5 text-caption2 font-semibold text-amber shadow-tile">Setup incomplete</span>}
                  </span>
                )}
                sub={<><span className="truncate">{v.client_name || 'No client'}</span>{!v.active && <Pill status="closed" className="shrink-0">Inactive</Pill>}</>} />
            );
          })}
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
          right={(
            <span className="text-right text-footnote text-muted">
              <span className="num font-semibold text-ink">{c.venue_count}</span> {Number(c.venue_count) === 1 ? 'venue' : 'venues'}
              <span className="block"><span className="num font-semibold text-ink">{c.contact_count}</span> {Number(c.contact_count) === 1 ? 'contact' : 'contacts'}</span>
            </span>
          )} />
      ))}
    </List>
  );
}

function AddVenueSheet({ open, onClose, clients, onClientCreated }) {
  const nav = useNavigate();
  const base = useBase();
  const [run, busy] = useAction();
  const f = useForm({ client_id: '', name: '', address: '', postcode: '', phone: '' });
  const save = async () => {
    const v = await run(() => api('venues.save', { ...f.v, client_id: f.v.client_id || null, postcode: f.v.postcode.toUpperCase() }), 'Venue added');
    f.setV({ client_id: '', name: '', address: '', postcode: '', phone: '' });
    onClose();
    nav(`${base}/venues/${v.id}?tab=setup&new=1`);
  };
  return (
    <Sheet open={open} onClose={onClose} title="Add venue"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!f.v.name.trim()} onClick={save}>Add venue</Button></>}>
      <div className="space-y-4">
        {clients && <ClientSelect clients={clients} value={f.v.client_id} onChange={(id) => f.set('client_id', id)} onCreated={onClientCreated} />}
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
