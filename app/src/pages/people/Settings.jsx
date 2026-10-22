import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bell, Building2, ImageUp, Palette, CalendarDays, ChevronRight, Clock, FileSignature, KeyRound, Landmark, LayoutGrid, Percent, Plus, ReceiptText, Trash2, UserPlus, Users } from 'lucide-react';
import { api, upload } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  ActionBar, Avatar, Button, cx, dayLabel, Empty, IconButton, Input, isoDate, List, Load, Page, Pill, Pressable, relative, Row, Section, Segmented, Select, Sheet, Table, Tabs, Textarea, Tile, Toggle, useAction, useApi, useConfirm, useForm,
} from '../../ui/index.jsx';
import { Chips, CopyLink, DOC_KINDS, docKindLabel, SIA_TYPES } from './_parts.jsx';
import { ROLE_LABEL } from '../../layouts/nav.js';
import { NOTIFY_KINDS } from '../officer/_notify.jsx';

const TABS = [
  { value: 'company', label: 'Company details' }, { value: 'users', label: 'Users & access' }, { value: 'rules', label: 'Workforce rules' },
  { value: 'templates', label: 'Templates' }, { value: 'notifications', label: 'Notifications' }, { value: 'demos', label: 'Demo requests' },
];
// Older links used these tab names
const OLD_TAB = { calendar: 'rules', contracts: 'templates', account: 'company' };

export default function Settings() {
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('tab') || 'company';
  const tab = OLD_TAB[raw] || (TABS.some((t) => t.value === raw) ? raw : 'company');
  return (
    <Page title="Settings" subtitle="Company details, access, workforce rules and templates">
      <Tabs tabs={TABS} value={tab} onChange={(t) => setSp(t === 'company' ? {} : { tab: t }, { replace: true })} />
      {tab === 'company' && <CompanyTab />}
      {tab === 'users' && <UsersTab openId={sp.get('user')} />}
      {tab === 'rules' && <RulesTab />}
      {tab === 'templates' && <TemplatesTab />}
      {tab === 'notifications' && <NotificationsTab />}
      {tab === 'demos' && <DemosTab />}
    </Page>
  );
}

/* ---------------- Company ---------------- */

const NUMERIC = ['vat_rate', 'payment_terms_days', 'grace_minutes', 'auto_signoff_days', 'rounding_minutes', 'night_start', 'night_end',
  'pay_night_uplift', 'pay_weekend_uplift', 'pay_bh_uplift', 'gps_tolerance_m'];
const hourOpts = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: `${String(h).padStart(2, '0')}:00` }));

const COMPANY_KEYS = ['company_name', 'company_number', 'company_email', 'company_phone', 'company_address', 'vat_number', 'vat_rate',
  'bank_name', 'bank_sort_code', 'bank_account', 'invoice_prefix', 'payment_terms_days', 'invoice_cycle'];
const RULE_KEYS = ['pay_period', 'rounding_minutes', 'grace_minutes', 'auto_signoff_days', 'gps_tolerance_m',
  'night_start', 'night_end', 'pay_night_uplift', 'pay_weekend_uplift', 'pay_bh_uplift'];

function CompanyTab() {
  const q = useApi('settings.get');
  return <Load q={q}>{(s) => <><BrandingTile s={s} onSaved={(d) => q.setData(d)} /><ModulesTile s={s} onSaved={(d) => q.setData(d)} /><SettingsForm s={s} keys={COMPANY_KEYS} onSaved={(d) => q.setData(d)}>{(b) => <CompanyFields b={b} />}</SettingsForm></>}</Load>;
}

const DEFAULT_COLOR = '#0A6CFF';
const PRESETS = ['#0A6CFF', '#1B5E20', '#00796B', '#C62828', '#6A1B9A', '#0B1220'];
const HEX = /^#[0-9a-f]{6}$/i;

