import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Building2, Crosshair, Download, Eye, FileText, LocateFixed, MapPin, Phone, Plus, QrCode, RefreshCw, Search, Trash2, Upload, Users,
} from 'lucide-react';
import { api, downloadAction, upload } from '../../api.js';
import {
  Avatar, Bento, Button, cx, date, daysUntil, Empty, IconButton, Input, isoDate, List, Load, money, Page, Pill, Pressable, Row, Section, Select, Sheet, Stat, Table, Tabs, Textarea, Tile, Toggle, useAction, useApi, useConfirm, useForm, useToast,
} from '../../ui/index.jsx';
import { useBase } from './_parts.jsx';
import { useAuth } from '../../auth.jsx';
import { ShiftLogList } from '../shift/ShiftLogs.jsx';
import { BanRegister } from '../shift/Bans.jsx';

const UK = [54.3, -2.6];

export default function VenueDetail() {
  const { id } = useParams();
  const base = useBase();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') || 'location';
  const { user } = useAuth();
  const isCo = user.role === 'company';
  const q = useApi('venues.get', { id });
  const clients = useApi('clients.list', {}, { skip: !isCo });

  return (
    <Load q={q}>
      {(v) => (
        <Page title={v.name} subtitle={v.client_name || 'No client'} back={{ to: `${base}/venues`, label: 'Venues' }}
          actions={<Pill status={v.active ? 'active' : 'closed'}>{v.active ? 'Active' : 'Inactive'}</Pill>}>
          <Bento className="mb-6">
            <Tile className="col-span-2" tone="soft">
              <div className="flex items-start gap-4">
                {v.photo_url
                  ? <img src={v.photo_url} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover" />
                  : <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white text-blue"><Building2 size={26} /></div>}
                <div className="min-w-0">
                  <div className="text-footnote font-semibold uppercase tracking-wide text-muted">Venue</div>
                  <div className="truncate text-title3 font-bold">{v.name}</div>
                  <div className="mt-1 flex items-start gap-1.5 text-subhead text-muted"><MapPin size={16} className="mt-0.5 shrink-0" /><span>{[v.address, v.postcode].filter(Boolean).join(', ') || 'No address'}</span></div>
                  {v.phone && <a href={`tel:${v.phone}`} className="mt-1 flex items-center gap-1.5 text-subhead font-semibold text-blue"><Phone size={14} />{v.phone}</a>}
                </div>
              </div>
            </Tile>
            <Tile title="Geofence">
              <Stat value={v.lat == null ? '–' : `${v.radius_m}m`} label={v.lat == null ? 'Location not set' : 'Clock-in radius'} tone={v.lat == null ? 'amber' : undefined} />
            </Tile>
            <Tile title="Access">
              <Stat value={v.contacts.length} label={v.contacts.length === 1 ? 'Venue manager' : 'Venue managers'} hint={`${v.security.length} security manager${v.security.length === 1 ? '' : 's'}`} />
            </Tile>
          </Bento>

          <Tabs value={tab} onChange={(t) => setParams({ tab: t }, { replace: true })} tabs={[
            { value: 'location', label: 'Location' }, { value: 'details', label: 'Details' }, { value: 'qr', label: 'QR code' },
            ...(isCo ? [{ value: 'rates', label: 'Charge rates' }] : []), { value: 'people', label: 'People' }, { value: 'documents', label: 'Documents', count: v.documents.length },
            { value: 'logs', label: 'Shift logs' }, { value: 'bans', label: 'Bans' },
          ]} />

          {tab === 'location' && <LocationTab v={v} onSaved={q.reload} />}
          {tab === 'details' && <DetailsTab v={v} clients={clients.data || []} isCo={isCo} onSaved={q.reload} />}
          {tab === 'qr' && <QrTab v={v} />}
          {tab === 'rates' && isCo && <RatesTab venueId={v.id} />}
          {tab === 'people' && <PeopleTab v={v} isCo={isCo} />}
          {tab === 'documents' && <DocumentsTab venueId={v.id} />}
          {tab === 'logs' && <ShiftLogList venueId={v.id} />}
          {tab === 'bans' && <BanRegister venueId={v.id} />}
        </Page>
      )}
    </Load>
  );
}

/* ---------- Location ---------- */

const pinIcon = L.divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;border-radius:50%;background:#0A6CFF;border:3px solid #fff;box-shadow:0 0 0 2px rgba(10,108,255,.35),0 4px 10px rgba(11,18,32,.35)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function GeoMap({ pos, radius, onPick, focus }) {
  const el = useRef(null);
  const ref = useRef({});
  const pick = useRef(onPick);
  pick.current = onPick;

  useEffect(() => {
    const map = L.map(el.current, { scrollWheelZoom: false }).setView(pos ? [pos.lat, pos.lng] : UK, pos ? 17 : 5);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    map.on('click', (e) => pick.current(e.latlng.lat, e.latlng.lng));
    ref.current = { map };
    const t = setTimeout(() => map.invalidateSize(), 50);
    return () => { clearTimeout(t); map.remove(); ref.current = {}; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const r = ref.current;
    if (!r.map) return;
    if (!pos) {
      r.marker?.remove(); r.circle?.remove(); r.marker = r.circle = null;
      return;
    }
    const ll = [pos.lat, pos.lng];
    if (!r.marker) {
      r.circle = L.circle(ll, { radius, color: '#0A6CFF', weight: 2, fillColor: '#0A6CFF', fillOpacity: 0.12 }).addTo(r.map);
      r.marker = L.marker(ll, { icon: pinIcon, draggable: true, autoPan: true }).addTo(r.map);
      r.marker.on('drag', (e) => r.circle.setLatLng(e.target.getLatLng()));
      r.marker.on('dragend', (e) => { const p = e.target.getLatLng(); pick.current(p.lat, p.lng); });
    } else {
      r.marker.setLatLng(ll);
      r.circle.setLatLng(ll);
      r.circle.setRadius(radius);
    }
  }, [pos?.lat, pos?.lng, radius]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-centre on demand (postcode lookup, my location)
  useEffect(() => {
    const r = ref.current;
    if (!r.map || !pos || !focus) return;
    r.map.setView([pos.lat, pos.lng], Math.max(r.map.getZoom(), 17));
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={el} className="isolate z-0 h-[340px] w-full overflow-hidden rounded-2xl bg-bg sm:h-[440px]" />;
}

function LocationTab({ v, onSaved }) {
  const [pos, setPos] = useState(v.lat != null && v.lng != null ? { lat: Number(v.lat), lng: Number(v.lng) } : null);
  const [radius, setRadius] = useState(Number(v.radius_m) || 150);
  const [focus, setFocus] = useState(0);
  const [locating, setLocating] = useState(false);
  const [run, busy] = useAction();
  const [find, finding] = useAction();
  const toast = useToast();
  const dirty = (pos?.lat ?? null) !== (v.lat ?? null) || (pos?.lng ?? null) !== (v.lng ?? null) || radius !== Number(v.radius_m);

  const myLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setPos({ lat: p.coords.latitude, lng: p.coords.longitude }); setFocus((f) => f + 1); setLocating(false); },
      () => { setLocating(false); toast('Could not get your location. Check location permissions.', 'error'); },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  };

  const fromPostcode = () => find(async () => {
    const pc = (v.postcode || '').replace(/\s+/g, '');
    if (!pc) throw new Error('Add a postcode in Details first');
    const r = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(pc)}`).then((x) => x.json()).catch(() => null);
    if (!r?.result) throw new Error('Postcode not found');
    setPos({ lat: r.result.latitude, lng: r.result.longitude });
    setFocus((f) => f + 1);
  }).catch(() => {});

  const save = () => run(() => api('venues.save', { id: v.id, lat: pos?.lat ?? null, lng: pos?.lng ?? null, radius_m: radius }), 'Location saved').then(onSaved).catch(() => {});

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
      <Tile pad={false} className="overflow-hidden p-2">
        <GeoMap pos={pos} radius={radius} onPick={(lat, lng) => setPos({ lat, lng })} focus={focus} />
      </Tile>
      <div className="space-y-4">
        <Tile title="Geofence" icon={Crosshair}>
          <p className="text-subhead text-muted">Tap the map or drag the pin to the entrance officers clock in at. They must be inside the circle to clock in without an exception.</p>
          <div className="mt-4">
            <div className="mb-1.5 flex items-baseline justify-between">
              <span className="text-footnote font-semibold text-muted">Radius</span>
              <span className="num text-title2 font-bold">{radius}m</span>
            </div>
            <input type="range" min={25} max={500} step={5} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="w-full accent-blue" aria-label="Geofence radius in metres" />
            <div className="flex justify-between text-caption2 text-faint num"><span>25m</span><span>500m</span></div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="soft" size="sm" icon={LocateFixed} busy={locating} onClick={myLocation}>Use my location</Button>
            <Button variant="soft" size="sm" icon={Search} busy={finding} onClick={fromPostcode}>Find postcode</Button>
          </div>
          <div className="mt-4 rounded-xl bg-bg px-3 py-2.5 text-footnote">
            {pos ? <span className="num text-muted">{pos.lat.toFixed(6)}, {pos.lng.toFixed(6)}</span> : <span className="text-amber font-semibold">No location set</span>}
          </div>
          <div className="mt-4 flex gap-2">
            <Button className="flex-1" busy={busy} disabled={!dirty || !pos} onClick={save}>Save location</Button>
            {dirty && <Button variant="secondary" onClick={() => { setPos(v.lat != null ? { lat: Number(v.lat), lng: Number(v.lng) } : null); setRadius(Number(v.radius_m) || 150); setFocus((f) => f + 1); }}>Reset</Button>}
          </div>
        </Tile>
      </div>
    </div>
  );
}

/* ---------- Details ---------- */

function DetailsTab({ v, clients, isCo, onSaved }) {
  const [run, busy] = useAction();
  const f = useForm({
    client_id: v.client_id || '', name: v.name || '', address: v.address || '', postcode: v.postcode || '', phone: v.phone || '',
    instructions: v.instructions || '', notes: v.notes || '', invoice_cycle: v.invoice_cycle || '', active: !!v.active,
  });
  // Client and invoicing belong to the company manager; the server ignores them from anyone else
  const save = () => run(() => api('venues.save', {
    id: v.id, ...f.v, client_id: f.v.client_id || null, invoice_cycle: f.v.invoice_cycle || null, postcode: f.v.postcode.toUpperCase(),
    ...(isCo ? {} : { client_id: undefined, invoice_cycle: undefined }),
  }), 'Venue saved').then(onSaved).catch(() => {});

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Tile title="Venue">
        <div className="space-y-4">
          <Input label="Name" {...f.bind('name')} />
          {isCo && <Select label="Client" placeholder="No client" options={clients.map((c) => ({ value: c.id, label: c.name }))} {...f.bind('client_id')} />}
          <Textarea label="Address" rows={2} {...f.bind('address')} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Postcode" {...f.bind('postcode')} />
            <Input label="Phone" type="tel" {...f.bind('phone')} />
          </div>
        </div>
      </Tile>
      <Tile title="Operations">
        <div className="space-y-4">
          <Textarea label="Assignment instructions" rows={5} hint="Shown to officers before and during their shift" {...f.bind('instructions')} />
          <Textarea label="Internal notes" rows={3} hint="Only visible to your managers" {...f.bind('notes')} />
          {isCo && <Select label="Invoice cycle" placeholder="Company default" options={[{ value: 'weekly', label: 'Weekly' }, { value: 'fortnightly', label: 'Fortnightly' }, { value: 'monthly', label: 'Monthly' }]} {...f.bind('invoice_cycle')} />}
          <div className="rounded-xl bg-bg px-4 py-2">
            <Toggle label="Active" hint="Inactive venues are hidden from the rota" checked={f.v.active} onChange={(x) => f.set('active', x)} />
          </div>
        </div>
      </Tile>
      <div className="flex justify-end lg:col-span-2">
        <Button busy={busy} disabled={!f.v.name.trim()} onClick={save}>Save changes</Button>
      </div>
    </div>
  );
}

/* ---------- QR ---------- */

function QrTab({ v }) {
  const qr = useApi('venues.qr', { id: v.id });
  const confirm = useConfirm();
  const [run, busy] = useAction();
  const [dl, dlBusy] = useAction();
  const [preview, setPreview] = useState(null);
  const [pv, pvBusy] = useAction();

  useEffect(() => () => preview && URL.revokeObjectURL(preview), [preview]);

  const showPreview = () => pv(async () => {
    const d = await api('venues.qrPoster', { id: v.id });
    const bytes = Uint8Array.from(atob(d.pdf), (c) => c.charCodeAt(0));
    setPreview(URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })));
  }).catch(() => {});

  const regenerate = async () => {
    if (!(await confirm({ title: 'Regenerate QR code?', body: 'Every printed poster for this venue stops working straight away. Print and put up the new poster before officers next clock in.', confirm: 'Regenerate', danger: true }))) return;
    await run(() => api('venues.qrRegenerate', { id: v.id }), 'New QR code created').catch(() => {});
    setPreview(null);
    qr.reload();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
      <Tile title="Clock-in QR" icon={QrCode}>
        <Load q={qr}>
          {(d) => (
            <>
              <Stat value={`v${d.version}`} label="Current code version" hint="Officers scan this poster on arrival" />
              <div className="mt-4 break-all rounded-xl bg-bg px-3 py-2 font-mono text-caption2 text-muted">{d.payload}</div>
            </>
          )}
        </Load>
        <div className="mt-5 space-y-2">
          <Button className="w-full" icon={Download} busy={dlBusy} onClick={() => dl(() => downloadAction('venues.qrPoster', { id: v.id }), 'Poster downloaded').catch(() => {})}>Download poster (PDF)</Button>
          <Button className="w-full" variant="soft" icon={Eye} busy={pvBusy} onClick={showPreview}>Preview poster</Button>
          <Button className="w-full" variant="danger" icon={RefreshCw} busy={busy} onClick={regenerate}>Regenerate code</Button>
        </div>
        <p className="mt-3 text-caption text-faint">Regenerate if a poster is lost, copied or taken off site.</p>
      </Tile>
      <Tile pad={false} className="min-h-[360px] overflow-hidden">
        {preview
          ? <iframe title="QR poster preview" src={preview} className="h-[560px] w-full" />
          : <div className="grid h-full min-h-[360px] place-items-center p-6 text-center">
              <div>
                <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-blue-soft text-blue"><QrCode size={26} /></div>
                <div className="text-callout font-semibold">Poster preview</div>
                <p className="mt-1 text-subhead text-muted">Print the A4 poster and fix it at the officer entrance.</p>
              </div>
            </div>}
      </Tile>
    </div>
  );
}

/* ---------- Rates ---------- */

function RatesTab({ venueId }) {
  const rates = useApi('venues.rates', { venue_id: venueId });
  const roles = useApi('roles.list');
  const [open, setOpen] = useState(false);
  const confirm = useConfirm();
  const [run] = useAction();
  const today = isoDate();

  const status = useMemo(() => {
    const seen = new Set();
    const out = {};
    for (const r of rates.data || []) { // ordered by role, effective_from desc
      if (r.effective_from > today) out[r.id] = 'scheduled';
      else if (!seen.has(r.role)) { out[r.id] = 'current'; seen.add(r.role); } else out[r.id] = 'superseded';
    }
    return out;
  }, [rates.data, today]);

  const del = async (r) => {
    if (!(await confirm({ title: 'Delete this rate?', body: `${r.role_name} at ${money(r.rate)}/h from ${date(r.effective_from)}. Existing invoices are not changed.`, confirm: 'Delete', danger: true }))) return;
    await run(() => api('venues.deleteRate', { id: r.id }), 'Rate deleted').catch(() => {});
    rates.reload();
  };

  const tone = { current: 'green', scheduled: 'blue', superseded: 'grey' };
  return (
    <Section title="Charge rates per hour" className="mt-0" action={<Button size="sm" icon={Plus} onClick={() => setOpen(true)}>Add rate</Button>}>
      <Load q={rates}>
        {(rows) => (
          <Table rows={rows} empty="No charge rates yet. Add one per role before invoicing."
            columns={[
              { key: 'role_name', label: 'Role', render: (r) => <span className="font-semibold">{r.role_name}</span> },
              { key: 'rate', label: 'Rate', align: 'right', render: (r) => <span className="num font-semibold">{money(r.rate)}</span> },
              { key: 'night', label: 'Night', align: 'right', render: (r) => <span className="num">+{Number(r.night_uplift)}%</span> },
              { key: 'weekend', label: 'Weekend', align: 'right', render: (r) => <span className="num">+{Number(r.weekend_uplift)}%</span> },
              { key: 'bh', label: 'Bank hol.', align: 'right', render: (r) => <span className="num">+{Number(r.bh_uplift)}%</span> },
              { key: 'min', label: 'Min hours', align: 'right', render: (r) => <span className="num">{Number(r.min_hours)}h</span> },
              { key: 'from', label: 'From', render: (r) => date(r.effective_from) },
              { key: 'st', label: 'Status', render: (r) => <Pill tone={tone[status[r.id]]}>{status[r.id] === 'current' ? 'Current' : status[r.id] === 'scheduled' ? 'Scheduled' : 'Superseded'}</Pill> },
              { key: 'x', label: '', align: 'right', render: (r) => <IconButton icon={Trash2} label="Delete rate" onClick={(e) => { e.stopPropagation(); del(r); }} className="ml-auto h-8 w-8 text-red hover:bg-red-soft" /> },
            ]} />
        )}
      </Load>
      <p className="mt-2 px-1 text-caption text-faint">Uplifts are applied to the part of a shift that falls at night, at the weekend or on a bank holiday. Short shifts are billed at the minimum hours.</p>
      {open && <RateSheet venueId={venueId} roles={roles.data || []} onClose={() => setOpen(false)} onSaved={rates.reload} />}
    </Section>
  );
}

function RateSheet({ venueId, roles, onClose, onSaved }) {
  const [run, busy] = useAction();
  const f = useForm({ role: '', rate: '', night_uplift: '0', weekend_uplift: '0', bh_uplift: '50', min_hours: '4', effective_from: isoDate() });
  const ok = f.v.role && Number(f.v.rate) > 0 && f.v.effective_from;
  const save = async () => {
    await run(() => api('venues.saveRate', {
      venue_id: venueId, role: f.v.role, rate: Number(f.v.rate), night_uplift: Number(f.v.night_uplift || 0), weekend_uplift: Number(f.v.weekend_uplift || 0),
      bh_uplift: Number(f.v.bh_uplift || 0), min_hours: Number(f.v.min_hours || 0), effective_from: f.v.effective_from,
    }), 'Rate added');
    onSaved();
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Add charge rate"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!ok} onClick={save}>Add rate</Button></>}>
      <div className="space-y-4">
        <Select label="Role" placeholder="Choose role" options={roles.map((r) => ({ value: r.code, label: r.name }))} {...f.bind('role')} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Rate per hour (£)" type="number" inputMode="decimal" step="0.01" min="0" {...f.bind('rate')} />
          <Input label="Effective from" type="date" {...f.bind('effective_from')} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Night %" type="number" inputMode="decimal" {...f.bind('night_uplift')} />
          <Input label="Weekend %" type="number" inputMode="decimal" {...f.bind('weekend_uplift')} />
          <Input label="Bank hol. %" type="number" inputMode="decimal" {...f.bind('bh_uplift')} />
        </div>
        <Input label="Minimum billable hours" type="number" inputMode="decimal" step="0.25" {...f.bind('min_hours')} />
        <p className="text-footnote text-muted">A new rate replaces the previous one for this role from its effective date. Older rates stay for history.</p>
      </div>
    </Sheet>
  );
}

/* ---------- People ---------- */

function PeopleTab({ v, isCo }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div>
        <Section title="Venue managers" className="mt-0">
          {v.contacts.length ? (
            <List>
              {v.contacts.map((u) => (
                <Row key={u.id} left={<Avatar name={u.name} size={38} />} title={u.name} subtitle={[u.email, u.phone].filter(Boolean).join(' · ')}
                  right={<Pill status={u.status} />} />
              ))}
            </List>
          ) : <Empty icon={Users} title="No venue managers" body="Invite the client's site manager so they can sign timesheets, request cover and see incidents." />}
        </Section>
      </div>
      <div>
        <Section title="Security managers" className="mt-0">
          {v.security.length ? (
            <List>
              {v.security.map((u) => <Row key={u.id} left={<Avatar name={u.name} size={38} />} title={u.name} subtitle={[u.email, u.phone].filter(Boolean).join(' · ')} />)}
            </List>
          ) : <Empty icon={Users} title="No security managers" body="Security managers assigned to this venue can run its rota and live board." />}
        </Section>
      </div>
      <div className="lg:col-span-2">
        {isCo && <Button variant="soft" icon={Users} to="/company/settings">Manage users and venue access</Button>}
      </div>
    </div>
  );
}

/* ---------- Documents ---------- */

const DOC_KINDS = [
  { value: 'assignment_instructions', label: 'Assignment instructions' },
  { value: 'risk_assessment', label: 'Risk assessment' },
  { value: 'contract', label: 'Contract' },
  { value: 'site_plan', label: 'Site plan' },
  { value: 'licence', label: 'Premises licence' },
  { value: 'other', label: 'Other' },
];
const kindLabel = (k) => ({ invoice: 'Invoice' })[k] || DOC_KINDS.find((x) => x.value === k)?.label || k;

// Venue managers see the same list read-only (their My venue page)
export function DocumentsTab({ venueId, readOnly }) {
  const docs = useApi('docs.list', { owner_type: 'venue', owner_id: venueId });
  const [open, setOpen] = useState(false);
  const confirm = useConfirm();
  const [run] = useAction();

  const openDoc = (d) => run(async () => {
    const { url } = await api('docs.url', { id: d.id });
    if (url) window.open(url, '_blank', 'noopener');
  }).catch(() => {});
  const del = async (d) => {
    if (!(await confirm({ title: 'Delete document?', body: d.title, confirm: 'Delete', danger: true }))) return;
    await run(() => api('docs.delete', { id: d.id }), 'Document deleted').catch(() => {});
    docs.reload();
  };

  return (
    <Section title="Venue documents" className="mt-0" action={!readOnly && <Button size="sm" icon={Upload} onClick={() => setOpen(true)}>Upload</Button>}>
      <Load q={docs}>
        {(rows) => (!rows.length
          ? <Empty icon={FileText} title="No documents" body={readOnly ? 'Documents Orb shares with you, such as assignment instructions and invoices, appear here.' : 'Upload assignment instructions, risk assessments and site plans.'} />
          : (
            <List>
              {rows.map((d) => {
                const left = daysUntil(d.expiry);
                return (
                  <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-soft text-blue"><FileText size={18} /></div>
                    <Pressable press onClick={() => d.s3_key && openDoc(d)} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-body font-semibold">{d.title}</div>
                      <div className="truncate text-footnote text-muted">{kindLabel(d.kind)} · added {date(d.created_at)}</div>
                    </Pressable>
                    {d.expiry && <Pill tone={left < 0 ? 'red' : left <= 30 ? 'amber' : 'grey'}>{left < 0 ? 'Expired' : `Expires ${date(d.expiry)}`}</Pill>}
                    {d.system && <Pill tone="blue" className="hidden sm:inline-flex">Saved copy</Pill>}
                    {!readOnly && !d.system && <IconButton icon={Trash2} label="Delete document" onClick={() => del(d)} className="text-red hover:bg-red-soft" />}
                  </div>
                );
              })}
            </List>
          ))}
      </Load>
      {open && <DocSheet venueId={venueId} onClose={() => setOpen(false)} onSaved={docs.reload} />}
    </Section>
  );
}

function DocSheet({ venueId, onClose, onSaved }) {
  const [run, busy] = useAction();
  const [file, setFile] = useState(null);
  const f = useForm({ kind: 'assignment_instructions', title: '', expiry: '' });
  const save = async () => {
    await run(async () => {
      const key = await upload(file, 'venue');
      await api('docs.create', { owner_type: 'venue', owner_id: venueId, kind: f.v.kind, title: f.v.title || file.name, expiry: f.v.expiry || null, s3_key: key, mime: file.type || null });
    }, 'Document uploaded');
    onSaved();
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Upload document"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!file} onClick={save}>Upload</Button></>}>
      <div className="space-y-4">
        <label className={cx('flex cursor-pointer flex-col items-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition', file ? 'border-blue bg-blue-soft' : 'border-line hover:border-faint')}>
          <Upload size={24} className="text-blue" />
          <span className="mt-2 text-body font-semibold">{file ? file.name : 'Choose a file'}</span>
          <span className="text-caption text-muted">PDF, image or Word document</span>
          <input type="file" className="hidden" accept=".pdf,.doc,.docx,image/*" onChange={(e) => { const x = e.target.files?.[0]; setFile(x || null); if (x && !f.v.title) f.set('title', x.name.replace(/\.[^.]+$/, '')); }} />
        </label>
        <Select label="Type" options={DOC_KINDS} {...f.bind('kind')} />
        <Input label="Title" {...f.bind('title')} />
        <Input label="Expiry date" type="date" hint="Optional. You will be reminded before it expires." {...f.bind('expiry')} />
      </div>
    </Sheet>
  );
}

