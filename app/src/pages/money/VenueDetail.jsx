import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import RecentEmail from '../email/_recent.jsx';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Building2, Crosshair, Download, Eye, FileText, Globe, MessageSquareHeart, UserMinus, UserPlus, LocateFixed, MapPin, Nfc, Pause, Pencil, Phone, Play, Plus, Power, QrCode, RefreshCw, Search, Sparkles, Trash2, Upload, Users,
} from 'lucide-react';
import { api, downloadAction, upload } from '../../api.js';
import {
  ActionBar, Avatar, Bento, Button, Check, cx, date, daysUntil, Empty, IconButton, Input, isoDate, List, Load, money, MoreMenu, Page, Pill, Pressable, Row, Section, Segmented, Select, Sheet, Stat, Table, Tabs, Textarea, Tile, useAction, useApi, useConfirm, useDirtyGuard, useForm, useToast,
} from '../../ui/index.jsx';
import { useBase, VenueBadge } from './_parts.jsx';
import OrbBrand from '../../ui/OrbBrand.jsx';
import { compressImage, uploadPhoto } from '../officer/_parts.jsx';
import { useAuth } from '../../auth.jsx';
import { ShiftLogList } from '../shift/ShiftLogs.jsx';
import { BanRegister } from '../shift/Bans.jsx';
import VenuePackTab from './VenuePackTab.jsx';
import { AnalyticsView, useModuleOn } from './Analytics.jsx';
import { GiveFeedbackSheet } from '../venue/_feedback.jsx';
import { FeedbackList } from './Feedback.jsx';
import { ClientSelect } from './_client.jsx';
import { InviteSheet } from '../people/_access.jsx';
import { viewFiles } from '../../ui/FileViewer.jsx';

const UK = [54.3, -2.6];
// Old tab names and where each opens now: Site setup parts (and Details) live in Setup, documents, logs and bans in Records
const OLD_SETUP = { location: 'location', codes: 'codes', qr: 'codes', rates: 'rates', details: 'details' };
const OLD_RECORDS = { documents: 'docs', logs: 'logs', bans: 'bans' };

export default function VenueDetail() {
  const { id } = useParams();
  const base = useBase();
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab') || 'setup';
  const tab = OLD_SETUP[raw] ? 'setup' : OLD_RECORDS[raw] ? 'records' : raw;
  const view = params.get('view') || OLD_RECORDS[raw] || 'docs';
  const { user } = useAuth();
  const isCo = user.role === 'company';
  const q = useApi('venues.get', { id });
  const clients = useApi('clients.list', {}, { skip: !isCo });
  const analytics = useModuleOn('analytics');
  const [give, setGive] = useState(false);
  const [fbKey, setFbKey] = useState(0);
  const [run] = useAction();
  const confirm = useConfirm();
  // Unsaved edits in the Details form; switching tab asks first
  const dirty = useRef(false);
  const go = async (t, extra) => {
    if (dirty.current && t !== tab && !(await confirm({ title: 'Discard changes?', body: 'You have unsaved changes in Details.', confirm: 'Discard', cancel: 'Keep editing', danger: true }))) return;
    dirty.current = false;
    setParams({ tab: t, ...extra }, { replace: true });
  };
  const setActive = async (v, on) => {
    if (!on && !(await confirm({ title: `Deactivate ${v.name}?`, body: 'Inactive venues are hidden from the rota. Nothing is deleted; you can reactivate it at any time.', confirm: 'Deactivate', danger: true }))) return;
    run(() => api('venues.save', { id: v.id, active: on }), on ? 'Venue reactivated' : 'Venue deactivated').then(q.reload).catch(() => {});
  };

  return (
    <Load q={q}>
      {(v) => (
        <Page title={v.name} back={{ to: `${base}/venues`, label: 'Venues' }}
          subtitle={(
            <span className="mt-1 flex items-center gap-3">
              <VenueBadge name={v.name} logo={v.logo_url} size={48} />
              <span className="min-w-0">
                <span className="flex items-start gap-1.5 text-subhead"><MapPin size={16} className="mt-0.5 shrink-0" /><span className="min-w-0">{[v.address, v.postcode].filter(Boolean).join(', ') || 'No address'}</span></span>
                <span className="block text-footnote">{v.client_name || 'No client'}{v.phone && <> · <a href={`tel:${v.phone}`} className="font-semibold text-blue"><Phone size={12} className="mr-0.5 inline" aria-hidden />{v.phone}</a></>}</span>
              </span>
            </span>
          )}
          actions={<><Pill status={v.active ? 'active' : 'closed'}>{v.active ? 'Active' : 'Inactive'}</Pill>
            <MoreMenu items={[
              { label: 'Log feedback', icon: MessageSquareHeart, onClick: () => setGive(true) },
              v.active ? { label: 'Deactivate', icon: Power, danger: true, hint: 'Hide it from the rota', onClick: () => setActive(v, false) }
                : { label: 'Reactivate', icon: Power, onClick: () => setActive(v, true) },
            ]} /></>}>
          <GiveFeedbackSheet open={give} onClose={() => setGive(false)} venueId={v.id}
            onDone={() => { setParams({ tab: 'feedback' }, { replace: true }); setFbKey((k) => k + 1); q.reload(); }} />

          <OrbFill v={v} isCo={isCo} fresh={params.get('new') === '1'} onSaved={q.reload} />

          <Tabs value={tab} onChange={(t) => go(t)} tabs={[
            { value: 'setup', label: 'Setup' }, { value: 'people', label: 'People' }, { value: 'pack', label: 'Instructions' },
            { value: 'feedback', label: 'Feedback', count: v.feedback_open || undefined }, { value: 'records', label: 'Records' },
            ...(analytics ? [{ value: 'analytics', label: 'Analytics' }] : []),
          ]} />

          {tab === 'setup' && <SetupTab v={v} isCo={isCo} focus={OLD_SETUP[raw]} onSaved={q.reload} canPhoto={isCo || user.role === 'security'}
            details={<DetailsTab key={[v.address, v.postcode, v.website_url, v.active].join('|')} v={v} clients={clients.data || []} onClientCreated={clients.reload} isCo={isCo} onSaved={q.reload}
              onDirty={(x) => { dirty.current = x; }} />} />}
          {tab === 'people' && <PeopleTab v={v} isCo={isCo} onChanged={q.reload} />}
          {tab === 'feedback' && <FeedbackList key={fbKey} venueId={v.id} fixedVenue onChanged={q.reload} />}
          {tab === 'people' && isCo && <RecentEmail type="venue" id={v.id} />}
          {tab === 'pack' && <VenuePackTab venueId={v.id} />}
          {tab === 'records' && (
            <>
              <Segmented className="mb-4" value={view} onChange={(x) => go('records', { view: x })} options={[
                { value: 'docs', label: 'Documents', count: v.documents.length }, { value: 'logs', label: 'Shift logs' }, { value: 'bans', label: 'Ejections & bans' },
              ]} />
              {view === 'docs' && <DocumentsTab venueId={v.id} />}
              {view === 'logs' && <ShiftLogList venueId={v.id} />}
              {view === 'bans' && <BanRegister venueId={v.id} />}
            </>
          )}
          {tab === 'analytics' && analytics && <AnalyticsView venueId={v.id} fixedVenue />}
        </Page>
      )}
    </Load>
  );
}