// Crops the empty border (white, off-white or transparent) off a logo, keeping a small even margin.
// Returns the original file when there's nothing to trim or the image looks blank.
async function trimLogo(file) {
  try {
    const bmp = await createImageBitmap(file);
    const { width: w, height: h } = bmp;
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.drawImage(bmp, 0, 0);
    const px = ctx.getImageData(0, 0, w, h).data;
    const bg = [px[0], px[1], px[2], px[3]];
    const isBg = (i) => px[i + 3] < 16 || (bg[3] > 16 && Math.abs(px[i] - bg[0]) <= 24 && Math.abs(px[i + 1] - bg[1]) <= 24 && Math.abs(px[i + 2] - bg[2]) <= 24);
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (isBg((y * w + x) * 4)) continue;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (x1 < 0 || bw * bh < w * h * 0.05) return file;
    const m = Math.round(Math.max(bw, bh) * 0.04);
    const cx0 = Math.max(0, x0 - m), cy0 = Math.max(0, y0 - m);
    const cw = Math.min(w, x1 + m + 1) - cx0, ch = Math.min(h, y1 + m + 1) - cy0;
    if (cw >= w && ch >= h) return file;
    // PNG keeps transparency; cap the size so the file stays well under the 2 MB limit
    const k = Math.min(1, 1200 / Math.max(cw, ch));
    const out = document.createElement('canvas');
    out.width = Math.round(cw * k); out.height = Math.round(ch * k);
    out.getContext('2d').drawImage(c, cx0, cy0, cw, ch, 0, 0, out.width, out.height);
    const blob = await new Promise((res) => out.toBlob(res, 'image/png'));
    return blob ? new File([blob], (file.name || 'logo').replace(/\.[^.]+$/, '') + '.png', { type: 'image/png' }) : file;
  } catch {
    return file;
  }
}

