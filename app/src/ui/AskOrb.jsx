// Ask Orb: the managers' assistant. Answers from live data; anything that changes data waits on a Confirm card.
import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Check, ChevronLeft, History, Plus, Sparkles, Trash2, X } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Button, cx, Empty, IconButton, Pill, Pressable, relative, useAction, useApi, useConfirm, useScrollLock } from './index.jsx';
import { Composer, Suggestions } from './Chat.jsx';

const KEY = 'orb.askorb';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// What the person is looking at, so "this venue" or "this pay run" makes sense
function pageContext(pathname) {
  const parts = pathname.split('/').filter(Boolean).slice(1);
  const id = parts.find((p) => UUID.test(p)) || '';
  const name = parts.filter((p) => !UUID.test(p)).join('/') || 'dashboard';
  return { name, id };
}

const PROMPTS = {
  company: ["Do last week's pay run", 'Any open pay queries?', 'Unfilled shifts next week', 'Which invoices are unpaid?'],
  security: ['Unfilled shifts next week', 'Who can cover Saturday night?', 'Lates and no-shows this month', 'Message the team at The Lantern Rooms'],
};

const Dots = () => <span className="inline-flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-faint" style={{ animationDelay: `${i * 0.15}s` }} />)}</span>;

export function AskOrbButton({ onClick }) {
  return <IconButton icon={Sparkles} tone="solid" onClick={onClick} label="Ask Orb" />;
}

export default function AskOrb({ open, onClose }) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const [view, setView] = useState('chat');
  const [convId, setConvId] = useState(() => sessionStorage.getItem(KEY) || null);
  const [msgs, setMsgs] = useState([]);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const end = useRef(null);
  const input = useRef(null);
  const wide = useWide();
  useScrollLock(open && !wide);

  useEffect(() => { if (convId) sessionStorage.setItem(KEY, convId); else sessionStorage.removeItem(KEY); }, [convId]);
  // Load the conversation when the panel opens or another chat is picked
  useEffect(() => {
    if (!open || !convId) { if (!convId) { setMsgs([]); setTitle(''); } return; }
    let live = true;
    api('assistant.get', { id: convId }).then((c) => { if (live) { setMsgs(c.messages); setTitle(c.title); } }).catch(() => { if (live) setConvId(null); });
    return () => { live = false; };
  }, [open, convId]);
  useEffect(() => { if (open) end.current?.scrollIntoView({ block: 'end' }); }, [msgs, busy, open, view]);
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    setTimeout(() => input.current?.focus(), 200);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);

  const send = async (t = text) => {
    const q = t.trim();
    if (!q || busy) return;
    setText(''); setErr(null); setBusy(true);
    setMsgs((m) => [...m, { id: `tmp-${Date.now()}`, role: 'user', text: q }]);
    try {
      const r = await api('assistant.send', { conversation_id: convId || undefined, text: q, page: pageContext(pathname) });
      setConvId(r.conversation_id); setTitle(r.title);
      setMsgs((m) => [...m.filter((x) => !String(x.id).startsWith('tmp-')), r.user_message, r.message]);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const replace = (m) => setMsgs((list) => list.map((x) => (x.id === m.id ? m : x)));
  const newChat = () => { setConvId(null); setMsgs([]); setTitle(''); setView('chat'); setErr(null); };

  if (!open) return null;
  return (
    <>
      <section role="dialog" aria-label="Ask Orb"
        className="fixed inset-0 z-50 flex flex-col bg-surface safe-t safe-b lg:inset-y-3 lg:left-auto lg:right-3 lg:w-[420px] lg:rounded-tile lg:border lg:border-line lg:shadow-xl anim-pop">
        <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-2">
          {view === 'history'
            ? <IconButton icon={ChevronLeft} label="Back to chat" onClick={() => setView('chat')} />
            : <IconButton icon={History} label="Previous chats" onClick={() => setView('history')} />}
          <div className="min-w-0 flex-1 px-1 text-center">
            <div className="flex items-center justify-center gap-1.5 text-headline font-semibold"><Sparkles size={16} className="text-blue" />Ask Orb</div>
            {view === 'chat' && title && <div className="truncate text-caption text-muted">{title}</div>}
          </div>
          <IconButton icon={Plus} label="New chat" onClick={newChat} />
          <IconButton icon={X} label="Close" onClick={onClose} />
        </header>

        {view === 'history' ? <HistoryList current={convId} onPick={(id) => { setConvId(id); setView('chat'); }} onDeleted={(id) => { if (id === convId) newChat(); }} /> : (
          <>
            <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain p-4">
              {!msgs.length && !busy && (
                <div className="py-6 text-center">
                  <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-blue-soft text-blue"><Sparkles size={24} /></div>
                  <div className="text-callout font-semibold">What can I do for you?</div>
                  <p className="mx-auto mt-1 max-w-xs text-subhead text-muted">I look things up across rota, pay, invoices and messages. Anything that changes data waits for you to tap Confirm.</p>
                  <Suggestions items={PROMPTS[user.role] || PROMPTS.security} onPick={send} />
                </div>
              )}
              {msgs.map((m) => <Bubble key={m.id} m={m} role={user.role} onChange={replace} />)}
              {busy && <div className="flex"><div className="rounded-tile bg-bg px-4 py-3"><Dots /></div></div>}
              {err && <div className="rounded-tile bg-red-soft px-4 py-2.5 text-subhead text-red">{err}</div>}
              <div ref={end} />
            </div>
            <Composer value={text} onChange={setText} onSend={() => send()} busy={busy} placeholder="Ask Orb…" inputRef={input} />
          </>
        )}
      </section>
    </>
  );
}

function Bubble({ m, role, onChange }) {
  const mine = m.role === 'user';
  return (
    <div className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
      <div className={cx('max-w-[90%] whitespace-pre-wrap rounded-tile px-4 py-2.5 text-body leading-relaxed', mine ? 'bg-blue text-white' : 'bg-bg')}>
        {m.text}
        {!mine && m.pending_action && <ActionCard m={m} onChange={onChange} />}
        {!mine && m.items?.length > 0 && (
          <div className="mt-2"><Button size="sm" variant="soft" icon={Sparkles} to={`/${role}/ops`}>Open in Ops AI inbox ({m.items.length})</Button></div>
        )}
      </div>
    </div>
  );
}

const STATUS = { confirmed: ['green', 'Done'], cancelled: ['grey', 'Cancelled'], failed: ['red', 'Not done'] };

function ActionCard({ m, onChange }) {
  const [run, busy] = useAction();
  const [err, setErr] = useState(null);
  const go = (action) => run(() => api(action, { message_id: m.id })).then((r) => {
    if (r.message) onChange(r.message);
    if (r.ok === false) setErr(r.error);
  }).catch((e) => setErr(e.message));
  const st = STATUS[m.action_status];
  return (
    <div className="mt-3 rounded-2xl border border-line bg-surface p-3 text-subhead">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-caption font-semibold uppercase tracking-wide text-muted">Ready to do</span>
        {st && <Pill tone={st[0]}>{st[1]}</Pill>}
      </div>
      <p>{m.pending_action.summary}</p>
      {m.result && <p className={cx('mt-2 rounded-xl px-3 py-2 text-footnote', m.action_status === 'failed' ? 'bg-red-soft text-red' : 'bg-green-soft')}>{m.result}</p>}
      {err && !m.result && <p className="mt-2 text-footnote text-red">{err}</p>}
      {m.action_status === 'pending' && (
        <div className="mt-3 flex gap-2">
          <Button size="sm" icon={Check} busy={busy} onClick={() => go('assistant.confirm')}>Confirm</Button>
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
