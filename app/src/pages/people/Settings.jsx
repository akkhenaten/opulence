import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  BadgeCheck, Bell, Building2, Camera, FileSignature, ImageUp, Inbox, Library, ListChecks, Mail, MonitorSmartphone, Nfc, Palette, CalendarDays, ChevronRight, Clock, KeyRound, Landmark, LayoutGrid, Newspaper, Percent, Plus,
  PoundSterling, ReceiptText, Scale, ShieldCheck, Smartphone, Sparkles, Trash2, UserPlus, Users,
} from 'lucide-react';
import { api, upload } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  ActionBar, Avatar, Button, Callout, cx, dateShort, dayLabel, Empty, IconButton, Input, isoDate, List, Load, LoadFail, Page, Pill, Pressable, relative, Row, SearchInput, Section, Segmented, Select, Sheet, Table, Tabs, Textarea, Tile, Toggle, useAction, useApi, useConfirm, useForm, useMedia, useToast, useUrlState,
} from '../../ui/index.jsx';
import { Chips, CopyLink, DOC_KINDS, docKindLabel, SIA_TYPES } from './_parts.jsx';
import { ROLE_LABEL } from '../../layouts/nav.js';
import { NOTIFY_KINDS, NotificationsSheet } from '../officer/_notify.jsx';
import { resetEverydaySettings } from '../everyday/_parts.jsx';
import { loadStyleFonts, previewStyle, restoreStyle, styleVars } from '../../ui/style.js';
import { TemplatesTab } from './_esign.jsx';
import LibraryTab from './contracts/Library.jsx';
import { EmailTab } from '../email/_settings.jsx';
import { InstallTile } from '../../ui/pwa.jsx';
import { OpsSettings } from '../manager/OpsAI.jsx';
import { AccessFields, InviteSheet, inviteStatus, USER_ROLES } from './_access.jsx';
import { actionLabel, changeLine } from './_auditText.js';

const TABS = [
  { value: 'company', label: 'Company', icon: Building2 }, { value: 'users', label: 'Users & access', icon: KeyRound }, { value: 'rules', label: 'Workforce rules', icon: Scale },
  { value: 'templates', label: 'Templates & contracts', icon: FileSignature }, { value: 'notifications', label: 'Notifications', icon: Bell }, { value: 'email', label: 'Email', icon: Mail },
  { value: 'orb', label: 'Orb', icon: Sparkles },
  { value: 'demos', label: 'Demo requests', icon: Inbox },
];
// Older links used these tab names; the library is now a part of a shared tab
const OLD_TAB = { calendar: 'rules', contracts: 'templates', account: 'company', library: 'templates' };
const OLD_PART = { library: 'library' };
const PARTS = {
  templates: [{ value: 'esign', label: 'Templates', icon: FileSignature }, { value: 'library', label: 'Contract library', icon: Library }],
};

// Forms with unsaved edits mark themselves here, so switching tab asks first
const DirtyCtx = createContext(null);
function useMarkDirty(on) {
  const mark = useContext(DirtyCtx);
  const id = useId();
  useEffect(() => { mark?.(id, on); return () => mark?.(id, false); }, [mark, id, on]);
}