// The company's logo and colour, used on reports, certificates, emails and in the app
function BrandingTile({ s, onSaved }) {
  const { refresh } = useAuth();
  const [color, setColor] = useState(s.brand_color || DEFAULT_COLOR);
  const [runLogo, logoBusy] = useAction();
  const [runColor, colorBusy] = useAction();
  const file = useRef(null);
  const saved = (d) => { onSaved(d); refresh(); };
  const setLogo = (getKey, msg) => runLogo(async () => saved(await api('settings.setLogo', { key: await getKey() })), msg).catch(() => {});
  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    if (!['image/png', 'image/jpeg'].includes(f.type)) return runLogo(async () => { throw new Error('The logo must be a PNG or JPG image'); }).catch(() => {});
    if (f.size > 2 * 1024 * 1024) return runLogo(async () => { throw new Error('The logo must be under 2 MB'); }).catch(() => {});
    setLogo(async () => upload(await trimLogo(f), 'company'), 'Logo updated');
  };
  const valid = HEX.test(color);
  const current = (s.brand_color || DEFAULT_COLOR).toLowerCase();
  const shown = valid ? color : current;
  const saveColor = () => runColor(async () => saved(await api('settings.update', { brand_color: color.toLowerCase() === DEFAULT_COLOR.toLowerCase() ? '' : color })), 'Colour saved').catch(() => {});
  const name = s.company_name || 'Your company';
  const mark = s.logo_url
    ? <img src={s.logo_url} alt="" className="h-7 w-auto max-w-[120px] object-contain object-left" />
    : <span className="truncate text-subhead font-bold">{name}</span>;
  return (
    <Tile title="Branding" icon={Palette} className="mb-4">
      <p className="mb-4 text-subhead text-muted">Your logo and colour go on incident reports, invoices, pay statements, agreements, QR posters, certificates and emails, and show in the app and on the sign-in page.</p>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className="space-y-4">
          <div>
            <div className="mb-1.5 text-footnote font-semibold text-muted">Logo</div>
            <div className="flex items-center gap-3">
              <div className="grid h-20 w-44 shrink-0 place-items-center rounded-xl border border-line bg-white p-2">
                {s.logo_url ? <img src={s.logo_url} alt="Company logo" className="max-h-full max-w-full object-contain" /> : <ImageUp size={24} className="text-faint" />}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" icon={ImageUp} busy={logoBusy} onClick={() => file.current?.click()}>{s.logo_url ? 'Replace' : 'Upload logo'}</Button>
                {s.logo_url && <Button variant="link-red" size="sm" disabled={logoBusy} onClick={() => setLogo(async () => '', 'Logo removed')}>Remove</Button>}
              </div>
              <input ref={file} type="file" accept="image/png,image/jpeg" className="hidden" onChange={pick} />
            </div>
            <div className="mt-1.5 text-caption text-muted">PNG or JPG, under 2 MB. A wide logo at least 400 px across, on a transparent or white background, works best. Empty borders are trimmed automatically{s.logo_url ? ' — re-upload your logo to get the tighter crop' : ''}.</div>
          </div>
          <div>
            <div className="mb-1.5 text-footnote font-semibold text-muted">Brand colour</div>
            <div className="flex flex-wrap items-center gap-2">
              {PRESETS.map((c) => (
                <Pressable key={c} press onClick={() => setColor(c)} aria-label={`Use colour ${c}`}
                  className={cx('h-9 w-9 rounded-full ring-offset-2 ring-offset-surface', shown.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-ink' : 'ring-1 ring-line')}
                  style={{ background: c }} />
              ))}
              <Input aria-label="Colour hex code" className="w-32" value={color} onChange={(e) => setColor(e.target.value.trim())} error={color && !valid ? 'Like #0A6CFF' : undefined} />
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" busy={colorBusy} disabled={!valid || color.toLowerCase() === current} onClick={saveColor}>Save colour</Button>
              {s.brand_color && <Button variant="secondary" size="sm" disabled={colorBusy} onClick={() => setColor(DEFAULT_COLOR)}>Back to default</Button>}
            </div>
          </div>
        </div>
        <div className="space-y-3" aria-label="Preview">
          <div className="text-footnote font-semibold text-muted">Preview</div>
          <div className="rounded-xl border border-line bg-white p-4 text-ink shadow-sm">
            <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
              <div className="min-w-0">{mark}</div>
              <div className="text-right"><div className="text-headline font-bold">Incident report</div><div className="text-caption text-muted">INC-0042 · v1</div></div>
            </div>
            <div className="mt-3 text-subhead font-bold" style={{ color: shown }}>Summary</div>
            <div className="mt-1 h-2 w-4/5 rounded bg-line" /><div className="mt-1.5 h-2 w-3/5 rounded bg-line" />
            <div className="mt-3 text-right text-caption text-faint">Generated with Orb Security</div>
          </div>
          <div className="rounded-xl border border-line bg-white p-4 text-ink shadow-sm" style={{ borderTop: `4px solid ${shown}` }}>
            {mark}
            <div className="mt-2 text-subhead font-bold">New incident at Riverside Mall</div>
            <span className="mt-2 inline-block rounded-lg px-3 py-1.5 text-footnote font-semibold text-white" style={{ background: shown }}>Open {name.length <= 24 ? name : 'the app'}</span>
          </div>
        </div>
      </div>
    </Tile>
  );
}

const MODULES = [
  { key: 'academy', label: 'Academy', hint: 'Training courses with quizzes and certificates' },
  { key: 'toolbox', label: 'Toolbox', hint: 'Quick guide cards officers can open on shift' },
  { key: 'everyday', label: 'Everyday', hint: 'Team feed with posts, photos and comments' },
];

// Switching a module off hides it from every menu straight away; nothing is deleted
function ModulesTile({ s, onSaved }) {
  const [run] = useAction();
  const confirm = useConfirm();
  const flip = (k) => async (on) => {
    if (!on && !(await confirm({ title: `Switch off ${MODULES.find((m) => m.key === k).label}?`, body: 'It disappears for everyone. Nothing is deleted — switch it back on at any time.', confirm: 'Switch off', danger: true }))) return;
    const d = await run(() => api('settings.update', { modules: { [k]: on } }), on ? 'Switched on' : 'Switched off').catch(() => null);
    if (d) { onSaved(d); window.dispatchEvent(new Event('orb:settings')); }
  };
  return (
    <Tile title="Modules" icon={LayoutGrid} className="mb-4">
      <div className="space-y-2">
        {MODULES.map((m) => <Toggle key={m.key} checked={s.modules?.[m.key] !== false} onChange={flip(m.key)} label={m.label} hint={m.hint} />)}
      </div>
    </Tile>
  );
}

// Edits a subset of the company settings; the bar appears once something changes and saves only what changed
function SettingsForm({ s, keys, onSaved, children }) {
  const toStr = (x) => Object.fromEntries(keys.map((k) => [k, x[k] == null ? '' : String(x[k])]));
  const { v, bind, setV } = useForm(toStr(s));
  const [dirty, setDirty] = useState(false);
  const [run, busy] = useAction();
  useEffect(() => { setDirty(keys.some((k) => String(s[k] ?? '') !== v[k])); }, [v, s]);
  const save = async () => {
    const body = {};
    for (const k of keys) if (String(s[k] ?? '') !== v[k]) body[k] = NUMERIC.includes(k) ? Number(v[k] || 0) : v[k];
    const d = await run(() => api('settings.update', body), 'Settings saved');
    onSaved(d);
    setV(toStr(d));
  };
  return (
    <>
      {children(bind)}
      <ActionBar show={dirty || busy} tone="light">
        <span className="mr-2 text-subhead font-semibold">Unsaved changes</span>
        <Button busy={busy} onClick={save}>Save changes</Button>
      </ActionBar>
    </>
  );
}

function CompanyFields({ b }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Tile title="Company" icon={Building2} className="lg:col-span-2">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Company name" {...b('company_name')} />
          <Input label="Company number" {...b('company_number')} />
          <Input label="Email" type="email" {...b('company_email')} />
          <Input label="Phone" type="tel" {...b('company_phone')} />
          <Textarea label="Address" rows={3} className="sm:col-span-2" hint="Shown on invoices and pay statements" {...b('company_address')} />
        </div>
      </Tile>
      <Tile title="VAT" icon={Percent}>
        <div className="grid grid-cols-2 gap-3">
          <Input label="VAT number" {...b('vat_number')} />
          <Input label="VAT rate (%)" type="number" step="0.01" min="0" {...b('vat_rate')} />
        </div>
      </Tile>
      <Tile title="Bank for client payments" icon={Landmark}>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Bank" className="col-span-2" {...b('bank_name')} />
          <Input label="Sort code" inputMode="numeric" placeholder="00-00-00" {...b('bank_sort_code')} />
          <Input label="Account number" inputMode="numeric" {...b('bank_account')} />
        </div>
      </Tile>
      <Tile title="Invoicing" icon={ReceiptText} className="lg:col-span-2">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Input label="Invoice prefix" {...b('invoice_prefix')} />
          <Input label="Payment terms (days)" type="number" min="0" {...b('payment_terms_days')} />
          <Select label="Invoice cycle" className="col-span-2 sm:col-span-1" options={['weekly', 'monthly']} {...b('invoice_cycle')} />
        </div>
      </Tile>
    </div>
  );
}