/* ---------- Setup ---------- */

// Everything that sets the site up for shifts on one page: where officers clock in, the codes they scan or tap,
// (company managers only) what the venue is charged per role, then the venue's details
function SetupTab({ v, isCo, focus, onSaved, canPhoto, details }) {
  const parts = [
    { id: 'location', label: 'Location' },
    { id: 'codes', label: 'Venue codes' },
    ...(isCo ? [{ id: 'rates', label: 'Charge rates' }] : []),
    { id: 'details', label: 'Details' },
  ];
  const go = (id) => document.getElementById(`setup-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  useEffect(() => {
    if (focus && focus !== 'location') { const t = setTimeout(() => go(focus), 150); return () => clearTimeout(t); }
    return undefined;
  }, [focus]);
  return (
    <div>
      <Bento className="mb-4">
        <Tile title="Card photo" className="col-span-2">
          <div className="flex items-center gap-4">
            <VenuePhoto v={v} canEdit={canPhoto} onSaved={onSaved} />
            <p className="min-w-0 text-subhead text-muted">Shown on the venue's cards in the app.</p>
          </div>
        </Tile>
        <Tile title="Geofence">
          <Stat value={v.lat == null ? '–' : `${v.radius_m}m`} label={v.lat == null ? 'Location not set' : 'Clock-in radius'} tone={v.lat == null ? 'amber' : undefined} />
        </Tile>
        <Tile title="Access">
          <Stat value={v.contacts.length} label={v.contacts.length === 1 ? 'Venue manager' : 'Venue managers'} hint={`${v.security.length} security manager${v.security.length === 1 ? '' : 's'}`} />
        </Tile>
      </Bento>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {parts.map((p) => (
          <Pressable key={p.id} press onClick={() => go(p.id)} className="min-h-9 rounded-full bg-fill px-3.5 py-1.5 text-footnote font-semibold text-muted hover:text-ink">{p.label}</Pressable>
        ))}
      </div>
      <section id="setup-location" className="scroll-mt-20">
        <Section title="Location" className="mt-0">
          <LocationTab key={`${v.lat},${v.lng}`} v={v} onSaved={onSaved} />
        </Section>
      </section>
      <section id="setup-codes" className="scroll-mt-20">
        <Section title="Venue codes" className="mt-8"><QrTab v={v} /></Section>
      </section>
      {isCo && (
        <section id="setup-rates" className="mt-8 scroll-mt-20">
          <RatesTab venueId={v.id} />
        </section>
      )}
      <section id="setup-details" className="scroll-mt-20">
        <Section title="Details" className="mt-8">{details}</Section>
      </section>
    </div>
  );
}

/* ---------- Location ---------- */

const pinIcon = L.divIcon({
  className: '',
  html: '<div style="width:22px;height:22px;border-radius:50%;background:var(--accent-fill,var(--color-blue));border:3px solid #fff;box-shadow:0 0 0 2px color-mix(in srgb,var(--accent-fill,var(--color-blue)) 35%,transparent),0 4px 10px rgba(11,18,32,.35)"></div>',
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
      const accent = getComputedStyle(document.documentElement).getPropertyValue('--color-blue').trim() || '#8A6A2B';
      r.circle = L.circle(ll, { radius, color: accent, weight: 2, fillColor: accent, fillOpacity: 0.12 }).addTo(r.map);
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
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

const PROOF_RULES = [
  { value: 'any_one', label: 'Any 1 check (looser)' },
  { value: 'two_of_three', label: '2 of 3 checks (recommended)' },
  { value: 'all_three', label: 'All 3 checks (strictest)' },
];

// The venue's picture on its cards: an uploaded photo, else its picture on the website, else an icon
function VenuePhoto({ v, canEdit, onSaved }) {
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const file = useRef(null);
  const [broken, setBroken] = useState(false);
  const src = v.photo_url || (v.site_client && !broken ? `/img/opulence/clients/${v.site_client}-480.jpg` : null);
  const save = (photo, msg) => run(() => api('venues.save', { id: v.id, ...photo }), msg).then(onSaved).catch(() => {});
  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    const keys = f && await run(async () => { const { photo_key, photo_thumb_key } = await uploadPhoto(f); return { photo_key, photo_thumb_key }; }).catch(() => null);
    if (keys) save(keys, 'Venue photo updated');
  };
  const remove = async () => {
    if (await confirm({ title: 'Remove the venue photo?', body: 'The venue card goes back to its website picture or initials.', confirm: 'Remove', danger: true })) save({ photo_key: null }, 'Venue photo removed');
  };
  return (
    <div className="flex shrink-0 flex-col items-center gap-1.5">
      {src
        ? <img src={src} alt="" onError={() => setBroken(true)} className="h-20 w-20 rounded-2xl object-cover" />
        : <div className="grid h-20 w-20 place-items-center rounded-2xl bg-paper text-blue"><Building2 size={24} /></div>}
      {canEdit && (
        <div className="flex gap-1">
          <IconButton icon={Upload} label={v.photo_url ? 'Change photo' : 'Add photo'} size="sm" disabled={busy} onClick={() => file.current?.click()} />
          {v.photo_url && <IconButton icon={Trash2} label="Remove photo" size="sm" disabled={busy} onClick={remove} />}
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/heic" className="hidden" onChange={pick} />
        </div>
      )}
    </div>
  );
}

// A checkbox with its label and hint; the whole row ticks it
function CheckRow({ checked, onChange, label, hint }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 py-2">
      <Check checked={checked} onChange={onChange} label={label} className="mt-0.5" />
      <span className="min-w-0"><span className="block text-body font-medium">{label}</span>{hint && <span className="block text-caption text-muted">{hint}</span>}</span>
    </label>
  );
}

function DetailsTab({ v, clients, onClientCreated, isCo, onSaved, onDirty }) {
  const [run, busy] = useAction();
  const f = useForm({
    client_id: v.client_id || '', name: v.name || '', address: v.address || '', postcode: v.postcode || '', phone: v.phone || '',
    instructions: v.instructions || '', notes: v.notes || '', invoice_cycle: v.invoice_cycle || '', site_client: v.site_client || '', proof_rule: v.proof_rule || 'two_of_three', active: !!v.active,
    on_website: v.on_website !== false, city: v.city || '', website_blurb: v.website_blurb || '', website_url: v.website_url || '',
  });
  // What was last saved, so the bar goes once a save lands even when the form isn't rebuilt
  const [saved, setSaved] = useState(f.v);
  const dirty = JSON.stringify(f.v) !== JSON.stringify(saved);
  useDirtyGuard(dirty);
  useEffect(() => { onDirty?.(dirty); }, [dirty]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onDirty?.(false), []); // eslint-disable-line react-hooks/exhaustive-deps
  const site = useApi('reviews.clients', {}, { skip: !isCo });
  // Client, invoicing and the website tile belong to the company manager; the server ignores them from anyone else
  const save = () => run(() => api('venues.save', {
    id: v.id, ...f.v, client_id: f.v.client_id || null, invoice_cycle: f.v.invoice_cycle || null, site_client: f.v.site_client || null, postcode: f.v.postcode.toUpperCase(),
    ...(isCo ? {} : { client_id: undefined, invoice_cycle: undefined, site_client: undefined, on_website: undefined, city: undefined, website_blurb: undefined, website_url: undefined }),
  }), 'Venue saved').then(() => { setSaved(f.v); onSaved(); }).catch(() => {});

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Tile title="Venue">
        <div className="space-y-4">
          <VenueLogo v={v} onSaved={onSaved} />
          <Input label="Name" {...f.bind('name')} />
          {isCo && <ClientSelect clients={clients} value={f.v.client_id} onChange={(id) => f.set('client_id', id)} onCreated={onClientCreated}
            hint={f.v.client_id !== (v.client_id || '') ? 'Save to move this venue to the new client' : undefined} />}
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
          <Select label="Clock-in rule" hint="Officers always confirm with their registered phone, plus this many of: location, venue code (QR or NFC tag), selfie" options={PROOF_RULES} {...f.bind('proof_rule')} />
          {isCo && <Select label="Invoice cycle" placeholder="Company default" options={[{ value: 'weekly', label: 'Weekly' }, { value: 'fortnightly', label: 'Fortnightly' }, { value: 'monthly', label: 'Monthly' }]} {...f.bind('invoice_cycle')} />}
          <CheckRow label="Active" hint="Inactive venues are hidden from the rota" checked={f.v.active} onChange={(x) => f.set('active', x)} />
        </div>
      </Tile>
      <WebsiteTile v={v} f={f} isCo={isCo} sites={site.data?.clients || []} />
      <ActionBar show={dirty || busy} tone="light">
        <span className="mr-2 text-subhead font-semibold">Unsaved changes</span>
        <Button busy={busy} disabled={!f.v.name.trim()} onClick={save}>Save changes</Button>
      </ActionBar>
    </div>
  );
}

// The venue's own logo, shown next to its name in the app. Small PNG and WebP logos go up as they are, so a see-through
// background stays; anything bigger is made smaller first.
function VenueLogo({ v, onSaved }) {
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const file = useRef(null);
  const save = (key, msg) => run(() => api('venues.saveLogo', { id: v.id, key }), msg).then(onSaved).catch(() => {});
  const pick = async (e) => {
    const x = e.target.files?.[0];
    e.target.value = '';
    if (!x) return;
    const asIs = ['image/png', 'image/webp', 'image/jpeg'].includes(x.type) && x.size <= 900000;
    const key = await run(async () => upload(asIs ? x : await compressImage(x, 512, 0.9), 'photo')).catch(() => null);
    if (key) save(key, 'Logo saved');
  };
  const remove = async () => {
    if (await confirm({ title: 'Remove the venue logo?', body: 'The venue shows its initials instead.', confirm: 'Remove', danger: true })) save('', 'Logo removed');
  };
  return (
    <div className="flex items-center gap-3">
      <VenueBadge name={v.name} logo={v.logo_url} size={48} />
      <div className="min-w-0 flex-1">
        <div className="text-footnote font-semibold text-muted">Logo</div>
        <div className="text-caption text-faint">{v.logo_url ? 'Shown next to the venue name in the app' : 'PNG, JPEG or WebP, under 1 MB'}</div>
      </div>
      <Button variant="soft" size="sm" icon={Upload} busy={busy} onClick={() => file.current?.click()}>{v.logo_url ? 'Change' : 'Upload'}</Button>
      {v.logo_url && <IconButton icon={Trash2} label="Remove logo" size="sm" disabled={busy} onClick={remove} />}
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pick} />
    </div>
  );
}

/* ---------- Let Orb fill this in ---------- */

const missingOf = (v) => [!v.address && 'address', !v.postcode && 'postcode', v.lat == null && 'map pin', !v.logo_url && 'logo'].filter(Boolean);
const andList = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const FROM = { website: "From the venue's website", map: 'From OpenStreetMap' };
const LOGO_KIND = { logo: 'Logo on their website', icon: 'Their app icon', picture: 'Their sharing picture' };

// A small Orb button while the venue is missing its address, postcode, map pin or logo; it goes once they are all in
function OrbFill({ v, isCo, fresh, onSaved }) {
  const [open, setOpen] = useState(false);
  const missing = missingOf(v);
  if (!missing.length) return null;
  return (
    <>
      <div className="anim-pop mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-blue-soft px-4 py-3">
        <OrbBrand className="h-9 w-9" />
        <p className="min-w-0 flex-1 text-subhead">{fresh ? 'New venue added. ' : ''}Orb can find the {andList(missing)} on the venue's website and the map.</p>
        <Button size="sm" icon={Sparkles} onClick={() => setOpen(true)}>Let Orb fill this in</Button>
      </div>
      {open && <OrbFillSheet v={v} isCo={isCo} onClose={() => setOpen(false)} onSaved={onSaved} />}
    </>
  );
}

// What Orb found, to tick and correct before saving. Nothing is saved until "Save these".
function OrbFillSheet({ v, isCo, onClose, onSaved }) {
  const [found, setFound] = useState(null);
  const [cand, setCand] = useState(0);
  const [logo, setLogo] = useState(-1);
  const [use, setUse] = useState({ address: true, website: true });
  const f = useForm({ address: '', postcode: '' });
  const [run, busy] = useAction();
  const needAddress = !v.address || !v.postcode || v.lat == null;

  const choose = (list, i) => { setCand(i); f.setV({ address: list[i]?.address || '', postcode: list[i]?.postcode || '' }); };
  useEffect(() => {
    let live = true;
    Promise.allSettled([
      needAddress ? api('venues.findAddress', { id: v.id }) : null,
      v.logo_url ? null : api('venues.findLogo', { id: v.id }),
    ]).then(([a, l]) => {
      if (!live) return;
      const cands = a.value?.candidates || [];
      const logos = l.value?.logos || [];
      const failed = [a, l].find((x) => x.status === 'rejected');
      setFound({ cands, logos, website: a.value?.website || l.value?.website || null, error: !cands.length && !logos.length && failed ? failed.reason?.message : null });
      choose(cands, 0);
      setLogo(logos.length ? 0 : -1);
    });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const c = found?.cands[cand];
  const website = isCo && !v.website_url && found?.website;
  const body = {
    ...(use.address && c && (f.v.address.trim() || f.v.postcode.trim()) ? {
      ...(f.v.address.trim() ? { address: f.v.address.trim() } : {}),
      ...(f.v.postcode.trim() ? { postcode: f.v.postcode.trim().toUpperCase() } : {}),
      // A pin set by hand (the entrance) is kept; Orb only adds one where there is none
      ...(v.lat == null && c.lat != null ? { lat: c.lat, lng: c.lng } : {}),
    } : {}),
    ...(website && use.website ? { website_url: website } : {}),
  };
  const pickedLogo = found?.logos[logo];
  const any = Object.keys(body).length > 0 || !!pickedLogo;
  const save = () => run(async () => {
    if (Object.keys(body).length) await api('venues.save', { id: v.id, ...body });
    if (pickedLogo) await api('venues.useLogo', { id: v.id, url: pickedLogo.url });
  }, 'Venue details saved').then(() => { onSaved(); onClose(); }).catch(() => {});

  return (
    <Sheet open onClose={onClose} title="Let Orb fill this in"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button>{found && <Button busy={busy} disabled={!any} onClick={save}>Save these</Button>}</>}>
      {!found && (
        <div className="grid place-items-center gap-3 py-10 text-center">
          <OrbBrand className="h-12 w-12 animate-pulse" />
          <p className="text-body font-semibold">Orb is looking {v.name} up…</p>
          <p className="text-footnote text-muted">On the venue's website, OpenStreetMap and postcodes.io. This takes a few seconds.</p>
        </div>
      )}
      {found && !found.cands.length && !found.logos.length && !website && (
        <Empty icon={Search} title="Nothing found online" body={found.error || `Orb couldn't find ${v.name} on its website or the map. Add the address in Details, and upload a logo there.`} />
      )}
      {found && (found.cands.length > 0 || found.logos.length > 0 || website) && (
        <div className="space-y-5">
          {found.cands.length > 0 && (
            <section>
              <div className="mb-2 flex items-center gap-3">
                <Check checked={use.address} onChange={(x) => setUse((u) => ({ ...u, address: x }))} label="Use this address" />
                <span className="text-callout font-semibold">Address</span>
              </div>
              {found.cands.length > 1 && (
                <div className="mb-3 space-y-2">
                  {found.cands.map((x, i) => (
                    <Pressable key={i} onClick={() => choose(found.cands, i)} className={cx('rounded-xl px-3.5 py-2.5 ring-1', i === cand ? 'bg-blue-soft ring-blue' : 'ring-line')}>
                      <div className="text-subhead font-semibold">{[x.address, x.postcode].filter(Boolean).join(', ')}</div>
                      <div className="text-caption text-muted">{FROM[x.source]}{x.confidence === 'low' ? ', worth checking' : ''}</div>
                    </Pressable>
                  ))}
                </div>
              )}
              <div className={cx('space-y-3', !use.address && 'opacity-50')}>
                <Textarea label="Address" rows={2} disabled={!use.address} {...f.bind('address')} />
                <Input label="Postcode" disabled={!use.address} {...f.bind('postcode')} />
                <p className="text-caption text-muted">
                  {found.cands.length === 1 && <>{FROM[c.source]}{c.confidence === 'low' ? ', worth checking' : ''}. </>}
                  {v.lat == null ? (c?.lat != null ? 'The map pin goes on this address; move it to the officer entrance in Setup.' : 'No map pin found; set it in Setup.') : 'Your map pin stays as it is.'}
                </p>
              </div>
            </section>
          )}
          {needAddress && !found.cands.length && <p className="rounded-xl bg-bg px-3.5 py-2.5 text-subhead text-muted">Orb couldn't find the address online. Add it in Details.</p>}
          {website && (
            <div className="flex items-center gap-3 rounded-xl bg-bg px-3.5 py-2.5">
              <Check checked={use.website} onChange={(x) => setUse((u) => ({ ...u, website: x }))} label="Save the website link" />
              <div className="min-w-0 flex-1"><div className="text-subhead font-semibold">Website</div><div className="truncate text-caption text-muted">{website}</div></div>
            </div>
          )}
          {found.logos.length > 0 && (
            <section>
              <div className="mb-2 text-callout font-semibold">Logo</div>
              <div className="flex flex-wrap gap-2">
                {found.logos.map((x, i) => (
                  <Pressable key={x.url} press onClick={() => setLogo(i)} aria-pressed={i === logo} aria-label={LOGO_KIND[x.kind] || 'Logo'}
                    className={cx('grid h-24 w-24 place-items-center rounded-2xl bg-white p-2 ring-2', i === logo ? 'ring-blue' : 'ring-line')}>
                    <img src={x.url} alt="" referrerPolicy="no-referrer" className="max-h-full max-w-full object-contain" />
                  </Pressable>
                ))}
                <Pressable press onClick={() => setLogo(-1)} aria-pressed={logo === -1}
                  className={cx('grid h-24 w-24 place-items-center rounded-2xl bg-bg text-subhead font-semibold text-muted ring-2', logo === -1 ? 'ring-blue' : 'ring-transparent')}>None</Pressable>
              </div>
              <p className="mt-2 text-caption text-muted">{pickedLogo ? `${LOGO_KIND[pickedLogo.kind] || 'From their website'}. Orb keeps a copy, so it stays if their site changes.` : 'No logo will be added.'}</p>
            </section>
          )}
          {!v.logo_url && !found.logos.length && <p className="rounded-xl bg-bg px-3.5 py-2.5 text-subhead text-muted">No logo found online. You can upload one in Details.</p>}
        </div>
      )}
    </Sheet>
  );
}