export default function Settings() {
  const [sp, setSp] = useSearchParams();
  const confirm = useConfirm();
  // Email had been a part of Notifications (?tab=notifications&part=email): it is its own tab now
  const raw = sp.get('tab') === 'notifications' && sp.get('part') === 'email' ? 'email' : sp.get('tab') || 'company';
  const tab = OLD_TAB[raw] || (TABS.some((t) => t.value === raw) ? raw : 'company');
  const part = sp.get('part') || OLD_PART[raw] || PARTS[tab]?.[0].value;
  const dirty = useRef(new Set());
  const mark = useCallback((id, on) => { if (on) dirty.current.add(id); else dirty.current.delete(id); }, []);
  const go = async (next) => {
    if (dirty.current.size && !(await confirm({ title: 'Discard changes?', body: 'You have unsaved changes on this tab.', confirm: 'Discard', cancel: 'Keep editing', danger: true }))) return;
    setSp(next, { replace: true });
  };
  return (
    <Page title="Settings" subtitle="Company details, access, workforce rules, templates and Orb">
      <DirtyCtx.Provider value={mark}>
        {/* A tab's parts sit beside the tabs when there is room, so the form starts high */}
        <div className="sm:flex sm:flex-wrap sm:items-start sm:gap-x-3">
          <Tabs tabs={TABS} value={tab} onChange={(t) => t !== tab && go(t === 'company' ? {} : { tab: t })} />
          {PARTS[tab] && <Segmented className="mb-4" value={part} options={PARTS[tab]} onChange={(x) => x !== part && go({ tab, part: x })} />}
        </div>
        {tab === 'company' && <CompanyTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'rules' && <RulesTab />}
        {tab === 'templates' && (part === 'library' ? <LibraryTab /> : <TemplatesTab />)}
        {tab === 'notifications' && <NotificationsTab />}
        {tab === 'email' && <EmailTab />}
        {tab === 'orb' && <OpsSettings />}
        {tab === 'demos' && <DemosTab />}
      </DirtyCtx.Provider>
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
  return (
    <Load q={q}>
      {(s) => (
        <>
          <SetupCard s={s} />
          <InstallTile className="mb-4" />
          <BrandingTile s={s} onSaved={(d) => q.setData(d)} />
          <AppStyleTile s={s} onSaved={(d) => q.setData(d)} />
          <p className="mb-2 px-1 text-footnote font-semibold uppercase tracking-wide text-muted">Changes save straight away</p>
          <ModulesTile s={s} onSaved={(d) => q.setData(d)} />
          {s.modules?.everyday !== false && <EverydayTile s={s} onSaved={(d) => q.setData(d)} />}
          <SettingsForm s={s} keys={COMPANY_KEYS} onSaved={(d) => q.setData(d)}>{(b) => <CompanyFields b={b} />}</SettingsForm>
        </>
      )}
    </Load>
  );
}

// What the app needs and is still missing; reads the same settings the screens use and blocks nothing
const jumpTo = (id) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
const listOf = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
const FIELD_WORD = { name: 'name', email: 'email', phone: 'phone', address: 'address', bank: 'bank account and sort code', prefix: 'invoice prefix', terms: 'payment terms' };

function SetupCard({ s }) {
  const q = useApi('settings.setup', {});
  const [open, setOpen] = useState(false);
  // Saving a setting on this tab re-checks the list
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } q.reload(); }, [s]); // eslint-disable-line react-hooks/exhaustive-deps
  const d = q.data;
  if (!d) return q.error ? <p className="mb-4 px-1 text-footnote text-red">Couldn't check what's left to set up.</p> : null;
  if (d.complete) return <p className="mb-4 flex items-center gap-1.5 px-1 text-footnote font-semibold text-green"><BadgeCheck size={16} aria-hidden />Set-up complete</p>;
  const ITEM = {
    company: { title: 'Company details', todo: (i) => `Add the company ${listOf(i.missing.map((k) => FIELD_WORD[k]))}`, act: () => jumpTo('set-company') },
    invoice: { title: 'Invoice details', todo: (i) => `Add the ${listOf(i.missing.map((k) => FIELD_WORD[k]))}`, act: () => jumpTo(i.missing.includes('bank') ? 'set-bank' : 'set-invoicing') },
    rates: { title: 'Venue rates', todo: (i) => `Hours can't be approved without them: ${i.missing.map((v) => `${v.name} (${[v.charge && 'charge', v.pay_officers.length && 'pay'].filter(Boolean).join(' and ')})`).join(', ')}` },
    signatory: { title: 'Default contract signatory', todo: () => 'Choose who signs contracts for the company', to: '/company/settings?tab=templates&focus=signatory' },
    templates: { title: 'Contract template', todo: () => 'Add at least one contract template to send for signing', to: '/company/settings?tab=templates' },
    email: { title: 'Email connected', todo: () => 'Connect a Gmail or Outlook mailbox to send and read email in the app', to: '/company/settings?tab=email' },
    sia: { title: 'Automatic SIA checks', todo: () => 'Not set up: ask Orb support' },
  };
  const todo = d.items.filter((i) => !i.done);
  const done = d.items.filter((i) => i.done);
  return (
    <Tile title="Set-up" icon={ListChecks} className="mb-4" action={<span className="num text-footnote font-semibold text-muted">{d.done} of {d.total} done</span>}>
      <ul className="divide-y divide-line">
        {todo.map((i) => {
          const it = ITEM[i.key];
          return (
            <li key={i.key} className="py-2.5">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-body font-semibold">{it.title}</span>
                {i.optional && <Pill tone="grey">Optional</Pill>}
                {i.platform && <Pill tone="grey">Platform setting</Pill>}
              </div>
              <p className="mt-0.5 text-footnote text-muted">{it.todo(i)}</p>
              {i.key === 'rates' ? (
                <div className="mt-1 flex flex-wrap gap-x-3">
                  {i.missing.map((v) => (
                    <span key={v.id} className="contents">
                      {v.charge && <Button size="sm" variant="link" to={`/company/venues/${v.id}?tab=rates`}>{v.name} rates →</Button>}
                      {v.pay_officers.slice(0, 3).map((o) => <Button key={`${v.id}-${o.id}`} size="sm" variant="link" to={`/company/staff/${o.id}?tab=rates`}>{o.name} pay →</Button>)}
                      {v.pay_officers.length > 3 && <span className="self-center text-footnote text-faint">and {v.pay_officers.length - 3} more at {v.name}</span>}
                    </span>
                  ))}
                </div>
              ) : (it.to || it.act) && <Button size="sm" variant="link" className="mt-1" to={it.to} onClick={it.act}>{i.key === 'email' ? 'Set up email →' : 'Open the setting →'}</Button>}
            </li>
          );
        })}
      </ul>
      {done.length > 0 && (
        <div className="mt-2 border-t border-line pt-2">
          <Button size="sm" variant="link" aria-expanded={open} onClick={() => setOpen((x) => !x)}>{open ? 'Hide' : 'Show'} {done.length} done</Button>
          {open && <ul className="mt-1 space-y-1">{done.map((i) => <li key={i.key} className="flex items-center gap-1.5 text-footnote text-muted"><BadgeCheck size={14} className="text-green" aria-hidden />{ITEM[i.key].title}{i.key === 'sia' && ': On'}</li>)}</ul>}
        </div>
      )}
      <p className="mt-2 text-caption text-faint">Nothing here stops you using the app. Items clear by themselves once the setting is saved.</p>
    </Tile>
  );
}

const DEFAULT_COLOR = '#C9A45C';
const PRESETS = ['#C9A45C', '#0B0B0C', '#1B5E20', '#00796B', '#C62828', '#6A1B9A'];
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
  useMarkDirty(color.toLowerCase() !== current);
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
              <div className="grid h-20 w-44 shrink-0 place-items-center rounded-xl border border-line bg-paper p-2">
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
                  className={cx('relative h-9 w-9 rounded-full before:absolute before:-inset-1 ring-offset-2 ring-offset-surface', shown.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-ink' : 'ring-1 ring-line')}
                  style={{ background: c }} />
              ))}
              <Input aria-label="Colour hex code" className="w-32" value={color} onChange={(e) => setColor(e.target.value.trim())} error={color && !valid ? 'Like #C9A45C' : undefined} />
            </div>
            <div className="mt-3 flex gap-2">
              <Button size="sm" busy={colorBusy} disabled={!valid || color.toLowerCase() === current} onClick={saveColor}>Save colour</Button>
              {s.brand_color && <Button variant="secondary" size="sm" disabled={colorBusy} onClick={() => setColor(DEFAULT_COLOR)}>Back to default</Button>}
            </div>
          </div>
        </div>
        <div className="space-y-3" aria-label="Preview">
          <div className="text-footnote font-semibold text-muted">Preview</div>
          <div className="rounded-xl border border-line bg-paper p-4 text-ink shadow-sm">
            <div className="flex items-start justify-between gap-3 border-b border-line pb-3">
              <div className="min-w-0">{mark}</div>
              <div className="text-right"><div className="text-headline font-bold">Incident report</div><div className="text-caption text-muted">INC-0042 · v1</div></div>
            </div>
            <div className="mt-3 text-subhead font-bold" style={{ color: shown }}>Summary</div>
            <div className="mt-1 h-2 w-4/5 rounded bg-line" /><div className="mt-1.5 h-2 w-3/5 rounded bg-line" />
            <div className="mt-3 text-right text-caption text-faint">Generated with Orb Security</div>
          </div>
          <div className="rounded-xl border border-line bg-paper p-4 text-ink shadow-sm" style={{ borderTop: `4px solid ${shown}` }}>
            {mark}
            <div className="mt-2 text-subhead font-bold">New incident at Riverside Mall</div>
            <span className="mt-2 inline-block rounded-lg px-3 py-1.5 text-footnote font-semibold text-white" style={{ background: shown }}>Open {name.length <= 24 ? name : 'the app'}</span>
          </div>
        </div>
      </div>
    </Tile>
  );
}