function RuleFields({ b }) {
  return (
    <>
      <Tile title="Pay and timesheets" icon={Clock} className="mb-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Select label="Pay period" options={['weekly', 'fortnightly', 'monthly']} {...b('pay_period')} />
          <Input label="Round to (minutes)" type="number" min="0" hint="0 for exact minutes" {...b('rounding_minutes')} />
          <Input label="Late grace (minutes)" type="number" min="0" {...b('grace_minutes')} />
          <Input label="Auto sign-off (days)" type="number" min="0" hint="Venue sign-off window" {...b('auto_signoff_days')} />
          <Input label="GPS tolerance (metres)" type="number" min="0" className="col-span-2" hint="Extra distance allowed outside a venue's radius" {...b('gps_tolerance_m')} />
        </div>
      </Tile>
      <Tile title="Officer pay uplifts" icon={Percent}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Select label="Night starts" options={hourOpts} {...b('night_start')} />
          <Select label="Night ends" options={hourOpts} {...b('night_end')} />
          <Input label="Night (%)" type="number" step="0.01" min="0" {...b('pay_night_uplift')} />
          <Input label="Weekend (%)" type="number" step="0.01" min="0" {...b('pay_weekend_uplift')} />
          <Input label="Bank holiday (%)" type="number" step="0.01" min="0" {...b('pay_bh_uplift')} />
        </div>
        <p className="mt-3 text-caption text-faint">Added on top of the officer's base rate for hours in each band. Client uplifts are set per venue rate.</p>
      </Tile>
    </>
  );
}

/* ---------------- Users ---------------- */

const USER_ROLES = ['company', 'security', 'venue'];