// The venue's tile on the landing page: shown by default, with an AI welcome line until praise arrives
const DEFAULT_LINE = (name) => `Opulence is proud to provide door supervision and venue security for ${name}.`;
// The landing page's own black and gold, so the preview looks like the real tile
const SITE = { ink: '#0b0b0c', gold: '#C9A45C', glow: 'radial-gradient(circle at 30% 20%, #2a2416, #0b0b0c)' };
const initials = (name) => name.split(/\s+/).filter((w) => /^[a-z0-9]/i.test(w)).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '·';

function WebsiteTile({ v, f, isCo, sites }) {
  const [run, busy] = useAction();
  const name = f.v.name.trim() || v.name;
  const linked = sites.find((c) => c.slug === f.v.site_client);
  const photo = v.website_photo_url || (linked && !v.photo_key ? `/img/opulence/clients/${linked.slug}-480.jpg` : null);
  const write = () => run(() => api('venues.writeWebsite', { id: v.id, name, address: f.v.address, postcode: f.v.postcode, city: f.v.city || undefined }))
    .then((w) => {
      if (w.blurb) f.set('website_blurb', w.blurb);
      if (w.city && !f.v.city.trim()) f.set('city', w.city);
    }).catch(() => {});
  return (
    <Tile title="Website" icon={Globe} className="lg:col-span-2">
      <div className="grid gap-5 md:grid-cols-[1fr_260px]">
        {isCo ? (
          <div className="space-y-4">
            <CheckRow label="Show on website" hint={f.v.on_website ? 'This venue has a tile in Clients on the landing page' : 'Hidden from the landing page'}
              checked={f.v.on_website} onChange={(x) => f.set('on_website', x)} />
            {f.v.on_website && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input label="City" placeholder="e.g. Edinburgh" hint="The tile sits under this city" {...f.bind('city')} />
                  <Input label="Website link" inputMode="url" autoCapitalize="none" placeholder="venue.co.uk" hint="Optional, shown as Visit venue" {...f.bind('website_url')} />
                </div>
                <div>
                  <Textarea label="Welcome line" rows={3} maxLength={220} placeholder={DEFAULT_LINE(name)}
                    hint={`Shown until praise is ticked for the website. ${f.v.website_blurb.length}/220`} {...f.bind('website_blurb')} />
                  <Button variant="secondary" size="sm" icon={Sparkles} busy={busy} className="mt-2" onClick={write}>Write with AI</Button>
                </div>
                <Select label="Reviews from the old website card" hint="Links reviews collected under a website card from before this venue existed" placeholder="None"
                  options={sites.map((c) => ({ value: c.slug, label: `${c.name} (${c.city})` }))} {...f.bind('site_client')} />
              </>
            )}
          </div>
        ) : (
          <p className="text-body text-muted">{v.on_website === false ? 'This venue is hidden from the Opulence website.' : 'This is how the venue appears on the Opulence website. The office looks after its text.'}</p>
        )}
        <div className={cx('self-start overflow-hidden rounded-2xl text-white shadow-tile', !f.v.on_website && 'opacity-50')} style={{ background: SITE.ink }} aria-label="Website tile preview">
          {photo
            ? <img src={photo} alt="" className="aspect-[4/3] w-full object-cover" />
            : <div className="grid aspect-[4/3] place-items-center text-[40px] font-semibold tracking-wide" style={{ background: SITE.glow, color: SITE.gold }}>{initials(name)}</div>}
          <div className="space-y-1 p-3">
            <div className="text-subhead font-semibold">{name}</div>
            {f.v.city && <div className="text-footnote uppercase tracking-wide" style={{ color: SITE.gold }}>{f.v.city}</div>}
            <p className="text-footnote text-white/75">{f.v.website_blurb.trim() || DEFAULT_LINE(name)}</p>
          </div>
        </div>
      </div>
    </Tile>
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
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[340px_1fr]">
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
      <NfcTags v={v} />
    </div>
  );
}

