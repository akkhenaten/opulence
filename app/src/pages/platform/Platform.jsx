import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { Bug, CheckCircle2, Copy, Download, ExternalLink, Lightbulb, Mail, MessageCircleWarning, MessageSquare, Phone, Settings, Sparkles } from 'lucide-react';
import { api, downloadText } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { ROLE_LABEL } from '../../layouts/nav.js';
import { KIND, STATUS } from '../../ui/AppFeedback.jsx';
import {
  Button, Callout, Chip, cx, dateTime, Empty, KV, Lightbox, Load, Page, Pill, Pressable, relative, SearchInput, Segmented, Select, Sheet, SkeletonRows,
  Textarea, Toggle, ToolField, ToolMenu, useAction, useApi, useMedia, useToast,
} from '../../ui/index.jsx';

// Platform admin only (set by the platform, checked on the server too): the app Feedback inbox and its switches
export default function Platform() {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const tab = sp.get('tab') || 'feedback';
  const [f, setF] = useState({ status: 'open', kind: '', role: '', search: '' });
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const list = useApi('appFeedback.list', f, { skip: !user.platform || tab !== 'feedback' });
  const [run, busy] = useAction();
  const wide = useMedia('(min-width: 640px)');
  if (!user.platform) return <Navigate to={`/${user.role}`} replace />;
  const exportCsv = () => run(async () => {
    const { csv } = await api('appFeedback.export', f);
    downloadText(`app-feedback-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }).catch(() => {});

  // The tab switch, counters and inbox filters sit on one line, so the inbox starts high
  const s = list.data?.stats;
  const chip = (label, n, tone, icon, active, onClick) => (n > 0 || active) && <Chip label={label} value={n ?? 0} tone={tone} icon={icon} compact="phone" active={active} onClick={onClick} />;
  const kindSwitch = <Segmented value={f.kind} onChange={set('kind')} options={[{ value: '', label: 'All' }, { value: 'problem', label: 'Problems', icon: Bug }, { value: 'idea', label: 'Ideas', icon: Lightbulb }]} />;
  const tools = <>
    <Segmented value={tab} onChange={(t) => setSp(t === 'feedback' ? {} : { tab: t }, { replace: true })}
      options={[{ value: 'feedback', label: 'Feedback', icon: MessageSquare }, { value: 'settings', label: 'Settings', icon: Settings }]} />
    {tab === 'feedback' && <>
      {chip('New', s?.new, 'blue', Sparkles, f.status === 'new', () => set('status')(f.status === 'new' ? 'open' : 'new'))}
      {chip('Problems this week', s?.problems_week, 'red', Bug, f.kind === 'problem', () => set('kind')(f.kind === 'problem' ? '' : 'problem'))}
      {chip('Ideas this week', s?.ideas_week, 'amber', Lightbulb, f.kind === 'idea', () => set('kind')(f.kind === 'idea' ? '' : 'idea'))}
      {chip('Fixed this month', s?.fixed_month, 'green', CheckCircle2, f.status === 'fixed', () => set('status')(f.status === 'fixed' ? 'open' : 'fixed'))}
      <SearchInput className="w-full sm:w-56" value={f.search} onChange={(e) => set('search')(e.target.value)} placeholder="Search text, name or screen" />
      {wide && kindSwitch}
      <ToolMenu count={(f.status !== 'open') + !!f.role + (!wide && !!f.kind)} onClear={() => setF((x) => ({ ...x, status: 'open', role: '', ...(!wide && { kind: '' }) }))}>
        {!wide && <ToolField label="Kind">{kindSwitch}</ToolField>}
        <ToolField label="Status"><Select aria-label="Status" value={f.status} onChange={(e) => set('status')(e.target.value)} options={STATUS_FILTER} /></ToolField>
        <ToolField label="Who sent it"><Select aria-label="Who sent it" value={f.role} onChange={(e) => set('role')(e.target.value)} options={ROLE_FILTER} /></ToolField>
      </ToolMenu>
    </>}
  </>;

  return (
    <Page title="Platform" subtitle="Only you can see this — platform admin" wide tools={tools}
      actions={tab === 'feedback' && <Button variant="secondary" size="sm" icon={Download} iconOnly="phone" busy={busy} onClick={exportCsv}>Export CSV</Button>}>
      {tab === 'settings' ? <PlatformSettings /> : <Inbox list={list} />}
    </Page>
  );
}

const STATUS_FILTER = [
  { value: 'open', label: 'Open (new, looking, planned)' },
  { value: 'new', label: 'New' }, { value: 'looking', label: 'Looking at it' }, { value: 'planned', label: 'Planned' },
  { value: 'fixed', label: 'Fixed' }, { value: 'not_now', label: 'Not now' }, { value: '', label: 'All' },
];
const ROLE_FILTER = [{ value: '', label: 'Everyone' }, ...Object.entries(ROLE_LABEL).map(([value, label]) => ({ value, label }))];

function Inbox({ list }) {
  const [open, setOpen] = useState(null);
  return (
    <div className="space-y-4">
      {list.loading && !list.data ? <SkeletonRows n={5} /> : (
        <Load q={list}>
          {(d) => !d.items.length ? <Empty icon={MessageCircleWarning} title="Nothing here" body="New problems and ideas from everyone using the app land here." /> : (
            <div className="ui-panel divide-y divide-line overflow-hidden rounded-tile border border-hairline bg-surface shadow-tile">
              {d.items.map((it) => {
                const K = KIND[it.kind];
                return (
                  <Pressable key={it.id} onClick={() => setOpen(it.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-bg">
                    <span className={cx('mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full', K.tone)}><K.icon size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <span className={cx('block truncate text-body', it.status === 'new' ? 'font-bold' : 'font-semibold')}>{it.body.split('\n')[0]}</span>
                      <span className="block truncate text-footnote text-muted">
                        {it.sender_name} · {ROLE_LABEL[it.role] || it.role} · {it.page || 'no screen'} · {relative(it.created_at)}{it.photo_count ? ` · ${it.photo_count} photo${it.photo_count > 1 ? 's' : ''}` : ''}
                      </span>
                    </span>
                    <Pill tone={STATUS[it.status].tone}>{STATUS[it.status].label}</Pill>
                  </Pressable>
                );
              })}
            </div>
          )}
        </Load>
      )}
      <Item id={open} onClose={() => setOpen(null)} onChange={list.reload} />
    </div>
  );
}

function Item({ id, onClose, onChange }) {
  const q = useApi('appFeedback.get', { id }, { skip: !id });
  return (
    <Sheet open={!!id} onClose={onClose} title="Feedback">
      {id && <Load q={q}>{(f) => <ItemBody key={f.id} f={f} reload={() => { q.reload(); onChange(); }} />}</Load>}
    </Sheet>
  );
}

function ItemBody({ f, reload }) {
  const toast = useToast();
  const { user } = useAuth();
  const [reply, setReply] = useState('');
  const [byEmail, setByEmail] = useState(false);
  const [note, setNote] = useState(f.note || '');
  const [photo, setPhoto] = useState(null);
  const [run, busy] = useAction();
  const K = KIND[f.kind];
  const setStatus = (status) => run(() => api('appFeedback.update', { id: f.id, status }), `Marked ${STATUS[status].label}`).then(reload).catch(() => {});
  const saveNote = () => run(() => api('appFeedback.update', { id: f.id, note }), 'Note saved').then(reload).catch(() => {});
  const send = () => run(() => api('appFeedback.reply', { id: f.id, reply, email: byEmail }), 'Reply sent').then(() => { setReply(''); reload(); }).catch(() => {});
  const copy = async () => {
    try { await navigator.clipboard.writeText(f.task); toast('Copied — paste it into the board or a chat'); } catch { toast('Could not copy on this device', 'error'); }
  };
  // The screen they were on, opened in my own portal
  const screen = f.page ? f.page.replace(/^\/(company|security|venue|officer)/, `/${user.role}`) : null;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className={cx('grid h-8 w-8 place-items-center rounded-full', K.tone)}><K.icon size={16} /></span>
        <span className="flex-1 text-subhead font-semibold">{K.short} · {dateTime(f.created_at)}</span>
        <Pill tone={STATUS[f.status].tone}>{STATUS[f.status].label}</Pill>
      </div>
      <p className="whitespace-pre-wrap text-body">{f.body}</p>
      {f.photos.length > 0 && (
        <div className="flex gap-2">
          {f.photos.map((p, i) => (
            <Pressable key={p.url} press onClick={() => setPhoto(i)} aria-label={`Open photo ${i + 1}`} className="rounded-xl">
              <img src={p.url} alt="" className="h-20 w-20 rounded-xl object-cover ring-1 ring-hairline" />
            </Pressable>
          ))}
        </div>
      )}
      <Lightbox photos={f.photos} index={photo} onClose={() => setPhoto(null)} />
      <KV items={[
        ['From', `${f.sender_name} · ${ROLE_LABEL[f.role] || f.role}`],
        ['Email', f.sender_email ? <a href={`mailto:${f.sender_email}`} className="inline-flex items-center gap-1 text-blue"><Mail size={14} />{f.sender_email}</a> : '—'],
        f.sender?.phone && ['Phone', <a href={`tel:${f.sender.phone}`} className="inline-flex items-center gap-1 text-blue"><Phone size={14} />{f.sender.phone}</a>],
        ['Screen', screen ? <a href={`/app${screen}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-blue">{f.page}<ExternalLink size={14} /></a> : '—'],
        ['Device', f.device || '—'],
        ['Version', f.app_version || '—'],
      ].filter(Boolean)} />
      <div>
        <div className="mb-1.5 text-footnote font-semibold text-muted">Status</div>
        <Segmented full value={f.status} onChange={setStatus}
          options={['looking', 'planned', 'fixed', 'not_now'].map((v) => ({ value: v, label: STATUS[v].label }))} />
        {f.status === 'new' && <div className="mt-1 text-caption text-muted">New — not looked at yet.</div>}
      </div>
      {f.reply && (
        <Callout tone="info" title={`Your reply · ${relative(f.replied_at)}`}><span className="whitespace-pre-wrap">{f.reply}</span></Callout>
      )}
      <div className="space-y-2">
        <Textarea label={f.reply ? 'Reply again' : 'Reply to the sender'} value={reply} onChange={(e) => setReply(e.target.value.slice(0, 2000))} autoGrow minRows={2}
          hint="They see it in their bell and in My feedback" />
        <Toggle checked={byEmail} onChange={setByEmail} label="Email it to them too" />
        <div className="flex justify-end"><Button busy={busy} disabled={!reply.trim() || !f.user_id} onClick={send}>Send reply</Button></div>
      </div>
      <div className="space-y-2">
        <Textarea label="Private note" value={note} onChange={(e) => setNote(e.target.value)} autoGrow minRows={2} hint="Only you see this, e.g. “fixed in the next release”" />
        <div className="flex justify-between gap-2">
          <Button variant="secondary" icon={Copy} onClick={copy}>Copy as task</Button>
          <Button variant="secondary" busy={busy} disabled={note === (f.note || '')} onClick={saveNote}>Save note</Button>
        </div>
      </div>
    </div>
  );
}

function PlatformSettings() {
  const q = useApi('appFeedback.settings', {});
  const [run] = useAction();
  const save = (patch) => run(async () => {
    q.setData(await api('appFeedback.setSettings', patch));
    window.dispatchEvent(new Event('orb:feedback-status'));
  }, 'Saved').catch(() => {});
  return (
    <Load q={q}>
      {(s) => (
        <div className="max-w-xl space-y-4">
          <div className="ui-panel space-y-3 rounded-tile border border-hairline bg-surface p-4 shadow-tile">
            <Toggle checked={s.feedback_on} onChange={(v) => save({ feedback_on: v })} label="Feedback button"
              hint="Shows Send feedback to everyone in the top bar, My account and Me. Turn it off once the app has settled; what was sent stays here." />
            <Toggle checked={s.feedback_email} onChange={(v) => save({ feedback_email: v })} label="Email me each new item" hint="Sent to the platform admin's address" />
          </div>
          <Callout tone="info" title="Who is platform admin">
            Set by the platform, not in the app. Nobody else can see this area, give an account the platform email, or take that account over.
          </Callout>
        </div>
      )}
    </Load>
  );
}