function UsersTab({ openId }) {
  const { user: me } = useAuth();
  const [role, setRole] = useState('all');
  const q = useApi('users.list');
  const venues = useApi('venues.list');
  const [inviting, setInviting] = useState(false);
  const [editing, setEditing] = useState(null);
  // A link from a staff profile opens that person's access straight away
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || !openId || !q.data) return;
    opened.current = true;
    const u = q.data.find((x) => x.id === openId);
    if (u) { if (u.role === 'officer') setRole('officer'); setEditing(u); }
  }, [openId, q.data]);
  return (
    <Load q={q}>
      {(all) => {
        const rows = all.filter((u) => (role === 'all' ? u.role !== 'officer' : u.role === role));
        return (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <Segmented value={role} onChange={setRole} options={[{ value: 'all', label: 'Managers' }, ...USER_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r].replace(' manager', '') })), { value: 'officer', label: 'Officers' }]} />
              <Button icon={UserPlus} onClick={() => setInviting(true)}>Invite manager or venue user</Button>
            </div>
            {role === 'officer' && (
              <p className="mb-3 text-footnote text-muted">Officer logins come from their staff record. Add officers and give them app access in <Link to="/company/staff" className="font-semibold text-blue">People → Staff</Link>.</p>
            )}
            {rows.length ? (
              <List>
                {rows.map((u) => (
                  <Row key={u.id} onClick={() => setEditing(u)} chevron
                    left={<Avatar name={u.name} src={u.photo_url} size={40} />}
                    title={<span>{u.name}{u.id === me.id && <span className="ml-1.5 text-caption font-semibold text-faint">You</span>}</span>}
                    subtitle={[u.officer_id ? 'Staff record linked' : null, u.email, u.venues?.length ? u.venues.join(', ') : null, u.last_login ? `Seen ${relative(u.last_login)}` : null].filter(Boolean).join(' · ')}
                    right={<div className="flex flex-col items-end gap-1"><Pill tone="grey">{ROLE_LABEL[u.role]}</Pill>{u.status !== 'active' && <Pill status={u.status === 'invited' ? 'pending' : 'cancelled'}>{u.status === 'invited' ? 'Invited' : 'Disabled'}</Pill>}</div>} />
                ))}
              </List>
            ) : <Empty title="No users" />}
            {inviting && <InviteSheet venues={venues.data || []} onClose={() => setInviting(false)} onDone={q.reload} />}
            {editing && <UserSheet u={editing} me={me} venues={venues.data || []} onClose={() => setEditing(null)} onDone={q.reload} />}
          </>
        );
      }}
    </Load>
  );
}

function InviteSheet({ venues, onClose, onDone }) {
  const { v, bind, set } = useForm({ name: '', email: '', phone: '', role: 'security', venue_ids: [], can_see_pay: false });
  const [run, busy] = useAction();
  const [link, setLink] = useState(null);
  const send = async () => {
    const r = await run(() => api('users.invite', { ...v, venue_ids: v.role === 'company' ? undefined : v.venue_ids, can_see_pay: v.role === 'security' && v.can_see_pay }), 'Invite sent');
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
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Email" type="email" {...bind('email')} />
            <Input label="Phone" type="tel" {...bind('phone')} />
          </div>
          {v.role !== 'company' && <Chips label={v.role === 'venue' ? 'Venues they manage' : 'Venues they look after'} options={venues.map((x) => ({ value: x.id, label: x.name }))} value={v.venue_ids} onChange={(x) => set('venue_ids', x)} />}
          {v.role === 'security' && <div className="rounded-2xl bg-bg px-4 py-2"><Toggle checked={v.can_see_pay} onChange={(x) => set('can_see_pay', x)} label="Can see pay" hint="Officer rates and pay statements" /></div>}
          <p className="text-caption text-faint">Officers are added from People → Staff, with App access turned on.</p>
        </div>
      )}
    </Sheet>
  );
}
const ROLE_HINT = {
  company: 'Full access to everything, including money and settings.',
  security: 'Runs the rota, live view, timesheets and incidents for their venues.',
  venue: 'Client contact. Requests cover, signs off timesheets and sees invoices for their venues.',
};