// Secure NFC tags: each tap gives a one-time code, so a copied link or photo of the tag doesn't work
function NfcTags({ v }) {
  const q = useApi('venues.tags', { venue_id: v.id });
  const confirm = useConfirm();
  const toast = useToast();
  const [run, busy] = useAction();
  const [edit, setEdit] = useState(null);
  const [now, setNow] = useState(Date.now());
  const until = q.data?.pairing_until ? new Date(q.data.pairing_until).getTime() : 0;
  const left = Math.max(0, Math.round((until - now) / 1000));

  // While pairing, tick the countdown and pick up the new tag as soon as it is tapped
  useEffect(() => {
    if (!until) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    const r = setInterval(() => q.reload(), 4000);
    return () => { clearInterval(t); clearInterval(r); };
  }, [until]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (until && left === 0) q.reload(); }, [left === 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const pair = () => run(() => api('venues.tagPair', { venue_id: v.id }), 'Pairing on: tap the new tag with your phone').then(() => { setNow(Date.now()); q.reload(); }).catch(() => {});
  const update = (t, patch, msg) => run(() => api('venues.tagUpdate', { id: t.id, ...patch }), msg).then(q.reload).catch(() => {});
  const remove = async (t) => {
    if (!(await confirm({ title: `Remove ${t.label}?`, body: 'The tag stops working for clock-in straight away. You can pair it again later.', confirm: 'Remove', danger: true }))) return;
    run(() => api('venues.tagRemove', { id: t.id }), 'Tag removed').then(q.reload).catch(() => {});
  };

  return (
    <Tile title="NFC tags" icon={Nfc} className="lg:col-span-2">
      <Load q={q}>
        {(d) => (
          <>
            {!d.nfc_ready && <p className="mb-3 rounded-xl bg-amber-soft px-3.5 py-2.5 text-subhead text-amber">NFC tags aren't set up for your company yet. A company manager can do this in Settings → Workforce rules → Clock-in proof.</p>}
            {left > 0 ? (
              <div className="mb-3 flex items-center gap-3 rounded-xl bg-blue-soft px-4 py-3">
                <Nfc size={22} className="shrink-0 animate-pulse text-blue" />
                <div className="min-w-0 flex-1 text-subhead"><b>Tap the new tag with your phone now.</b> It links to {v.name}. Pairing closes in <span className="num font-semibold">{Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}</span>.</div>
              </div>
            ) : (
              <Button className="mb-3" icon={Plus} busy={busy} disabled={!d.nfc_ready} onClick={pair}>Pair a tag</Button>
            )}
            {!d.tags.length && <p className="text-subhead text-muted">No NFC tags yet. Stick a programmed tag by the officer entrance, then pair it here.</p>}
            {d.tags.length > 0 && <List>
              {d.tags.map((t) => (
                <Row key={t.id} left={<span className="grid h-9 w-9 place-items-center rounded-full bg-blue-soft text-blue"><Nfc size={18} /></span>} title={t.label}
                  subtitle={t.last_tap_at ? `Last tapped ${date(t.last_tap_at)} ${new Date(t.last_tap_at).toTimeString().slice(0, 5)}` : 'Not tapped yet'}
                  right={(
                    <span className="flex items-center gap-1">
                      {t.status === 'paused' && <Pill tone="amber">Paused</Pill>}
                      <IconButton icon={Pencil} label="Rename" onClick={() => setEdit(t)} />
                      <IconButton icon={t.status === 'paused' ? Play : Pause} label={t.status === 'paused' ? 'Resume' : 'Pause'} disabled={busy}
                        onClick={() => update(t, { status: t.status === 'paused' ? 'active' : 'paused' }, t.status === 'paused' ? 'Tag back on' : 'Tag paused')} />
                      <IconButton icon={Trash2} label="Remove" disabled={busy} onClick={() => remove(t)} />
                    </span>
                  )} />
              ))}
            </List>}
            <p className="mt-3 text-caption text-faint">Officers hold their phone against the tag to count it as the venue code. Pause a tag if it goes missing.</p>
          </>
        )}
      </Load>
      {edit && <TagName tag={edit} onClose={() => setEdit(null)} onSave={(label) => { if (!label.trim()) return toast('Enter a name', 'error'); update(edit, { label: label.trim() }, 'Tag renamed'); setEdit(null); return null; }} />}
    </Tile>
  );
}

function TagName({ tag, onClose, onSave }) {
  const [label, setLabel] = useState(tag.label);
  return (
    <Sheet open onClose={onClose} title="Rename tag" size="sm" footer={<Button onClick={() => onSave(label)}>Save</Button>}>
      <Input label="Name" hint="Where it is, e.g. Staff entrance" value={label} onChange={(e) => setLabel(e.target.value)} autoFocus />
    </Sheet>
  );
}

/* ---------- Rates ---------- */

const pct = (n) => `+${Number(n)}%`;
const upliftLine = (r) => [Number(r.night_uplift) && `night ${pct(r.night_uplift)}`, Number(r.weekend_uplift) && `weekend ${pct(r.weekend_uplift)}`,
  Number(r.bh_uplift) && `bank hol. ${pct(r.bh_uplift)}`, `min ${Number(r.min_hours)}h`].filter(Boolean).join(' · ');

// One row per role (speciality): what the venue is charged an hour today, any rate already booked for later, and the shifts
// still without a rate. Approving a timesheet fixes this rate on it, and invoices bill exactly that.
function RatesTab({ venueId }) {
  const rates = useApi('venues.rates', { venue_id: venueId });
  const roles = useApi('roles.list');
  const gaps = useApi('venues.rateGaps', { venue_id: venueId });
  const [sheet, setSheet] = useState(null); // { role, from?, base? }
  const [history, setHistory] = useState(false);
  const confirm = useConfirm();
  const [run] = useAction();
  const today = isoDate();
  const reload = () => { rates.reload(); gaps.reload(); };

  const status = useMemo(() => {
    const seen = new Set();
    const out = {};
    for (const r of rates.data || []) { // ordered by role, effective_from desc
      if (r.effective_from > today) out[r.id] = 'scheduled';
      else if (!seen.has(r.role)) { out[r.id] = 'current'; seen.add(r.role); } else out[r.id] = 'superseded';
    }
    return out;
  }, [rates.data, today]);

  const byRole = useMemo(() => {
    const gap = Object.fromEntries((gaps.data || []).map((g) => [g.role, g]));
    const list = (roles.data || []).map((ro) => {
      const mine = (rates.data || []).filter((r) => r.role === ro.code);
      return {
        ...ro, current: mine.find((r) => status[r.id] === 'current') || null,
        next: mine.filter((r) => status[r.id] === 'scheduled').sort((a, b) => (a.effective_from < b.effective_from ? -1 : 1))[0] || null, gap: gap[ro.code] || null,
      };
    });
    // Roles in use here first: rated, then booked without a rate, then the rest
    const rank = (r) => (r.gap ? 0 : r.current || r.next ? 1 : 2);
    return list.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }, [roles.data, rates.data, gaps.data, status]);

  const del = async (r) => {
    if (!(await confirm({ title: 'Delete this rate?', body: `${r.role_name} at ${money(r.rate)}/h from ${date(r.effective_from)}. Existing invoices are not changed.`, confirm: 'Delete', danger: true }))) return;
    await run(() => api('venues.deleteRate', { id: r.id }), 'Rate deleted').catch(() => {});
    reload();
  };

  const tone = { current: 'green', scheduled: 'blue', superseded: 'grey' };
  return (
    <Section title="Charge rates per hour" className="mt-0" action={<Button size="sm" variant="soft" onClick={() => setHistory((h) => !h)}>{history ? 'Hide history' : 'Rate history'}</Button>}>
      <Load q={roles}>
        {() => (
          <List>
            {byRole.map((r) => {
              const base = r.current || r.next;
              return (
                <div key={r.code} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-body font-semibold">{r.name}</div>
                    <div className="text-footnote text-muted">
                      {r.current ? upliftLine(r.current) : r.next ? `From ${date(r.next.effective_from)}` : 'No charge rate'}
                      {r.current && r.next && <> · <span className="text-blue">{money(r.next.rate)}/h from {date(r.next.effective_from)}</span></>}
                    </div>
                    {r.gap && (
                      <div className="mt-1 text-footnote font-semibold text-red">
                        {r.gap.shifts} shift{r.gap.shifts === 1 ? '' : 's'} from {date(r.gap.first_day)} with no rate{r.gap.waiting ? `, ${r.gap.waiting} timesheet${r.gap.waiting === 1 ? '' : 's'} can't be approved yet` : ''}
                      </div>
                    )}
                  </div>
                  <span className={cx('num text-title3 font-bold', !r.current && 'text-faint')}>{r.current ? money(r.current.rate) : '–'}<span className="text-footnote font-semibold text-muted">/h</span></span>
                  <Button size="sm" variant={r.gap ? 'primary' : r.current ? 'secondary' : 'soft'} icon={r.current ? Pencil : Plus}
                    onClick={() => setSheet({ role: r.code, name: r.name, base, from: r.gap ? r.gap.first_day : today })}>
                    {r.current ? 'Change' : 'Set rate'}
                  </Button>
                </div>
              );
            })}
          </List>
        )}
      </Load>
      <p className="mt-2 px-1 text-caption text-faint">Approving a timesheet fixes the rate on that shift's date; the venue signs it and its invoice bills that rate. Uplifts apply to the part of a shift that falls at night, at the weekend or on a bank holiday. Short shifts are billed at the minimum hours.</p>
      {history && (
        <Load q={rates}>
          {(rows) => (
            <div className="mt-4">
              <Table rows={rows} empty="No charge rates yet."
                columns={[
                  { key: 'role_name', mobile: 'title', label: 'Role', render: (r) => <span className="font-semibold">{r.role_name}</span> },
                  { key: 'rate', mobile: 'value', label: 'Rate', align: 'right', render: (r) => <span className="num font-semibold">{money(r.rate)}</span> },
                  { key: 'night', mobile: 'sub', mobileLabel: true, label: 'Night', align: 'right', render: (r) => <span className="num">{pct(r.night_uplift)}</span> },
                  { key: 'weekend', mobile: 'sub', mobileLabel: true, label: 'Weekend', align: 'right', render: (r) => <span className="num">{pct(r.weekend_uplift)}</span> },
                  { key: 'bh', mobile: false, label: 'Bank hol.', align: 'right', render: (r) => <span className="num">{pct(r.bh_uplift)}</span> },
                  { key: 'min', mobile: false, label: 'Min hours', align: 'right', render: (r) => <span className="num">{Number(r.min_hours)}h</span> },
                  { key: 'from', mobile: false, label: 'From', render: (r) => date(r.effective_from) },
                  { key: 'st', mobile: 'value', label: 'Status', render: (r) => <Pill tone={tone[status[r.id]]}>{status[r.id] === 'current' ? 'Current' : status[r.id] === 'scheduled' ? 'Scheduled' : 'Superseded'}</Pill> },
                  { key: 'x', mobile: 'value', label: '', align: 'right', render: (r) => <IconButton icon={Trash2} label="Delete rate" onClick={(e) => { e.stopPropagation(); del(r); }} className="ml-auto h-8 w-8 text-red hover:bg-red-soft" /> },
                ]} />
            </div>
          )}
        </Load>
      )}
      {sheet && <RateSheet venueId={venueId} init={sheet} onClose={() => setSheet(null)} onSaved={reload} />}
    </Section>
  );
}

// Set or change one role's rate. Starts from its current rate; the first rate for a role starts on its first unrated shift.
function RateSheet({ venueId, init, onClose, onSaved }) {
  const [run, busy] = useAction();
  const b = init.base;
  const f = useForm({
    rate: b ? String(Number(b.rate)) : '', night_uplift: String(b ? Number(b.night_uplift) : 0), weekend_uplift: String(b ? Number(b.weekend_uplift) : 0),
    bh_uplift: String(b ? Number(b.bh_uplift) : 50), min_hours: String(b ? Number(b.min_hours) : 4), effective_from: init.from || isoDate(),
  });
  const ok = Number(f.v.rate) > 0 && f.v.effective_from;
  const save = () => run(() => api('venues.saveRate', {
    venue_id: venueId, role: init.role, rate: Number(f.v.rate), night_uplift: Number(f.v.night_uplift || 0), weekend_uplift: Number(f.v.weekend_uplift || 0),
    bh_uplift: Number(f.v.bh_uplift || 0), min_hours: Number(f.v.min_hours || 0), effective_from: f.v.effective_from,
  }), 'Charge rate saved').then(() => { onSaved(); onClose(); }).catch(() => {});
  return (
    <Sheet open onClose={onClose} title={`${init.name}: charge rate`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!ok} onClick={save}>Save rate</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Rate per hour (£)" type="number" inputMode="decimal" step="0.01" min="0" autoFocus {...f.bind('rate')} />
          <Input label="Starts on" type="date" {...f.bind('effective_from')} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Input label="Night %" type="number" inputMode="decimal" {...f.bind('night_uplift')} />
          <Input label="Weekend %" type="number" inputMode="decimal" {...f.bind('weekend_uplift')} />
          <Input label="Bank hol. %" type="number" inputMode="decimal" {...f.bind('bh_uplift')} />
        </div>
        <Input label="Minimum billable hours" type="number" inputMode="decimal" step="0.25" {...f.bind('min_hours')} />
        <p className="text-footnote text-muted">
          Shifts from this date use the new rate when their timesheet is approved. Timesheets already approved, and issued invoices, keep the rate they were approved at.
          {init.from && init.from < isoDate() && !b ? ' It starts on the first shift here without a rate, so those timesheets can be approved.' : ''}
        </p>
      </div>
    </Sheet>
  );
}

/* ---------- People ---------- */

function PeopleTab({ v, isCo, onChanged }) {
  const [inviting, setInviting] = useState(false);
  const [run] = useAction();
  const confirm = useConfirm();
  // Taking someone off this venue keeps their other venues; the server replaces the whole list
  const remove = async (u) => {
    if (!(await confirm({ title: `Remove ${u.name} from ${v.name}?`, body: `They keep their login${u.venue_ids.length > 1 ? ' and their other venues' : ''}, but lose access to this venue.`, confirm: 'Remove', danger: true }))) return;
    await run(() => api('users.update', { id: u.id, venue_ids: u.venue_ids.filter((x) => x !== v.id) }), `${u.name} removed from ${v.name}`).then(onChanged).catch(() => {});
  };
  const removeBtn = (u) => isCo && <IconButton icon={UserMinus} label={`Remove ${u.name} from this venue`} size="sm" onClick={() => remove(u)} />;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div>
        <Section title="Venue managers" className="mt-0"
          action={isCo && <Button size="sm" variant="soft" icon={UserPlus} onClick={() => setInviting(true)}>Invite venue manager</Button>}>
          {v.contacts.length ? (
            <List>
              {v.contacts.map((u) => (
                <Row key={u.id} left={<Avatar name={u.name} size={38} />} title={u.name} subtitle={[u.email, u.phone].filter(Boolean).join(' · ')}
                  right={<div className="flex items-center gap-2">{u.status !== 'active' && <Pill status={u.status === 'invited' ? 'pending' : 'cancelled'}>{u.status === 'invited' ? 'Invited' : 'Disabled'}</Pill>}{removeBtn(u)}</div>} />
              ))}
            </List>
          ) : <Empty icon={Users} title="No venue managers" body="Invite the client's site manager so they can sign timesheets, request cover and see incidents." />}
        </Section>
      </div>
      <div>
        <Section title="Security managers" className="mt-0">
          {v.security.length ? (
            <List>
              {v.security.map((u) => <Row key={u.id} left={<Avatar name={u.name} size={38} />} title={u.name} subtitle={[u.email, u.phone].filter(Boolean).join(' · ')} right={removeBtn(u)} />)}
            </List>
          ) : <Empty icon={Users} title="No security managers" body="Security managers assigned to this venue can run its rota and live board." />}
        </Section>
      </div>
      <div className="lg:col-span-2">
        {isCo && <Button variant="soft" icon={Users} to="/company/settings?tab=users">Manage users and venue access</Button>}
      </div>
      {inviting && <InviteSheet preset={{ role: 'venue', venue_ids: [v.id], client_id: v.client_id || '' }} onClose={() => setInviting(false)} onDone={onChanged} />}
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

  const openDoc = (d) => viewFiles([{ name: d.title, mime: d.mime, load: () => api('docs.url', { id: d.id }) }]);
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

export function DocSheet({ venueId, onClose, onSaved }) {
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