const APP_STYLES = [
  { value: 'classic', label: 'Day', hint: 'Light, warm and easy to read in daylight.' },
  { value: 'control', label: 'Night', hint: 'Black and gold, compact, numbers in a fixed-width font. Built for night shifts and the ops desk.' },
  { value: 'soft', label: 'Soft', hint: 'Neumorphic: cards and buttons look moulded from one soft surface, fields are pressed in, buttons sink when tapped.' },
  { value: 'glass', label: 'Glass', hint: 'Frosted, see-through cards, menus and windows over a colourful blurred background.' },
  { value: 'flat', label: 'Flat', hint: 'Clean and simple: no shadows or gradients, bold solid colours and a plain sans-serif.' },
];

// A small shift card drawn in the given style, so each option always shows its own look
function StylePreview({ style, color }) {
  useEffect(() => loadStyleFonts(style), [style]);
  return (
    <div data-style={style} data-preview={style} style={styleVars(style, color)} className="pv" aria-hidden>
      <div className="pv-card">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-subhead font-bold">Riverside Mall</span>
          <span className="shrink-0 rounded-full bg-green-soft px-2 py-0.5 text-caption2 font-bold text-green">On shift</span>
        </div>
        <div className="num mt-1 text-footnote text-muted">18:00 – 02:00 · 8.0 h</div>
        <div className="mt-3 flex items-center gap-2">
          <span className="pv-btn">Clock out</span>
          <span className="rounded-full bg-amber-soft px-2 py-0.5 text-caption2 font-bold text-amber">2 alerts</span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="pv-field">Add a note</span>
          <span className="pv-toggle" />
        </div>
      </div>
    </div>
  );
}

// Company-wide look of the app for everyone: picking one previews it here, saving applies it for all users
function AppStyleTile({ s, onSaved }) {
  const { setBrand } = useAuth();
  const current = s.ui_style || 'classic';
  const [pick, setPick] = useState(current);
  const [run, busy] = useAction();
  useEffect(() => restoreStyle, []);
  useMarkDirty(pick !== current);
  const choose = (v) => { setPick(v); previewStyle(v); };
  const cancel = () => { setPick(current); restoreStyle(); };
  const save = async () => {
    const d = await run(() => api('settings.update', { ui_style: pick }), 'App style saved').catch(() => null);
    if (!d) return;
    onSaved(d);
    setBrand((b) => ({ ...b, style: d.ui_style }));
  };
  return (
    <Tile title="App style" icon={MonitorSmartphone} className="mb-4">
      <p className="mb-4 text-subhead text-muted">How the app looks for everyone in your company — managers, officers and venue staff. Printouts, PDFs and emails always stay in the classic light look.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" role="radiogroup" aria-label="App style">
        {APP_STYLES.map((o) => (
          <Pressable key={o.value} press role="radio" aria-checked={pick === o.value} onClick={() => choose(o.value)}
            className={cx('rounded-tile border p-2 text-left transition', pick === o.value ? 'border-blue ring-2 ring-blue' : 'border-line')}>
            <StylePreview style={o.value} color={s.brand_color} />
            <div className="mt-2 px-1 pb-1">
              <div className="text-subhead font-bold">{o.label}{o.value === current && <span className="ml-2 text-caption font-semibold text-muted">In use</span>}</div>
              <div className="text-caption text-muted">{o.hint}</div>
            </div>
          </Pressable>
        ))}
      </div>
      {pick !== current && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-footnote text-muted">Previewing on this screen only.</span>
          <Button size="sm" busy={busy} onClick={save}>Use for everyone</Button>
          <Button variant="secondary" size="sm" disabled={busy} onClick={cancel}>Cancel</Button>
        </div>
      )}
    </Tile>
  );
}

