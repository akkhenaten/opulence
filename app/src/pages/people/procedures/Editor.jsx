// One instructions or procedure document: write (or ask AI to change) the draft, see it as officers will, publish, and look back at versions
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Archive, ArrowUp, CheckCircle2, History, MessageSquare, RotateCcw, Send, Sparkles, Trash2, Undo2 } from 'lucide-react';
import { api } from '../../../api.js';
import { HOME, useAuth } from '../../../auth.jsx';
import {
  Button, Chips, cx, date, dateTime, Input, List, Load, Page, Pill, Row, Section, Segmented, Sheet, Textarea, Toggle, useAction, useApi, useConfirm, useToast,
} from '../../../ui/index.jsx';
import { docKind, PackPaper } from '../../shared/PackPaper.jsx';
import { DocStatus } from './Library.jsx';

const gapsIn = (body) => (String(body || '').match(/\[To confirm[^\]]*\]/gi) || []).length;

export default function ProcedureEditor() {
  const { id } = useParams();
  const q = useApi('procedures.get', { id });
  const { user } = useAuth();
  const [gen, setGen] = useState(0);
  const remount = async () => { await q.reload(); setGen((g) => g + 1); };
  return (
    <Page wide title={q.data?.title || 'Document'} subtitle={q.data && docKind(q.data)} back={{ to: `${HOME[user.role]}/people/procedures`, label: 'Site packs' }}
      actions={q.data && <DocStatus d={{ ...q.data, has_draft: q.data.draft_body != null, open_suggestions: 0 }} />}>
      <Load q={q} skeleton="page">{(p) => <Editor key={`${p.id}:${gen}`} p={p} reload={q.reload} remount={remount} />}</Load>
    </Page>
  );
}