function UserSheet({ u, me, venues, onClose, onDone }) {
  const { v, bind, set } = useForm({ name: u.name, email: u.email, phone: u.phone || '', can_see_pay: !!u.can_see_pay, venue_ids: u.venue_ids || [] });
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const [link, setLink] = useState(null);
  const save = async () => {
    await run(() => api('users.update', { id: u.id, ...v, email: u.officer_id || v.email === u.email ? undefined : v.email, venue_ids: ['security', 'venue'].includes(u.role) ? v.venue_ids : undefined }), 'User updated');
    onDone();
    onClose();
  };
  const setStatus = async (status) => {
    if (status === 'disabled' && !(await confirm({ title: `Deactivate ${u.name}?`, body: 'They will be signed out and unable to log in.', confirm: 'Deactivate', danger: true }))) return;
    await run(() => api('users.update', { id: u.id, status }), status === 'disabled' ? 'User deactivated' : 'User reactivated');
    onDone();
    onClose();
  };
  const reset = async () => setLink((await run(() => api('users.resetLink', { id: u.id }), 'Link created')).link);
  const resend = async () => setLink((await run(() => api('users.resendInvite', { id: u.id }), 'Invite sent again')).invite_link);
  return (
    <Sheet open onClose={onClose} title={u.name}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2"><Pill tone="grey">{ROLE_LABEL[u.role]}</Pill><Pill status={u.status === 'active' ? 'active' : u.status === 'invited' ? 'pending' : 'cancelled'}>{u.status === 'invited' ? 'Invited' : u.status === 'active' ? 'Active' : 'Disabled'}</Pill><span className="text-footnote text-muted">{u.email}</span></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Name" {...bind('name')} />
          <Input label="Phone" type="tel" {...bind('phone')} />
        </div>
        {u.officer_id
          ? <p className="text-footnote text-muted">Their sign-in email follows their staff record. Change it on the staff profile.</p>
          : <Input label="Sign-in email" type="email" hint={v.email !== u.email ? 'They will sign in with the new email from now on' : undefined} {...bind('email')} />}
        {['security', 'venue'].includes(u.role) && <Chips label="Venues" options={venues.map((x) => ({ value: x.id, label: x.name }))} value={v.venue_ids} onChange={(x) => set('venue_ids', x)} />}
        {u.role === 'security' && <div className="rounded-2xl bg-bg px-4 py-2"><Toggle checked={v.can_see_pay} onChange={(x) => set('can_see_pay', x)} label="Can see pay" hint="Officer rates and pay statements" /></div>}
        {u.officer_id && <Link to={`/company/staff/${u.officer_id}`} className="inline-flex items-center gap-1.5 text-subhead font-semibold text-blue"><Users size={16} />Staff profile<ChevronRight size={16} /></Link>}
        {link ? <CopyLink link={link} label={u.status === 'invited' ? 'Invite link' : 'Password reset link'} hint="Valid for 48 hours. Share it directly." /> : u.status === 'invited' && u.invite_link && <CopyLink link={u.invite_link} />}
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          {u.status === 'invited' && <Button variant="soft" onClick={resend}>Resend invite</Button>}
          {u.status === 'active' && <Button variant="soft" icon={KeyRound} onClick={reset}>Password reset link</Button>}
          {u.status !== 'disabled' && u.id !== me.id && <Button variant="danger" onClick={() => setStatus('disabled')}>Deactivate</Button>}
          {u.status === 'disabled' && <Button variant="secondary" onClick={() => setStatus('active')}>Reactivate</Button>}
        </div>
      </div>
    </Sheet>
  );
}

/* ---------------- Roles & bank holidays ---------------- */

const ROLE_DOCS = DOC_KINDS.filter((d) => !['sia', 'contract', 'other'].includes(d.value));