const MODULES = [
  { key: 'academy', label: 'Academy', hint: 'Training courses with quizzes and certificates' },
  { key: 'toolbox', label: 'Toolbox', hint: 'Quick guide cards officers can open on shift' },
  { key: 'everyday', label: 'Everyday', hint: 'Team feed with posts, photos and comments' },
  { key: 'analytics', label: 'Analytics', hint: 'Lateness, incidents, satisfaction and customer numbers by venue' },
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

const CELEBRATION_OPTS = [
  { key: 'birthday', label: 'Birthdays', hint: 'Only for people who switch it on in their own notification settings' },
  { key: 'anniversary', label: 'Work anniversaries', hint: 'Each year from the day someone started' },
  { key: 'welcome', label: 'Welcome new starters', hint: 'In their first two weeks — they can opt out' },
  { key: 'qualification', label: 'Academy qualifications', hint: 'When someone earns a certificate' },
];

/** Everyday: shout-outs, automatic celebration posts and the topics suggested to everyone */
function EverydayTile({ s, onSaved }) {
  const [run, busy] = useAction();
  const e = s.everyday || {};
  const [topics, setTopics] = useState((e.featured_topics || []).join(' '));
  const save = async (everyday, msg = 'Saved') => {
    const d = await run(() => api('settings.update', { everyday }), msg).catch(() => null);
    if (d) { onSaved(d); resetEverydaySettings(); }
    return d;
  };
  const list = topics.split(/[\s,]+/).map((t) => t.replace(/^#/, '').trim()).filter(Boolean);
  const changed = list.join(' ') !== (e.featured_topics || []).join(' ');
  useMarkDirty(changed);
  return (
    <Tile title="Everyday" icon={Newspaper} className="mb-4">
      <div className="space-y-2">
        <Toggle checked={e.shoutouts !== false} onChange={(on) => save({ shoutouts: on })} label="Shout-outs" hint="Staff can thank a colleague with a badge on their profile" />
        <div className="pt-2 text-footnote font-semibold uppercase tracking-wide text-muted">Automatic celebration posts</div>
        {CELEBRATION_OPTS.map((c) => (
          <Toggle key={c.key} checked={e.celebrations?.[c.key] !== false} onChange={(on) => save({ celebrations: { [c.key]: on } })} label={c.label} hint={c.hint} />
        ))}
        <div className="pt-2">
          <Input label="Featured topics" value={topics} onChange={(ev) => setTopics(ev.target.value)} placeholder="#wins #training #safety"
            hint="Up to 8, shown first above the feed" />
          {changed && <Button className="mt-2" size="sm" busy={busy} onClick={async () => { const d = await save({ featured_topics: list }, 'Topics saved'); if (d) setTopics((d.everyday?.featured_topics || []).map((t) => `#${t}`).join(' ')); }}>Save topics</Button>}
        </div>
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
  useMarkDirty(dirty);
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
      <Tile title="Company" icon={Building2} className="scroll-mt-20 lg:col-span-2" id="set-company">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Company name" {...b('company_name')} />
          <Input label="Company number" {...b('company_number')} />
          <Input label="Email" type="email" hint="Replies to app emails come here; the company name is the sender" {...b('company_email')} />
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
      <Tile title="Bank for client payments" icon={Landmark} className="scroll-mt-20" id="set-bank">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Bank" className="col-span-2" {...b('bank_name')} />
          <Input label="Sort code" inputMode="numeric" placeholder="00-00-00" {...b('bank_sort_code')} />
          <Input label="Account number" inputMode="numeric" {...b('bank_account')} />
        </div>
      </Tile>
      <Tile title="Invoicing" icon={ReceiptText} className="scroll-mt-20 lg:col-span-2" id="set-invoicing">
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

// Clock-in proof: the face check switch and the company's secure NFC tag keys
function ClockProofTile({ s, onSaved }) {
  const [run] = useAction();
  const confirm = useConfirm();
  const [nfc, setNfc] = useState(null);
  const [nfcRun, nfcBusy] = useAction();
  const flipFace = async (on) => {
    if (!on && !(await confirm({ title: 'Switch off the face check?', body: 'Officers still take selfies where a venue needs one, but they are no longer compared with profile photos.', confirm: 'Switch off', danger: true }))) return;
    const d = await run(() => api('settings.update', { face_match_enabled: on }), on ? 'Face check on' : 'Face check off').catch(() => null);
    if (d) onSaved(d);
  };
  const reveal = async () => {
    if (!(await confirm({ title: 'Show the NFC tag keys?', body: 'Anyone with these keys can program tags that clock officers in. Only share them with the person or supplier programming your tags. This is recorded in the audit log.', confirm: 'Show keys' }))) return;
    const d = await nfcRun(() => api('clock.nfcSetup')).catch(() => null);
    if (d) { setNfc(d); if (!s.nfc_ready) onSaved({ ...s, nfc_ready: true }); }
  };
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Tile title="Selfies and face check" icon={ShieldCheck}>
        <p className="mb-3 text-subhead text-muted">Officers always confirm clock-in with their registered phone, plus the venue's rule (set on each venue): location, venue code and selfie.</p>
        <div className="rounded-xl bg-bg px-4 py-2">
          <Toggle label="Compare selfies with profile photos" hint="AI flags a selfie that may not match for a manager to check. It never stops anyone clocking in. Officers can say no." checked={s.face_match_enabled !== false} onChange={flipFace} />
        </div>
        <p className="mt-3 text-caption text-faint">Selfies are deleted after 90 days, unless the clock-in is still waiting for a decision or the timesheet is disputed. Before switching the face check on, complete a data protection impact assessment.</p>
      </Tile>
      <Tile title="NFC tag setup" icon={Nfc}>
        <p className="text-subhead text-muted">Secure NFC tags (NXP NTAG 424 DNA) give a new one-time code on every tap, so a copied link or a photo of the tag won't work.</p>
        {!nfc ? (
          <>
            <Button className="mt-4" variant="soft" icon={KeyRound} busy={nfcBusy} onClick={reveal}>{s.nfc_ready ? 'Show tag keys' : 'Create tag keys'}</Button>
            <p className="mt-2 text-caption text-faint">{s.nfc_ready ? 'Keys are set up. Tags can be paired on each venue\'s Setup tab.' : 'Not set up yet.'}</p>
          </>
        ) : (
          <div className="mt-4 space-y-3">
            <KeyField label="Tag web address (SDM/SUN URL)" value={nfc.url_template} />
            <KeyField label="Meta read key (SDM meta read, AES-128)" value={nfc.meta_key} />
            <KeyField label="File read key (SDM file read, AES-128)" value={nfc.file_key} />
            <ol className="list-decimal space-y-1 pl-5 text-subhead text-muted">
              <li>Program each tag with NXP TagXplorer or TagWriter, or send these details to your tag supplier.</li>
              <li>Turn on Secure Dynamic Messaging with encrypted PICC data (UID + counter) and a CMAC, placed at {'{PICC}'} and {'{CMAC}'}.</li>
              <li>Stick the tag at the officer entrance, open the venue, choose "Pair a tag" and tap it with your phone.</li>
            </ol>
            <Button variant="ghost" onClick={() => setNfc(null)}>Hide keys</Button>
          </div>
        )}
      </Tile>
    </div>
  );
}

function KeyField({ label, value }) {
  const toast = useToast();
  const copy = () => navigator.clipboard.writeText(value).then(() => toast('Copied'), () => toast('Could not copy. Select it and copy it manually.', 'error'));
  return (
    <div>
      <div className="mb-1 text-footnote font-semibold text-muted">{label}</div>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 break-all rounded-xl bg-bg px-3 py-2 font-mono text-caption">{value}</code>
        <Button size="sm" variant="secondary" onClick={copy}>Copy</Button>
      </div>
    </div>
  );
}

/* ---------------- Users ---------------- */

const STATUS_OPTS = [{ value: 'all', label: 'Any status' }, { value: 'active', label: 'Active' }, { value: 'invited', label: 'Invited' }, { value: 'disabled', label: 'Deactivated' }];
const STATUS_WORD = { active: 'Active', invited: 'Invited', disabled: 'Deactivated' };
const statusPill = (u) => <Pill status={u.status === 'active' ? 'active' : u.status === 'invited' ? 'pending' : 'cancelled'}>{STATUS_WORD[u.status] || u.status}</Pill>;
const venuesCell = (u) => (u.role === 'company' ? 'All' : !u.venues?.length ? '—' : u.venues.length === 1 ? u.venues[0] : `${u.venues.length} venues`);
const payWord = (u) => (u.role === 'company' ? 'sees pay' : u.role === 'security' && u.can_see_pay ? 'sees pay' : u.role === 'officer' ? 'own pay only' : "can't see pay");
const seenWord = (u) => (u.status === 'invited' ? (u.invite_sent_at ? `Invited · sent ${dateShort(u.invite_sent_at)}` : 'Invited · not emailed yet')
  : u.last_login ? `Seen ${relative(u.last_login)}` : 'Never signed in');
// The whole of someone's access in one line: what they are, where, pay, last seen
const accessSummary = (u) => [
  u.role === 'company' ? 'Company manager · all venues' : u.role === 'officer' ? 'Officer · their own shifts' : `${ROLE_LABEL[u.role]} for ${u.venues?.length ? listOf(u.venues) : 'no venues yet'}`,
  payWord(u), seenWord(u).replace(/^Seen/, 'last seen').replace(/^Never/, 'never'),
].join(' · ');
const activeCompanyManagers = (all) => all.filter((x) => x.role === 'company' && x.status === 'active' && !x.platform);

function UsersTab() {
  const { user: me } = useAuth();
  const [url, setUrl] = useUrlState({ role: 'all', status: 'all', q: '', user: '' });
  const [, setSp] = useSearchParams();
  const nav = useNavigate();
  const wide = useMedia('(min-width: 1024px)');
  const q = useApi('users.list');
  const venues = useApi('venues.list');
  const clients = useApi('clients.list');
  const [inviting, setInviting] = useState(false);
  // Opening a person adds a step to history, so the phone's Back closes them; stepping through replaces it
  const pushed = useRef(false);
  const open = (u) => {
    if (url.user) return setUrl({ user: u.id });
    pushed.current = true;
    setSp((cur) => { const n = new URLSearchParams(cur); n.set('user', u.id); return n; });
  };
  const close = () => { if (pushed.current) { pushed.current = false; nav(-1); } else setUrl({ user: '' }); };
  useEffect(() => { if (!url.user) pushed.current = false; }, [url.user]);
  // A link to an officer's access (from a staff profile) shows the Officers list behind them
  const linked = q.data?.find((x) => x.id === url.user);
  useEffect(() => { if (linked?.role === 'officer' && url.role !== 'officer') setUrl({ role: 'officer' }); }, [linked?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const role = ['all', 'officer', ...USER_ROLES].includes(url.role) ? url.role : 'all';
  const status = STATUS_OPTS.some((o) => o.value === url.status) ? url.status : 'all';
  return (
    <Load q={q}>
      {(all) => {
        const s = url.q.trim().toLowerCase();
        const rows = all.filter((u) => (role === 'all' ? u.role !== 'officer' : u.role === role) && (status === 'all' || u.status === status)
          && (!s || [u.name, u.goes_by, u.email, u.client_name, ...(u.venues || [])].join(' ').toLowerCase().includes(s)));
        const editing = all.find((x) => x.id === url.user);
        const at = editing ? rows.findIndex((x) => x.id === editing.id) : -1;
        const step = (i) => (at >= 0 && rows[i] ? () => setUrl({ user: rows[i].id }) : undefined);
        const cms = activeCompanyManagers(all);
        const you = (u) => u.id === me.id && <span className="ml-1.5 text-caption font-semibold text-faint">You</span>;
        const columns = [
          { key: 'name', label: 'Name', render: (u) => (
            <div className="flex items-center gap-3"><Avatar name={u.name} src={[u.photo_thumb_url, u.photo_url]} size={32} />
              <div className="min-w-0"><div className="truncate font-semibold">{u.name}{you(u)}</div><div className="truncate text-footnote text-muted">{u.email}</div></div></div>
          ) },
          { key: 'role', label: 'Access', render: (u) => <div className="flex flex-wrap items-center gap-1.5">{ROLE_LABEL[u.role]}{u.platform && <Pill tone="amber">Platform admin</Pill>}</div> },
          { key: 'venues', label: 'Venues', render: (u) => <span title={u.venues?.join(', ')}>{venuesCell(u)}</span> },
          { key: 'shifts', label: 'Works shifts', render: (u) => (u.officer_id ? 'Yes' : '—') },
          { key: 'pay', label: 'Pay', render: (u) => (u.role === 'venue' ? '—' : payWord(u).replace(/^./, (c) => c.toUpperCase())) },
          { key: 'status', label: 'Status', render: statusPill },
          { key: 'seen', label: 'Last seen', render: (u) => <span className="text-footnote text-muted">{u.status === 'invited' ? (u.invite_sent_at ? `Sent ${dateShort(u.invite_sent_at)}` : 'Not emailed yet') : u.last_login ? relative(u.last_login) : 'Never'}</span> },
        ];
        return (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <Segmented value={role} onChange={(x) => setUrl({ role: x })} options={[{ value: 'all', label: 'Managers' }, ...USER_ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r].replace(' manager', '') })), { value: 'officer', label: 'Officers' }]} />
              <Button icon={UserPlus} onClick={() => setInviting(true)}>Invite manager or venue user</Button>
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <SearchInput className="min-w-0 flex-1 sm:max-w-sm" aria-label="Search people" placeholder="Search name, email or venue" value={url.q} onChange={(e) => setUrl({ q: e.target.value })} />
              <Select className="w-auto" aria-label="Status" value={status} onChange={(e) => setUrl({ status: e.target.value })} options={STATUS_OPTS} />
            </div>
            {role === 'officer' && (
              <p className="mb-3 text-footnote text-muted">Officer logins come from their staff record. Add officers and give them app access in <Link to="/company/staff" className="font-semibold text-blue">People → Staff</Link>.</p>
            )}
            {!rows.length ? <Empty title={s || status !== 'all' ? 'Nobody matches' : 'No users'} body={s || status !== 'all' ? 'Try another search or status.' : undefined} />
              : wide ? <Table columns={columns} rows={rows} onRow={open} selected={editing?.id} />
                : (
                  <List>
                    {rows.map((u) => (
                      <Row key={u.id} onClick={() => open(u)} chevron
                        left={<Avatar name={u.name} src={[u.photo_thumb_url, u.photo_url]} size={40} />}
                        title={<span>{u.name}{you(u)}</span>}
                        subtitle={[u.officer_id ? (u.role === 'officer' ? 'Staff record linked' : 'Also works shifts') : null, u.email, u.client_name ? `Client: ${u.client_name}` : null, u.venues?.length ? u.venues.join(', ') : null, seenWord(u)].filter(Boolean).join(' · ')}
                        right={<div className="flex flex-col items-end gap-1">{u.platform && <Pill tone="amber">Platform admin</Pill>}<Pill tone="grey">{ROLE_LABEL[u.role]}</Pill>{u.status !== 'active' && statusPill(u)}</div>} />
                    ))}
                  </List>
                )}
            {inviting && <InviteSheet onClose={() => setInviting(false)} onDone={() => { q.reload(); clients.reload(); }} />}
            {editing && <UserSheet key={editing.id} u={editing} me={me} all={all} venues={venues.data || []} clients={clients.data || []} onClientCreated={clients.reload}
              lastManager={cms.length === 1 && cms[0].id === editing.id} onClose={close} onDone={q.reload} onPrev={step(at - 1)} onNext={step(at + 1)} />}
          </>
        );
      }}
    </Load>
  );
}

const sameSet = (a = [], b = []) => a.length === b.length && a.every((x) => b.includes(x));

function UserSheet({ u, me, all = [], venues, clients, onClientCreated, lastManager, onClose, onDone, onPrev, onNext }) {
  const start = { name: u.name, goes_by: u.goes_by || '', email: u.email, phone: u.phone || '', can_see_pay: !!u.can_see_pay, venue_ids: u.venue_ids || [], client_id: u.client_id || '' };
  const { v, bind, set } = useForm(start);
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const [link, setLink] = useState(null);
  // Only the platform admin changes their own account
  const locked = u.platform && !me.platform;
  const dirty = Object.keys(start).some((k) => (k === 'venue_ids' ? !sameSet(v[k], start[k]) : v[k] !== start[k]));
  const save = async () => {
    await run(() => api('users.update', { id: u.id, ...v, email: u.officer_id || v.email === u.email ? undefined : v.email, ...(['security', 'venue'].includes(u.role) ? { venue_ids: v.venue_ids, client_id: v.client_id || null } : { venue_ids: undefined, client_id: undefined }) }), 'User updated');
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
  // The invite's last email: as loaded, then as it is after Resend invite
  const [sent, setSent] = useState({ invite_sent_at: u.invite_sent_at, invite_emailed: u.invite_emailed });
  const resend = async () => {
    const r = await run(() => api('users.resendInvite', { id: u.id }), (x) => (x.emailed === false ? "Email didn't send — share the link below" : 'Invite sent again'));
    setSent({ invite_sent_at: r.sent_at || new Date().toISOString(), invite_emailed: r.emailed !== false });
    setLink(r.invite_link);
  };
  const inviteHint = inviteStatus({ ...u, ...sent }).hint;
  // What ticking and unticking will do, before Save
  const nameOf = (id) => venues.find((x) => x.id === id)?.name;
  const gain = v.venue_ids.filter((id) => !start.venue_ids.includes(id)).map(nameOf).filter(Boolean);
  const lose = start.venue_ids.filter((id) => !v.venue_ids.includes(id)).map(nameOf).filter(Boolean);
  if (u.role === 'security' && v.can_see_pay !== start.can_see_pay) (v.can_see_pay ? gain : lose).push('pay');
  const changes = [gain.length && `Will gain: ${listOf(gain)}`, lose.length && `Will lose: ${listOf(lose)}`].filter(Boolean).join(' · ');
  return (
    <Sheet open side full onClose={onClose} title={u.name} dirty={dirty} onPrev={onPrev} onNext={onNext}
      footer={locked ? <Button variant="secondary" onClick={onClose}>Close</Button> : <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        {locked && <Callout tone="warning" title="Platform admin">Only they can change this account.</Callout>}
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">{u.platform && <Pill tone="amber">Platform admin</Pill>}<Pill tone="grey">{ROLE_LABEL[u.role]}</Pill>{statusPill(u)}<span className="text-footnote text-muted">{u.email}</span></div>
          <p className="text-subhead">{accessSummary(u)}</p>
          {u.role !== 'officer' && !locked && <p className="text-footnote text-muted">To change the access type, deactivate this login and invite them again with the new type.</p>}
        </div>
        <fieldset disabled={locked} className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Name" {...bind('name')} />
          <Input label="Phone" type="tel" {...bind('phone')} />
          <Input label="Goes by (optional)" placeholder="e.g. Goddey" maxLength={40} {...bind('goes_by')} />
        </div>
        {u.officer_id
          ? <p className="text-footnote text-muted">Their sign-in email follows their staff record. Change it on the staff profile.</p>
          : <Input label="Sign-in email" type="email" hint={v.email !== u.email ? 'They will sign in with the new email from now on' : undefined} {...bind('email')} />}
        {['security', 'venue'].includes(u.role) && <AccessFields role={u.role} v={v} set={set} venues={venues} clients={clients} onClientCreated={onClientCreated} />}
        {u.role === 'security' && <div className="rounded-2xl bg-bg px-4 py-2"><Toggle checked={v.can_see_pay} onChange={(x) => set('can_see_pay', x)} label="Can see pay" hint="Officer rates and pay statements" /></div>}
        {changes && <p className="rounded-xl bg-blue-soft px-3 py-2 text-footnote font-semibold text-blue" aria-live="polite">{changes}</p>}
        </fieldset>
        {['company', 'security'].includes(u.role) && u.status !== 'disabled' && !locked && <WorksShifts u={u} all={all} onDone={() => { onDone(); onClose(); }} />}
        {u.officer_id && <Link to={`/company/staff/${u.officer_id}`} className="inline-flex items-center gap-1.5 text-subhead font-semibold text-blue"><Users size={16} />Open staff profile<ChevronRight size={16} /></Link>}
        {u.status === 'invited'
          ? (link || u.invite_link) && <CopyLink link={link || u.invite_link} hint={inviteHint} />
          : link && <CopyLink link={link} label="Password reset link" hint="Valid for 48 hours. Share it directly." />}
        {(!locked || u.status === 'invited') && <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {u.status === 'invited' && <Button variant="soft" onClick={resend}>Resend invite</Button>}
          {u.status === 'active' && !locked && <Button variant="soft" icon={KeyRound} onClick={reset}>Password reset link</Button>}
          {u.status !== 'disabled' && u.id !== me.id && !locked && (lastManager
            ? <p className="text-footnote text-muted">There must be at least one active company manager.</p>
            : <Button variant="danger" onClick={() => setStatus('disabled')}>Deactivate</Button>)}
          {u.status === 'disabled' && !locked && <Button variant="secondary" onClick={() => setStatus('active')}>Reactivate</Button>}
        </div>}
        <AccessHistory id={u.id} />
      </div>
    </Sheet>
  );
}

// Who changed this login and how: invites, venues gained and lost, pay, deactivation
function AccessHistory({ id }) {
  const q = useApi('audit.list', { entity: 'user', entity_id: id, limit: 50 });
  const [more, setMore] = useState(false);
  const rows = q.data || [];
  if (!q.error && !rows.length) return null;
  const shown = more ? rows : rows.slice(0, 10);
  return (
    <div className="border-t border-line pt-4">
      <h3 className="mb-2 text-subhead font-semibold">Access history</h3>
      <LoadFail q={q} what="access history" />
      {shown.length > 0 && (
        <ol className="space-y-2.5">
          {shown.map((r) => (
            <li key={r.id} className="text-footnote">
              <div><span className="font-semibold">{actionLabel(r.action)}</span><span className="text-muted"> · {r.user_name || 'System'} · {relative(r.created_at)}</span></div>
              {changeLine(r) && <div className="text-muted">{changeLine(r)}</div>}
            </li>
          ))}
        </ol>
      )}
      {!more && rows.length > 10 && <Button variant="link" className="mt-2" onClick={() => setMore(true)}>Show more ({rows.length - 10})</Button>}
    </div>
  );
}

// A company or security manager who also works shifts: one login, with a staff record behind it
function WorksShifts({ u, all, onDone }) {
  const { user: me, refresh } = useAuth();
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const [picking, setPicking] = useState(false);
  const on = !!u.officer_id;
  // Officer logins that look like the same person (same name), from before one login could do both
  const norm = (n) => String(n || '').trim().toLowerCase();
  const twins = all.filter((x) => x.role === 'officer' && x.status !== 'disabled' && x.officer_id && norm(x.name) === norm(u.name));
  const done = async () => { if (u.id === me.id) await refresh(); onDone(); };
  const flip = async (x) => {
    if (x && twins.length) return setPicking(true);
    if (!x && !(await confirm({ title: `Stop ${u.name} working shifts?`, body: 'Their staff record, shifts, hours and pay history stay. It just has no login any more, and the "My shifts" side disappears for them.', confirm: 'Turn off', danger: true }))) return;
    await run(() => api('users.setWorksShifts', { id: u.id, on: x }), x ? 'They can now switch to My shifts' : 'Turned off').catch(() => null);
    done();
  };
  const merge = async (t) => {
    if (!(await confirm({ title: `Merge ${t.email} into ${u.email}?`, body: `${u.name} signs in with ${u.email} from now on and switches to "My shifts" for their own shifts, pay and training. The officer login ${t.email} is deactivated. Nothing in their history is lost.`, confirm: 'Merge' }))) return;
    await run(() => api('users.mergeOfficerLogin', { manager_id: u.id, officer_user_id: t.id }), 'Logins merged').catch(() => null);
    done();
  };
  const create = async () => { await run(() => api('users.setWorksShifts', { id: u.id, on: true }), 'They can now switch to My shifts').catch(() => null); done(); };
  return (
    <div className="rounded-2xl bg-bg px-4 py-2">
      <Toggle checked={on} disabled={busy} onChange={flip} label="Also works shifts"
        hint={on ? 'They switch between Manager and My shifts in the app. Someone else approves their own hours and pay.' : 'Give them a staff record on this login, so they can be rostered, clock in and get paid'} />
      {!on && twins.length > 0 && !picking && (
        <p className="pb-2 text-footnote text-muted">{twins.length === 1 ? `${twins[0].name} also has an officer login (${twins[0].email}).` : 'They may also have an officer login.'} <button type="button" className="font-semibold text-blue" onClick={() => setPicking(true)}>Merge it</button></p>
      )}
      {picking && (
        <div className="space-y-2 pb-3 pt-1">
          <p className="text-footnote text-muted">Keep their existing staff record and history by merging their officer login, or start a new staff record.</p>
          {twins.map((t) => <Button key={t.id} variant="soft" className="w-full" disabled={busy} onClick={() => merge(t)}>Merge {t.email}</Button>)}
          <Button variant="secondary" className="w-full" disabled={busy} onClick={create}>New staff record instead</Button>
        </div>
      )}
    </div>
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
    <Section title="Pay, timesheets and uplifts" icon={PoundSterling} className="mt-0">
      <Load q={settings}>{(s) => <SettingsForm s={s} keys={RULE_KEYS} onSaved={(d) => settings.setData(d)}>{(b) => <RuleFields b={b} />}</SettingsForm>}</Load>
    </Section>
    <Section title="Clock-in proof" icon={Camera}>
      <Load q={settings}>{(s) => <ClockProofTile s={s} onSaved={(d) => settings.setData(d)} />}</Load>
    </Section>
    <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-5">
      <div className="min-w-0 lg:col-span-2">
        <Section title="Roles and requirements" icon={BadgeCheck} className="mt-0">
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
        <Section title="Bank holidays" icon={CalendarDays} className="mt-0" action={<Pressable press className="text-footnote font-semibold text-blue" onClick={() => setShowPast((x) => !x)}>{showPast ? 'Hide past' : 'Show past'}</Pressable>}>
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

// The three tiers set in the API (lib/notify.mjs TIER)
const PHONE_TIERS = [
  { label: 'Urgent: phone, email and bell', text: 'No-shows, high-risk incidents, shifts cancelled or changed within 48 hours, documents expiring within a week, instructions during a shift.' },
  { label: 'Phone and bell', text: "Everything about a person's own shifts, timesheets, pay, documents, training and messages; anything waiting for a manager; important notices; Everyday." },
  { label: 'Bell only', text: 'A note to managers that someone signed a contract, policy or venue pack.' },
];

// What everyone gets unless they change it under My account → Notifications
function NotificationsTab() {
  const q = useApi('settings.get');
  const [mine, setMine] = useState(false);
  const [run] = useAction();
  const flip = (k) => async (on) => {
    const d = await run(() => api('settings.update', { notify_defaults: { [k]: on } }), 'Default saved').catch(() => null);
    if (d) q.setData(d);
  };
  return (
    <Load q={q}>
      {(s) => (
        <>
        <Tile title="Optional alerts — company defaults" icon={Bell} className="max-w-2xl">
          <div className="space-y-2">
            {NOTIFY_KINDS.map((k) => <Toggle key={k.key} checked={s.notify_defaults?.[k.key] !== false} onChange={flip(k.key)} label={k.label} hint={k.hint} />)}
          </div>
          <p className="mt-3 text-caption text-faint">Applies to managers and officers who haven't chosen for themselves. Shifts, cover, pay and safety alerts always come through.</p>
          <Button size="sm" variant="soft" icon={Bell} className="mt-3" onClick={() => setMine(true)}>Change my own notifications</Button>
          <p className="mt-1 text-caption text-faint">Anyone can change their own under My account.</p>
        </Tile>
        <Tile title="What reaches the phone" icon={Smartphone} className="mt-4 max-w-2xl">
          <dl className="space-y-3 text-subhead">
            {PHONE_TIERS.map((t) => (
              <div key={t.label}>
                <dt className="font-semibold">{t.label}</dt>
                <dd className="text-muted">{t.text}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-caption text-faint">Fixed for everyone, so the phone only buzzes when it matters. Everything is always under the bell.</p>
        </Tile>
        <NotificationsSheet open={mine} onClose={() => setMine(false)} />
        </>
      )}
    </Load>
  );
}

// "Request a private demo" submissions from the public landing page
const DEMO_STATUS = [{ value: 'new', label: 'New' }, { value: 'contacted', label: 'Contacted' }, { value: 'won', label: 'Won' }, { value: 'lost', label: 'Lost' }];

function DemosTab() {
  const q = useApi('demo.list');
  const [show, setShow] = useState('open');
  const [run] = useAction();
  const setStatus = (r, status) => run(() => api('demo.setStatus', { id: r.id, status }).then(q.reload)).catch(() => {});
  return (
    <Load q={q}>
      {(all) => {
        const open = all.filter((r) => ['new', 'contacted'].includes(r.status || 'new'));
        const rows = show === 'open' ? open : all;
        return (
          <>
            <Segmented className="mb-3" value={show} onChange={setShow} options={[{ value: 'open', label: 'Open', count: open.length }, { value: 'all', label: 'All' }]} />
            <Table rows={rows} empty={show === 'open' ? 'Nothing open' : 'No demo requests yet'} columns={[
              { key: 'created_at', mobile: 'value', label: 'Received', render: (r) => relative(r.created_at) },
              { key: 'name', mobile: 'title', label: 'Name', render: (r) => <span className="font-semibold">{r.name}</span> },
              { key: 'company', mobile: 'sub', label: 'Company' },
              { key: 'email', mobile: 'sub', label: 'Email', render: (r) => <a href={`mailto:${r.email}`} className="font-semibold text-blue">{r.email}</a> },
              { key: 'phone', mobile: 'sub', label: 'Phone', render: (r) => (r.phone ? <a href={`tel:${r.phone}`} className="text-blue">{r.phone}</a> : '—') },
              { key: 'sites', mobile: false, label: 'Sites', render: (r) => r.sites || '—' },
              { key: 'message', mobile: 'note', label: 'Message', render: (r) => <span className="whitespace-pre-line text-muted">{r.message || '—'}</span> },
              { key: 'status', mobile: 'note', label: 'Status', render: (r) => (
                <Select aria-label={`Status for ${r.company}`} value={r.status || 'new'} onChange={(e) => setStatus(r, e.target.value)} options={DEMO_STATUS} />
              ) },
            ]} />
          </>
        );
      }}
    </Load>
  );
}