function Editor({ p, reload, remount }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const confirm = useConfirm();
  const [run, busy] = useAction();
  const ro = !p.can_edit || p.status === 'archived';
  const [title, setTitle] = useState(p.title);
  const [body, setBody] = useState(p.body);
  const [state, setState] = useState('saved'); // dirty | saving | saved | error
  const [view, setView] = useState('write');
  const [blocks, setBlocks] = useState(null);
  const [undo, setUndo] = useState(null); // { body, summary } after an AI change
  const [publishing, setPublishing] = useState(false);
  const [version, setVersion] = useState(null);
  const saved = useRef({ title: p.title, body: p.body });
  const latest = useRef(saved.current);
  latest.current = { title, body };

  const save = useCallback(async () => {
    const cur = latest.current;
    if (cur.title === saved.current.title && cur.body === saved.current.body) { setState('saved'); return true; }
    setState('saving');
    try {
      await api('procedures.save', { id: p.id, title: cur.title.trim() || saved.current.title, body: cur.body });
      saved.current = cur;
      setState(latest.current === cur ? 'saved' : 'dirty');
      reload();
      return true;
    } catch (e) { setState('error'); toast(e.message, 'error'); return false; }
  }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save a moment after typing stops; preview sooner
  useEffect(() => {
    if (ro || (title === saved.current.title && body === saved.current.body)) return undefined;
    setState('dirty');
    const t = setTimeout(save, 1200);
    return () => clearTimeout(t);
  }, [title, body, ro, save]);
  useEffect(() => {
    const t = setTimeout(() => api('procedures.preview', { body }).then((r) => setBlocks(r.blocks)).catch(() => {}), blocks ? 450 : 0);
    return () => clearTimeout(t);
  }, [body]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const warn = (e) => { if (latest.current.body !== saved.current.body || latest.current.title !== saved.current.title) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  const applyAi = (next, summary, previous) => {
    saved.current = { title: latest.current.title, body: next };
    setBody(next); setUndo({ body: previous, summary }); setState('saved'); reload();
  };
  const undoAi = () => { setBody(undo.body); setUndo(null); };

  const gaps = gapsIn(body);
  const unpublished = p.draft_body != null || !p.current_version;
  const act = (fn, msg, after = reload) => run(fn, msg).then(after).catch(() => {});
  const base = HOME[user.role];

  return (
    <div className="space-y-4">
      {p.ai_drafted && unpublished && (
        <p className="flex gap-2 rounded-2xl bg-blue-soft p-3 text-footnote text-ink"><Sparkles size={16} className="mt-0.5 shrink-0 text-blue" />
          Drafted by AI from what it was given and UK good practice. Check every detail against the site before publishing. It is not legal advice, and nothing reaches officers until you publish.</p>
      )}
      {ro && p.status !== 'archived' && <p className="rounded-2xl bg-bg p-3 text-footnote text-muted">Company-wide documents are changed by company managers. You can read it and its versions here.</p>}
      {p.status === 'archived' && <p className="rounded-2xl bg-bg p-3 text-footnote text-muted">Archived: it is in no venue pack. Signed versions are kept for the record.</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Segmented className="lg:hidden" value={view} onChange={setView} options={[{ value: 'write', label: 'Write' }, { value: 'preview', label: 'Preview' }]} />
        <span className="text-footnote text-muted">{ro ? '' : { dirty: 'Unsaved changes…', saving: 'Saving…', saved: unpublished ? 'Draft saved' : 'Up to date', error: 'Not saved' }[state]}</span>
        <span className="flex-1" />
        {gaps > 0 && <Pill tone="amber">{gaps} to confirm</Pill>}
        {!ro && <Button icon={Send} disabled={!unpublished || !body.trim() || state === 'saving'} onClick={async () => { if (await save()) setPublishing(true); }}>Publish</Button>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={cx('space-y-3', view !== 'write' && 'hidden lg:block')}>
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} disabled={ro} />
          <Textarea label="Wording" rows={22} value={body} onChange={(e) => setBody(e.target.value)} disabled={ro} className="[&_textarea]:font-mono [&_textarea]:text-footnote"
            hint="# Heading · - bullet point · **bold** · blank line between paragraphs. Never write alarm, safe or door codes here." />
          {!ro && <AiEdit id={p.id} onBefore={save} onDone={applyAi} />}
          {undo && (
            <div className="flex items-start gap-2 rounded-2xl bg-surface p-3 text-footnote shadow-tile">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green" />
              <span className="min-w-0 flex-1">{undo.summary || 'Changed as asked.'} Check the preview.</span>
              <Button size="sm" variant="ghost" icon={Undo2} onClick={undoAi}>Undo</Button>
            </div>
          )}
        </div>
        <div className={cx(view !== 'preview' && 'hidden lg:block')}>
          <div className="lg:sticky lg:top-[calc(72px+env(safe-area-inset-top))] lg:max-h-[calc(100vh-96px)] lg:overflow-y-auto">
            <PackPaper doc={{ ...p, title, blocks: blocks || [], version: unpublished ? null : p.current_version, published_at: unpublished ? null : p.published_at }} status={unpublished ? 'draft' : undefined} />
          </div>
        </div>
      </div>

      {p.scope === 'general'
        ? <Where p={p} ro={ro} reload={reload} />
        : <Section title="Where it is used"><List><Row title="This venue's pack only" subtitle="Order and the register are on the venue page" to={`${base}/venues/${p.venue_id}?tab=pack`} /></List></Section>}

      {p.suggestions.length > 0 && (
        <Section title="Suggested changes">
          <div className="space-y-2">{p.suggestions.map((s) => <Suggestion key={s.id} s={s} reload={reload} />)}</div>
        </Section>
      )}

      {p.versions.length > 0 && (
        <Section title="Published versions">
          <List>
            {p.versions.map((v) => (
              <Row key={v.version} onClick={() => setVersion(v.version)} left={<History size={18} className="text-muted" />}
                title={`Version ${v.version}${v.version === p.current_version ? ' · current' : ''}`}
                subtitle={[dateTime(v.published_at), v.published_by, v.note].filter(Boolean).join(' · ')}
                right={<Pill tone={v.requires_resign ? 'amber' : 'grey'}>{v.requires_resign ? 'Signed again' : 'Minor fix'}</Pill>} />
            ))}
          </List>
        </Section>
      )}

      {p.can_edit && (
        <div className="flex flex-wrap gap-2 pt-2">
          {p.current_version > 0 && p.draft_body != null && p.status !== 'archived' && (
            <Button variant="secondary" icon={RotateCcw} busy={busy} onClick={async () => {
              if (!(await confirm({ title: 'Discard unpublished changes?', body: `The wording goes back to version ${p.current_version}.`, confirm: 'Discard', danger: true }))) return;
              act(() => api('procedures.discardDraft', { id: p.id }), 'Changes discarded', remount);
            }}>Discard changes</Button>
          )}
          {p.status === 'archived'
            ? <Button variant="secondary" icon={RotateCcw} busy={busy} onClick={() => act(() => api('procedures.archive', { id: p.id, restore: true }), 'Restored')}>Restore</Button>
            : p.current_version > 0 && (
              <Button variant="secondary" icon={Archive} busy={busy} onClick={async () => {
                if (!(await confirm({ title: `Archive "${p.title}"?`, body: 'It leaves every venue pack straight away. Officers who signed it keep their signed copy, and the register keeps the record.', confirm: 'Archive', danger: true }))) return;
                act(() => api('procedures.archive', { id: p.id }), 'Archived');
              }}>Archive</Button>
            )}
          {!p.current_version && (
            <Button variant="ghost" className="text-red" icon={Trash2} busy={busy} onClick={async () => {
              if (!(await confirm({ title: `Delete "${p.title}"?`, body: 'It has never been published, so nothing is lost from the record.', confirm: 'Delete', danger: true }))) return;
              act(() => api('procedures.delete', { id: p.id }), 'Deleted', () => nav(`${base}/people/procedures`, { replace: true }));
            }}>Delete</Button>
          )}
        </div>
      )}

      {publishing && <PublishSheet p={p} gaps={gaps} onClose={() => setPublishing(false)} onDone={() => { setPublishing(false); remount(); }} />}
      {version && <VersionSheet p={p} version={version} onClose={() => setVersion(null)} />}
    </div>
  );
}

/** Ask the AI to change the draft; the editor keeps the previous wording for Undo */
function AiEdit({ id, onBefore, onDone }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const send = async () => {
    const m = text.trim();
    if (!m || busy) return;
    setBusy(true);
    try {
      if (!(await onBefore())) return;
      const r = await api('procedures.ai.edit', { id, instruction: m });
      setText('');
      onDone(r.body, r.summary, r.previous);
    } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <form className="rounded-2xl bg-surface p-2 shadow-tile" onSubmit={(e) => { e.preventDefault(); send(); }}>
      <div className="flex items-end gap-2">
        <Sparkles size={18} className="mb-2.5 ml-1.5 shrink-0 text-blue" />
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={2000} disabled={busy} aria-label="Ask AI to change the document"
          placeholder={busy ? 'Rewriting… this can take a minute' : 'Ask AI: e.g. "add a section on lost children" or "make it shorter"'}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
          className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-1 py-2 text-subhead outline-none" />
        <Button size="sm" icon={ArrowUp} busy={busy} disabled={!text.trim()} type="submit">Change</Button>
      </div>
    </form>
  );
}

/** Company-wide procedure: every venue (with switch-offs) or chosen venues */
function Where({ p, ro, reload }) {
  const venues = useApi('venues.list', {});
  const [run] = useAction();
  const chosen = p.venues.filter((v) => !v.excluded).map((v) => v.id);
  const off = p.venues.filter((v) => v.excluded);
  const save = (patch) => run(() => api('procedures.save', { id: p.id, ...patch }), 'Saved').then(reload).catch(() => {});
  return (
    <Section title="Where it is used">
      <div className="space-y-3 rounded-tile bg-surface p-4 shadow-tile">
        <Toggle checked={p.applies_all} onChange={(all) => !ro && save(all ? { applies_all: true } : { applies_all: false, venue_ids: chosen })}
          label="Every venue" hint={p.applies_all ? 'Including venues added later' : 'Only the venues chosen below'} />
        {p.applies_all
          ? off.length > 0 && <p className="text-footnote text-muted">Switched off at {off.map((v) => v.name).join(', ')}. Change this from the venue's page.</p>
          : <Chips options={(venues.data || []).filter((v) => v.active).map((v) => ({ value: v.id, label: v.name }))} value={chosen}
            onChange={(ids) => !ro && save({ applies_all: false, venue_ids: ids })} />}
        {p.status === 'published' && <p className="text-caption text-faint">Officers booked at a venue it is added to will need to read and sign it.</p>}
      </div>
    </Section>
  );
}

function PublishSheet({ p, gaps, onClose, onDone }) {
  const imp = useApi('procedures.impact', { id: p.id });
  const first = !p.current_version;
  const [mode, setMode] = useState('real');
  const [note, setNote] = useState('');
  const [anyway, setAnyway] = useState(false);
  const [run, busy] = useAction();
  const publish = () => run(() => api('procedures.publish', { id: p.id, requires_resign: first || mode === 'real', note, allow_gaps: anyway }),
    (r) => (r.notified ? `Published. ${r.notified} officer${r.notified === 1 ? '' : 's'} told to read and sign.` : 'Published')).then(onDone).catch(() => {});
  const i = imp.data;
  const reach = i && `${i.venues.length} venue${i.venues.length === 1 ? '' : 's'}${i.officers ? `, ${i.officers} booked officer${i.officers === 1 ? '' : 's'}` : ''}`;
  return (
    <Sheet open onClose={onClose} title={first ? `Publish "${p.title}"` : `Publish version ${p.current_version + 1}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={Send} busy={busy} disabled={gaps > 0 && !anyway} onClick={publish}>Publish</Button></>}>
      <div className="space-y-4">
        {first ? (
          <p className="text-subhead">Officers booked at these venues must read and sign it before they next clock in{reach ? ` (${reach})` : ''}.</p>
        ) : (
          <div className="space-y-2">
            {[
              { v: 'minor', t: 'Minor wording fix: no re-sign', b: 'Typos and clarifications. Officers who signed stay up to date and see the new wording next time they open the pack.' },
              { v: 'real', t: 'Real change: officers sign again', b: `Officers read this document and sign again before they next clock in${reach ? ` (${reach})` : ''}.` },
            ].map((o) => (
              <button key={o.v} type="button" onClick={() => setMode(o.v)} aria-pressed={mode === o.v}
                className={cx('pressable w-full rounded-2xl border p-3.5 text-left', mode === o.v ? 'border-blue bg-blue-soft/50 ring-2 ring-blue/15' : 'border-line bg-surface')}>
                <span className="block text-body font-semibold">{o.t}</span><span className="block text-footnote text-muted">{o.b}</span>
              </button>
            ))}
          </div>
        )}
        {i?.venues?.length > 0 && <p className="text-footnote text-muted">Goes into: {i.venues.map((v) => v.name).join(', ')}</p>}
        {i && !i.venues.length && <p className="rounded-2xl bg-amber-soft p-3 text-footnote">It is not in any venue pack yet, so no one will be asked to sign it.</p>}
        <Input label="What changed (optional)" placeholder="Shown in the version history" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        {gaps > 0 && (
          <div className="rounded-2xl bg-amber-soft p-3">
            <p className="text-footnote">{gaps} detail{gaps === 1 ? ' is' : 's are'} still marked [To confirm]. Officers will see the marks as they are.</p>
            <Toggle checked={anyway} onChange={setAnyway} label="Publish anyway" />
          </div>
        )}
      </div>
    </Sheet>
  );
}

function VersionSheet({ p, version, onClose }) {
  const q = useApi('procedures.version', { id: p.id, version });
  return (
    <Sheet open onClose={onClose} size="lg" title={`Version ${version}`}>
      <Load q={q} skeleton="rows">{(v) => (
        <>
          <p className="mb-3 text-footnote text-muted">As officers signed it. Published {dateTime(v.published_at)}{v.published_by_name ? ` by ${v.published_by_name}` : ''}{v.note ? ` · ${v.note}` : ''}.</p>
          <PackPaper doc={{ ...p, title: v.title, version: v.version, published_at: v.published_at, blocks: v.blocks }} />
        </>
      )}</Load>
    </Sheet>
  );
}

function Suggestion({ s, reload }) {
  const [reply, setReply] = useState(s.reply || '');
  const [run, busy] = useAction();
  const resolve = (status) => run(() => api('venuePacks.resolveSuggestion', { id: s.id, status, reply }), status === 'open' ? 'Reopened' : 'Done').then(reload).catch(() => {});
  return (
    <div className="rounded-tile bg-surface p-4 shadow-tile">
      <div className="flex items-start gap-2">
        <MessageSquare size={16} className="mt-0.5 shrink-0 text-blue" />
        <div className="min-w-0 flex-1 text-footnote text-muted">{s.author_name || 'Someone'}{s.author_role === 'venue' ? ' (client)' : ''}{s.venue_name ? ` · ${s.venue_name}` : ''} · {date(s.created_at)}{s.section ? ` · ${s.section}` : ''}</div>
        <Pill status={s.status} />
      </div>
      <p className="mt-2 whitespace-pre-wrap text-subhead">{s.body}</p>
      {s.status === 'open' ? (
        <div className="mt-3 space-y-2">
          <Textarea rows={2} placeholder="Reply (optional, the author sees it)" value={reply} onChange={(e) => setReply(e.target.value)} maxLength={2000} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" busy={busy} onClick={() => resolve('accepted')}>Accept</Button>
            <Button size="sm" variant="secondary" busy={busy} onClick={() => resolve('dismissed')}>Not taking forward</Button>
          </div>
          <p className="text-caption text-faint">Accepting does not change the wording. Edit the document above, then publish.</p>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-footnote text-muted">
          {s.reply && <span className="min-w-0 flex-1">Reply: {s.reply}</span>}
          <Button size="sm" variant="ghost" busy={busy} onClick={() => resolve('open')}>Reopen</Button>
        </div>
      )}
    </div>
  );
}
