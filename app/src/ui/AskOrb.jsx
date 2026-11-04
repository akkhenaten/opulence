// Orb: the managers' assistant. Knows the guide and live data, and acts through the app as the signed-in manager.
// Small changes run straight away (Done, with Undo); everything else waits on a Confirm card.
import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUpRight, Check as CheckIcon, ChevronLeft, CircleSlash, History, Plus, Sparkles, Trash2, Undo2, X } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Button, Check, cx, Empty, IconButton, Pill, Pressable, relative, useAction, useApi, useConfirm, useScrollLock } from './index.jsx';
import { Composer, Suggestions } from './Chat.jsx';
import OrbMark from './OrbMark.jsx';

const KEY = 'orb.askorb';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const newId = () => (crypto.randomUUID ? crypto.randomUUID()
  : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));

// What the person is looking at, so "this venue" or "this officer" makes sense
function pageContext(pathname) {
  const parts = pathname.split('/').filter(Boolean).slice(1);
  const id = parts.find((p) => UUID.test(p)) || '';
  const name = parts.filter((p) => !UUID.test(p)).join('/') || 'dashboard';
  return { name, id };
}

// Starter questions for the page the person is on
const SUGGEST = [
  [/^staff$/, (id) => (id
    ? ['Summarise this officer', "Add a note to this officer's HR file", 'Assign a course to this officer']
    : ['Who has documents expiring soon?', 'Who is still onboarding?', 'How do I add a new officer?'])],
  [/^(recruitment|hr|people\/compliance)/, () => ['Who is still onboarding?', 'Any licences or right to work expiring?', 'Time off waiting for a decision']],
  [/^people\/contracts/, () => ["Who hasn't signed yet?", 'How do I send a policy to everyone?', 'Remind everyone who has not signed']],
  [/^(rota|shifts|live|cover|exceptions)/, () => ['Unfilled shifts next week', 'Who can cover Saturday night?', 'Add draft shifts for next weekend']],
  [/^timesheets/, () => ['Timesheets waiting for approval', 'Which worked shifts have no timesheet?', 'How do timesheets get signed?']],
  [/^pay/, () => ["Do last week's pay run", 'Any open pay queries?', 'How does the pay review work?'], 'pay'],
  [/^invoices/, () => ['Which invoices are unpaid?', 'Create invoices for last month', 'How do credit notes work?'], 'company'],
  [/^incidents/, () => ['Incidents waiting for review', "Summarise this week's incidents", 'Check this report for gaps']],
  [/^team\/(academy|training)/, () => ['Who has refreshers due?', 'Assign the induction course to new starters', 'Who has not finished their training?']],
  [/^team\/toolbox/, () => ['Draft a toolbox card on spiking', 'Which toolbox cards are drafts?']],
  [/^(venues|clients)/, (id) => (id ? ['Unfilled shifts at this venue', 'Who is barred here?', 'Edit the site instructions'] : ['Add a new venue', 'Which venues have unfilled shifts?'])],
  [/^settings/, () => ['How do I change our logo?', 'How do I switch the app style?', 'Invite a security manager']],
  [/^(everyday|messages)/, () => ['Draft a team post thanking everyone for the weekend', 'Message the team at a venue']],
];
const HOME = {
  company: ['What needs my attention today?', 'Unfilled shifts next week', "Do last week's pay run", 'How do I send a policy to everyone?'],
  security: ['What needs my attention today?', 'Unfilled shifts next week', 'Lates and no-shows this month', 'Who can cover Saturday night?'],
};
function suggestionsFor(user, page) {
  const pay = user.role === 'company' || user.can_see_pay;
  const hit = SUGGEST.find(([re, , need]) => re.test(page.name) && (!need || (need === 'pay' ? pay : user.role === need)));
  return hit ? hit[1](page.id) : HOME[user.role] || HOME.security;
}

const Dots = () => <span className="inline-flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-faint" style={{ animationDelay: `${i * 0.15}s` }} />)}</span>;

