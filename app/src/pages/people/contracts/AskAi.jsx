// Ask AI: chat about the draft. The AI suggests changes as cards; only Apply changes the document.
import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUp, Check, RotateCcw, Sparkles, X } from 'lucide-react';
import { api } from '../../../api.js';
import { Button, cx, IconButton, Pill, useConfirm, useToast } from '../../../ui/index.jsx';
import { StatePill } from './_shared.jsx';

const STARTERS = ['Explain the findings in plain English', 'What should I check before sending this?', 'Which clauses could I switch off for this role?'];

function show(x) {
  if (x == null || x === '') return 'not set';
  if (typeof x === 'boolean') return x ? 'Included' : 'Left out';
  return String(x);
}

function Proposal({ p, onApply, onDismiss, onJump }) {
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState(false);
  const done = p.status === 'applied' || p.status === 'dismissed';
  const apply = async () => { setBusy(true); try { await onApply(p); } finally { setBusy(false); } };
  const title = {
    answer: `Set "${p.label}"`, alternative: 'Use other library wording', toggle: `${p.now ? 'Include' : 'Leave out'} "${p.label}"`,
    wording: `New wording for "${p.label}"`, ask: `Answer "${p.label}" in the Guide`,
  }[p.kind];
  return (
    <div className={cx('rounded-xl border bg-surface p-3', done ? 'border-line opacity-70' : 'border-blue/30')}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 text-footnote font-semibold">{title}</div>
        {p.status === 'applied' && <Pill tone="green">Applied</Pill>}
        {p.status === 'dismissed' && <Pill tone="grey">Dismissed</Pill>}
      </div>
      {p.kind === 'answer' && <p className="mt-1 text-footnote"><span className="text-muted line-through">{show(p.was)}</span> → <b>{show(p.now)}</b></p>}
      {p.kind === 'alternative' && (
        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-footnote">
          <span className="text-muted line-through">{p.was || 'none'}</span> → <b>{p.now}</b>{p.state && <StatePill state={p.state} />}
        </p>
      )}
      {p.kind === 'wording' && (
        <div className="mt-1.5">
          <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg bg-bg p-2.5 font-sans text-footnote">{compare ? p.was : p.now}</pre>
          <button type="button" className="mt-1 text-caption font-semibold text-blue" onClick={() => setCompare((c) => !c)}>{compare ? 'Show the new wording' : 'Show the current wording'}</button>
          <p className="mt-0.5 text-caption text-faint">Used in this document only and flagged for review.</p>
        </div>
      )}
      {p.why && <p className="mt-1 text-caption text-muted">{p.why}</p>}
      {!done && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {p.kind === 'ask'
            ? <Button size="sm" variant="secondary" iconRight={ArrowRight} onClick={() => onJump(p.jump || { question: p.question })}>Go to it</Button>
            : <Button size="sm" icon={Check} busy={busy} onClick={apply}>Apply</Button>}
          {p.kind !== 'ask' && p.jump && <Button size="sm" variant="ghost" onClick={() => onJump(p.jump)}>Show me</Button>}
          <Button size="sm" variant="ghost" icon={X} onClick={() => onDismiss(p)}>Dismiss</Button>
        </div>
      )}
    </div>
  );
}

export default function AskAi({ v, onChat, onApply, onJump }) {
  const chat = v.draft.chat || [];
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [paused, setPaused] = useState(null);
  const toast = useToast();
  const confirm = useConfirm();
  const end = useRef(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [chat.length, busy]);

  const send = async (message) => {
    const m = (message ?? text).trim();
    if (!m || busy) return;
    setBusy(true); setText('');
    try {
      onChat((await api('contracts.ai.chat', { id: v.draft.id, message: m })).chat);
    } catch (e) {
      setText(m);
      if (e.status === 429) setPaused(e.message); else toast(e.message, 'error');
    } finally { setBusy(false); }
  };
  const dismiss = async (p) => {
    try { onChat((await api('contracts.ai.resolve', { id: v.draft.id, proposal_id: p.id, status: 'dismissed' })).chat); } catch (e) { toast(e.message, 'error'); }
  };
  const clear = async () => {
    if (!(await confirm({ title: 'Clear the conversation?', body: 'The draft keeps every change you applied.', confirm: 'Clear' }))) return;
    try { onChat((await api('contracts.ai.clear', { id: v.draft.id })).chat); } catch (e) { toast(e.message, 'error'); }
  };

  return (
    <div className="flex min-h-full flex-col pb-4">
      <div className="mb-3 flex items-start gap-2 rounded-2xl bg-surface p-3 text-caption text-muted shadow-tile">
        <Sparkles size={16} className="mt-0.5 shrink-0 text-blue" />
        <p className="min-w-0 flex-1">Contracts AI explains and suggests. It cannot fill in pay, hours, dates or names you have not given, and its suggestions are not legal advice. Nothing changes until you press Apply.</p>
        {chat.length > 0 && <IconButton size="sm" icon={RotateCcw} label="Clear conversation" onClick={clear} />}
      </div>

      <div className="flex-1 space-y-3">
        {!chat.length && (
          <div className="flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <button key={s} type="button" onClick={() => send(s)} disabled={busy || !!paused}
                className="pressable rounded-full border border-line bg-surface px-3.5 py-2 text-left text-footnote font-semibold disabled:opacity-50">{s}</button>
            ))}
          </div>
        )}
        {chat.map((m, i) => (m.role === 'user' ? (
          <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-blue px-3.5 py-2 text-footnote text-white">{m.text}</div>
        ) : (
          <div key={i} className="max-w-[95%] space-y-2">
            <div className="whitespace-pre-wrap rounded-2xl rounded-bl-md bg-surface px-3.5 py-2 text-footnote shadow-tile">{m.text.replace(/\*\*(.+?)\*\*/g, '$1')}</div>
            {(m.proposals || []).map((p) => <Proposal key={p.id} p={p} onApply={onApply} onDismiss={dismiss} onJump={onJump} />)}
            {(m.rejected || []).length > 0 && (
              <p className="px-1 text-caption text-faint">Not suggested: {m.rejected.map((r) => `${r.label} (${r.reason})`).join('; ')}</p>
            )}
          </div>
        )))}
        {busy && <div className="inline-flex items-center gap-1 rounded-2xl bg-surface px-3.5 py-2.5 shadow-tile" aria-label="Thinking">{[0, 1, 2].map((n) => <span key={n} className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" style={{ animationDelay: `${n * 150}ms` }} />)}</div>}
        <div ref={end} />
      </div>

      {paused ? (
        <p className="sticky bottom-0 mt-3 rounded-2xl bg-amber-soft px-4 py-3 text-footnote">{paused}. A company admin can raise the Contracts AI cap in Ops AI → Settings.</p>
      ) : (
        <form className="sticky bottom-0 mt-3 flex items-end gap-2 rounded-2xl bg-surface p-2 shadow-tile" onSubmit={(e) => { e.preventDefault(); send(); }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={1} maxLength={2000} aria-label="Message Contracts AI" placeholder="Ask about this contract, or ask for a change"
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 text-subhead outline-none" />
          <IconButton icon={ArrowUp} label="Send" tone="primary" disabled={!text.trim() || busy} type="submit" />
        </form>
      )}
    </div>
  );
}