function RoleSheet({ role, onClose, onSaved }) {
  const [run, busy] = useAction();
  const [v, setV] = useState({ requires_sia: role.requires_sia, accepted_licences: role.accepted_licences || [], required_docs: role.required_docs || [] });
  const save = () => run(() => api('roles.update', { code: role.code, ...v, accepted_licences: v.requires_sia ? v.accepted_licences : [] }), 'Role updated').then(onSaved).catch(() => {});
  return (
    <Sheet open onClose={onClose} title={role.name} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <div className="rounded-2xl bg-bg px-4 py-2"><Toggle checked={v.requires_sia} onChange={(x) => setV((s) => ({ ...s, requires_sia: x }))} label="SIA licence required" hint="Officers need a valid licence to work this role" /></div>
        {v.requires_sia && (
          <div>
            <Chips label="Licences that cover this role" options={SIA_TYPES} value={v.accepted_licences} onChange={(x) => setV((s) => ({ ...s, accepted_licences: x }))} />
            <p className="mt-1.5 text-caption text-muted">{v.accepted_licences.length ? 'Officers with another licence type are flagged when rostered on this role.' : 'None picked: any SIA licence is accepted.'}</p>
          </div>
        )}
        <Chips label="Other documents officers need" options={ROLE_DOCS} value={v.required_docs} onChange={(x) => setV((s) => ({ ...s, required_docs: x }))} />
      </div>
    </Sheet>
  );
}

function RulesTab() {
  const { user } = useAuth();
  const roles = useApi('roles.list');
  const [editing, setEditing] = useState(null);
  const bh = useApi('bankHolidays.list');
  const confirm = useConfirm();
  const [run, busy] = useAction();
  const { v, bind, setV } = useForm({ day: '', name: '' });
  const [showPast, setShowPast] = useState(false);
  const add = async () => {
    await run(() => api('bankHolidays.save', v), 'Bank holiday saved');
    setV({ day: '', name: '' });
    bh.reload();
  };
  const del = async (h) => {
    if (!(await confirm({ title: `Remove ${h.name}?`, body: 'Hours on this day will no longer get the bank holiday uplift.', confirm: 'Remove', danger: true }))) return;
    await run(() => api('bankHolidays.delete', { day: h.day }), 'Removed');
    bh.reload();
  };
  const today = isoDate();
  const settings = useApi('settings.get');
  return (
    <>
    <Section title="Pay, timesheets and uplifts" className="mt-0">
      <Load q={settings}>{(s) => <SettingsForm s={s} keys={RULE_KEYS} onSaved={(d) => settings.setData(d)}>{(b) => <RuleFields b={b} />}</SettingsForm>}</Load>
    </Section>
    <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
      <div className="min-w-0 lg:col-span-2">
        <Section title="Roles and requirements" className="mt-0">
          <Load q={roles}>
            {(rows) => (
              <List>
                {rows.map((r) => (
                  <Row key={r.code} title={r.name} chevron={user.role === 'company'} onClick={user.role === 'company' ? () => setEditing(r) : undefined}
                    subtitle={[r.accepted_licences?.length ? r.accepted_licences.join(' or ') : r.requires_sia ? 'Any SIA licence' : null, r.required_docs?.length ? `Needs ${r.required_docs.map(docKindLabel).join(', ').toLowerCase()}` : null].filter(Boolean).join(' · ') || r.code}
                    right={r.requires_sia ? <Pill tone="blue">SIA required</Pill> : <Pill tone="grey">No SIA</Pill>} />
                ))}
              </List>
            )}
          </Load>
          {user.role === 'company' && <p className="mt-2 px-1 text-caption text-muted">Tap a role to set which licences cover it and which documents officers need. The compliance check uses these.</p>}
        </Section>
        {editing && <RoleSheet role={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); roles.reload(); }} />}
      </div>
      <div className="min-w-0 lg:col-span-3">
        <Section title="Bank holidays" className="mt-0" action={<Pressable press className="text-footnote font-semibold text-blue" onClick={() => setShowPast((x) => !x)}>{showPast ? 'Hide past' : 'Show past'}</Pressable>}>
          <Tile className="mb-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <Input label="Date" type="date" className="sm:w-44" {...bind('day')} />
              <Input label="Name" className="flex-1" {...bind('name')} />
              <Button icon={Plus} busy={busy} disabled={!v.day || !v.name} onClick={add}>Add</Button>
            </div>
          </Tile>
          <Load q={bh}>
            {(rows) => {
              const list = rows.filter((h) => showPast || h.day >= today);
              return list.length ? (
                <List>
                  {list.map((h) => (
                    <Row key={h.day} left={<CalendarDays size={18} className="text-blue" />} title={h.name} subtitle={dayLabel(h.day) + ' ' + h.day.slice(0, 4)}
                      right={<IconButton icon={Trash2} label="Remove" className="text-red" onClick={() => del(h)} />} />
                  ))}
                </List>
              ) : <Empty icon={CalendarDays} title="No bank holidays" />;
            }}
          </Load>
        </Section>
      </div>
    </div>
    </>
  );
}