export default function AskOrb({ open, onClose, onDot }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [view, setView] = useState('chat');
  const [convId, setConvId] = useState(() => sessionStorage.getItem(KEY) || null);
  const [msgs, setMsgs] = useState([]);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [turn, setTurn] = useState(null); // { id, progress }
  const [err, setErr] = useState(null);
  const end = useRef(null);
  const input = useRef(null);
  const openRef = useRef(open);
  openRef.current = open;
  const wide = useWide();
  const busy = !!turn;
  useScrollLock(open && !wide);

  useEffect(() => { if (open) onDot?.(false); }, [open, onDot]);
  useEffect(() => { if (convId) sessionStorage.setItem(KEY, convId); else sessionStorage.removeItem(KEY); }, [convId]);
  // Load the conversation when the panel opens or another chat is picked (not while a reply is on its way)
  useEffect(() => {
    if (!open || busy) return undefined;
    if (!convId) { setMsgs([]); setTitle(''); return undefined; }
    let live = true;
    api('assistant.get', { id: convId }).then((c) => { if (live) { setMsgs(c.messages.filter((m) => m.status !== 'working')); setTitle(c.title); } }).catch(() => { if (live) setConvId(null); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, convId]);
  useEffect(() => { if (open) end.current?.scrollIntoView({ block: 'end' }); }, [msgs, turn, open, view]);
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    setTimeout(() => input.current?.focus(), 200);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  // What Orb is doing, while it works
  useEffect(() => {
    if (!turn) return undefined;
    const t = setInterval(() => {
      api('assistant.progress', { turn_id: turn.id }).then((r) => {
        setTurn((cur) => (cur && cur.id === turn.id ? { ...cur, progress: r.progress || [] } : cur));
        // The request itself failed (e.g. the connection dropped) but Orb finished: show the reply
        if (turn.lost && r.message) finish(r);
      }).catch(() => {});
    }, 1500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn?.id, turn?.lost]);

  const finish = (r) => {
    setConvId(r.conversation_id); setTitle(r.title);
    setMsgs((m) => [...m.filter((x) => !String(x.id).startsWith('tmp-')), ...(r.user_message ? [r.user_message] : [{ id: `u-${r.message.id}`, role: 'user', text: m.find((x) => String(x.id).startsWith('tmp-'))?.text || '' }]), r.message]);
    setTurn(null);
    if (!openRef.current) onDot?.(true);
  };

  const send = async (t = text) => {
    const q = t.trim();
    if (!q || busy) return;
    const id = newId();
    setText(''); setErr(null); setTurn({ id, progress: [] });
    setMsgs((m) => [...m, { id: `tmp-${Date.now()}`, role: 'user', text: q }]);
    try {
      finish(await api('assistant.send', { conversation_id: convId || undefined, text: q, page: pageContext(pathname), turn_id: id }));
    } catch (e) {
      const p = await api('assistant.progress', { turn_id: id }).catch(() => null);
      if (p?.message) finish(p);
      else if (p?.status === 'working') setTurn((cur) => (cur && cur.id === id ? { ...cur, lost: true } : cur));
      else { setErr(e.message); setTurn(null); if (!openRef.current) onDot?.(true); }
    }
  };
  const replace = (m) => setMsgs((list) => list.map((x) => (x.id === m.id ? m : x)));
  const newChat = () => { if (busy) return; setConvId(null); setMsgs([]); setTitle(''); setView('chat'); setErr(null); };

  if (!open) return null;
  return (
    <section role="dialog" aria-label="Orb"
      className="fixed inset-0 z-50 flex flex-col bg-surface safe-t safe-b lg:inset-y-3 lg:left-auto lg:right-3 lg:w-[440px] lg:rounded-tile lg:border lg:border-line lg:shadow-xl anim-pop">
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-2">
        {view === 'history'
          ? <IconButton icon={ChevronLeft} label="Back to chat" onClick={() => setView('chat')} />
          : <IconButton icon={History} label="Previous chats" onClick={() => setView('history')} />}
        <div className="flex min-w-0 flex-1 items-center justify-center gap-2 px-1">
          <OrbMark className="h-7 w-7" />
          <div className="min-w-0 text-left">
            <div className="text-headline font-semibold leading-tight">Orb</div>
            <div className="truncate text-caption text-muted">{view === 'chat' && title ? title : 'Your assistant'}</div>
          </div>
        </div>
        <IconButton icon={Plus} label="New chat" onClick={newChat} disabled={busy} />
        <IconButton icon={X} label="Close" onClick={onClose} />
      </header>

      {view === 'history' ? <HistoryList current={convId} onPick={(id) => { if (!busy) { setConvId(id); setView('chat'); } }} onDeleted={(id) => { if (id === convId) newChat(); }} /> : (
        <>
          <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
            {!msgs.length && !busy && (
              <div className="py-6 text-center">
                <OrbMark className="mx-auto mb-3 h-12 w-12" />
                <div className="text-callout font-semibold">What can I do for you?</div>
                <p className="mx-auto mt-1 max-w-xs text-subhead text-muted">Ask how anything works, look things up, or ask me to do it. Small things I do straight away; anything bigger waits for your Confirm.</p>
                <Suggestions items={suggestionsFor(user, pageContext(pathname))} onPick={send} />
              </div>
            )}
            {msgs.map((m) => <Bubble key={m.id} m={m} role={user.role} onChange={replace} />)}
            {busy && (
              <div className="flex">
                <div className="max-w-[90%] rounded-tile bg-bg px-4 py-3">
                  <Dots />
                  {turn.progress.length > 0 && (
                    <ul className="mt-2 space-y-1 text-footnote text-muted">
                      {turn.progress.slice(-5).map((p, i) => <li key={`${i}-${p}`} className="flex items-start gap-1.5 anim-pop"><CheckIcon size={13} className="mt-0.5 shrink-0 text-green" />{p}</li>)}
                    </ul>
                  )}
                </div>
              </div>
            )}
            {err && <div className="rounded-tile bg-red-soft px-4 py-2.5 text-subhead text-red">{err}</div>}
            <div ref={end} />
          </div>
          <Composer value={text} onChange={setText} onSend={() => send()} busy={busy} placeholder="Ask Orb…" inputRef={input} />
        </>
      )}
    </section>
  );
}

// Inline markdown: [label](/path) as an app link (only links inside the app), **bold**
function Inline({ text, role }) {
  const out = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[3]) out.push(<strong key={m.index}>{m[3]}</strong>);
    else if (m[2].startsWith(`/${role}`) && !m[2].startsWith('//')) out.push(<Link key={m.index} to={m[2]} className="font-semibold text-blue underline-offset-2 hover:underline">{m[1]}</Link>);
    else out.push(m[1]);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Rich({ text, role }) {
  const lines = String(text || '').split('\n');
  return lines.map((line, i) => {
    const bullet = /^\s*[-•*]\s+(.*)$/.exec(line);
    const step = /^\s*(\d+)\.\s+(.*)$/.exec(line);
    if (bullet) return <div key={i} className="flex gap-2 pl-1"><span className="text-faint">•</span><span className="min-w-0"><Inline text={bullet[1]} role={role} /></span></div>;
    if (step) return <div key={i} className="flex gap-2 pl-1"><span className="num text-faint">{step[1]}.</span><span className="min-w-0"><Inline text={step[2]} role={role} /></span></div>;
    const heading = /^#{1,4}\s+(.*)$/.exec(line);
    if (heading) return <div key={i} className="mt-1 font-semibold"><Inline text={heading[1]} role={role} /></div>;
    return <Fragment key={i}>{line ? <div><Inline text={line} role={role} /></div> : <div className="h-2" />}</Fragment>;
  });
}

function Bubble({ m, role, onChange }) {
  const mine = m.role === 'user';
  return (
    <div className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
      <div className={cx('max-w-[90%] rounded-tile px-4 py-2.5 text-body leading-relaxed', mine ? 'whitespace-pre-wrap bg-blue text-white' : 'bg-bg')}>
        {mine ? m.text : <Rich text={m.text} role={role} />}
        {!mine && m.done?.length > 0 && <DoneList m={m} onChange={onChange} />}
        {!mine && m.pending_action && <ActionCard m={m} onChange={onChange} />}
        {!mine && m.items?.length > 0 && (
          <div className="mt-2"><Button size="sm" variant="soft" icon={Sparkles} to={`/${role}/ops`}>Open in Ops AI inbox ({m.items.length})</Button></div>
        )}
      </div>
    </div>
  );
}

// Small changes Orb made straight away, each with a link and Undo where possible
function DoneList({ m, onChange }) {
  const [run, busy] = useAction();
  const [err, setErr] = useState(null);
  const undo = (index) => run(() => api('assistant.undo', { message_id: m.id, index }), 'Undone').then((r) => { if (r.message) onChange(r.message); }).catch((e) => setErr(e.message));
  return (
    <div className="mt-3 space-y-1.5">
      {m.done.map((d, i) => (
        <div key={i} className={cx('flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-footnote', d.undone && 'opacity-60')}>
          {d.undone ? <CircleSlash size={15} className="shrink-0 text-muted" /> : <CheckIcon size={15} className="shrink-0 text-green" />}
          <span className={cx('min-w-0 flex-1', d.undone && 'line-through')}>{d.label}</span>
          {d.undone && <Pill tone="grey">Undone</Pill>}
          {d.link && !d.undone && <Link to={d.link} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-blue hover:bg-blue-soft" aria-label="Open"><ArrowUpRight size={16} /></Link>}
          {d.can_undo && <Button size="sm" variant="ghost" icon={Undo2} disabled={busy} onClick={() => undo(i)}>Undo</Button>}
        </div>
      ))}
      {err && <p className="text-footnote text-red">{err}</p>}
    </div>
  );
}

const STATUS = { confirmed: ['green', 'Done'], cancelled: ['grey', 'Cancelled'], failed: ['red', 'Not all done'] };
const LINE = { done: ['text-green', CheckIcon], failed: ['text-red', X], skipped: ['text-faint', CircleSlash], not_run: ['text-faint', CircleSlash] };

// The Confirm card: a checklist of changes; untick any line you don't want
function ActionCard({ m, onChange }) {
  const [run, busy] = useAction();
  const [err, setErr] = useState(null);
  const items = m.pending_action.items || [];
  const [skip, setSkip] = useState(() => new Set());
  const pending = m.action_status === 'pending';
  const go = (action) => run(() => api(action, { message_id: m.id, ...(action === 'assistant.confirm' ? { skip: [...skip] } : {}) })).then((r) => {
    if (r.message) onChange(r.message);
    if (r.ok === false && !r.message) setErr(r.error);
  }).catch((e) => setErr(e.message));
  const st = STATUS[m.action_status];
  const ticked = items.length - skip.size;
  return (
    <div className="mt-3 rounded-2xl border border-line bg-surface p-3 text-subhead">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-caption font-semibold uppercase tracking-wide text-muted">{pending ? 'Waiting for your Confirm' : 'Changes'}</span>
        {st && <Pill tone={st[0]}>{st[1]}</Pill>}
      </div>
      <ol className="space-y-2">
        {items.map((it, i) => {
          const res = m.results?.[i];
          const [tone, Icon] = (res && LINE[res.status]) || [];
          return (
            <li key={i} className="flex items-start gap-2.5">
              {pending && items.length > 1
                ? <Check checked={!skip.has(i)} label={it.label} className="mt-0.5" onChange={(on) => setSkip((s) => { const n = new Set(s); if (on) n.delete(i); else n.add(i); return n; })} />
                : Icon ? <Icon size={17} className={cx('mt-0.5 shrink-0', tone)} /> : <span className="num mt-0.5 w-[22px] shrink-0 text-center text-footnote text-faint">{i + 1}.</span>}
              <div className={cx('min-w-0 flex-1', pending && skip.has(i) && 'text-faint line-through')}>
                {it.title && it.title !== it.label && <div className="text-caption font-semibold text-muted">{it.title}</div>}
                <div>{it.label}</div>
                {res?.error && <div className="text-footnote text-red">{res.error}</div>}
                {res?.status === 'not_run' && <div className="text-footnote text-muted">Not done: stopped after the problem above</div>}
                {res?.text && <div className="text-footnote text-muted">{res.text}</div>}
              </div>
              {res?.link && <Link to={res.link} className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-blue hover:bg-blue-soft" aria-label="Open"><ArrowUpRight size={16} /></Link>}
            </li>
          );
        })}
      </ol>
      {m.result && !pending && <p className={cx('mt-3 rounded-xl px-3 py-2 text-footnote', m.action_status === 'failed' ? 'bg-red-soft text-red' : 'bg-green-soft')}>{m.result}</p>}
      {err && <p className="mt-2 text-footnote text-red">{err}</p>}
      {pending && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" icon={CheckIcon} busy={busy} disabled={!ticked} onClick={() => go('assistant.confirm')}>{items.length > 1 ? `Confirm ${ticked}` : 'Confirm'}</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => go('assistant.cancel')}>Cancel</Button>
        </div>
      )}
    </div>
  );
}

function HistoryList({ current, onPick, onDeleted }) {
  const q = useApi('assistant.list');
  const confirm = useConfirm();
  const [run] = useAction();
  const del = async (c) => {
    if (!(await confirm({ title: 'Delete this chat?', body: c.title, confirm: 'Delete', danger: true }))) return;
    await run(() => api('assistant.delete', { id: c.id }), 'Chat deleted').catch(() => {});
    onDeleted(c.id);
    q.reload();
  };
  if (q.loading && !q.data) return <div className="p-6 text-center"><Dots /></div>;
  const rows = q.data || [];
  return (
    <div className="flex-1 overflow-y-auto p-3">
      {!rows.length ? <Empty icon={History} title="No chats yet" /> : (
        <div className="space-y-1">
          {rows.map((c) => (
            <div key={c.id} className={cx('flex items-center gap-2 rounded-2xl pr-1', c.id === current ? 'bg-blue-soft' : 'hover:bg-bg')}>
              <Pressable press onClick={() => onPick(c.id)} className="min-w-0 flex-1 px-3 py-2.5 text-left">
                <div className="truncate text-body font-semibold">{c.title}</div>
                <div className="text-caption text-muted">{relative(c.updated_at)}{c.pending ? ` · ${c.pending} waiting for Confirm` : ''}</div>
              </Pressable>
              <IconButton icon={Trash2} label="Delete chat" onClick={() => del(c)} className="text-red" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function useWide() {
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 1024px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = () => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return wide;
}