/* ---------------- Contract templates ---------------- */

function TemplatesTab() {
  const q = useApi('contracts.templates');
  const [editing, setEditing] = useState(null);
  return (
    <Load q={q}>
      {(rows) => (
        <>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-subhead text-muted">Templates for e-signature. Placeholders: {'{{company}}'}, {'{{officer}}'}, {'{{utr}}'}.</p>
            <Button icon={Plus} onClick={() => setEditing({})}>New template</Button>
          </div>
          {rows.length ? (
            <List>
              {rows.map((t) => (
                <Row key={t.id} onClick={() => setEditing(t)} chevron left={<FileSignature size={20} className="text-blue" />}
                  title={t.title} subtitle={t.body.slice(0, 120)} right={t.active ? <Pill tone="green">Active</Pill> : <Pill tone="grey">Archived</Pill>} />
              ))}
            </List>
          ) : <Empty icon={FileSignature} title="No templates" />}
          {editing && <TemplateSheet t={editing} onClose={() => setEditing(null)} onDone={q.reload} />}
        </>
      )}
    </Load>
  );
}

function TemplateSheet({ t, onClose, onDone }) {
  const { v, bind, set } = useForm({ title: t.title || '', body: t.body || '', active: t.active !== false });
  const [run, busy] = useAction();
  const save = async () => {
    await run(() => api('contracts.saveTemplate', { id: t.id, ...v }), 'Template saved');
    onDone();
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={t.id ? 'Edit template' : 'New template'} size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!v.title || !v.body} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <Input label="Title" {...bind('title')} />
        <Textarea label="Agreement text" rows={16} hint="Changes apply to contracts sent from now on. Signed contracts are not changed." {...bind('body')} />
        {t.id && <div className="rounded-2xl bg-bg px-4 py-2"><Toggle checked={v.active} onChange={(x) => set('active', x)} label="Active" hint="Archived templates can't be sent" /></div>}
      </div>
    </Sheet>
  );
}

/* ---------------- Notification defaults ---------------- */

// What everyone gets unless they change it under My account → Notifications
function NotificationsTab() {
  const q = useApi('settings.get');
  const [run] = useAction();
  const flip = (k) => async (on) => {
    const d = await run(() => api('settings.update', { notify_defaults: { [k]: on } }), 'Default saved').catch(() => null);
    if (d) q.setData(d);
  };
  return (
    <Load q={q}>
      {(s) => (
        <Tile title="Optional alerts — company defaults" icon={Bell} className="max-w-2xl">
          <div className="space-y-2">
            {NOTIFY_KINDS.map((k) => <Toggle key={k.key} checked={s.notify_defaults?.[k.key] !== false} onChange={flip(k.key)} label={k.label} hint={k.hint} />)}
          </div>
          <p className="mt-3 text-caption text-faint">Applies to managers and officers who haven't chosen for themselves. Anyone can change their own under My account. Shifts, cover, pay and safety alerts always come through.</p>
        </Tile>
      )}
    </Load>
  );
}

// "Request a private demo" submissions from the public landing page
function DemosTab() {
  const q = useApi('demo.list');
  return (
    <Load q={q}>
      {(rows) => (
        <Table rows={rows} empty="No demo requests yet" columns={[
          { key: 'created_at', label: 'Received', render: (r) => relative(r.created_at) },
          { key: 'name', label: 'Name', render: (r) => <span className="font-semibold">{r.name}</span> },
          { key: 'company', label: 'Company' },
          { key: 'email', label: 'Email', render: (r) => <a href={`mailto:${r.email}`} className="font-semibold text-blue">{r.email}</a> },
          { key: 'phone', label: 'Phone', render: (r) => (r.phone ? <a href={`tel:${r.phone}`} className="text-blue">{r.phone}</a> : '—') },
          { key: 'sites', label: 'Sites', render: (r) => r.sites || '—' },
          { key: 'message', label: 'Message', render: (r) => <span className="whitespace-pre-line text-muted">{r.message || '—'}</span> },
        ]} />
      )}
    </Load>
  );
}
