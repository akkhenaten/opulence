import { useEffect, useRef, useState } from 'react';
import { ArrowUp, MessageSquareText } from 'lucide-react';
import { cx, IconButton, Pressable } from './index.jsx';
import { api } from '../api.js';

const Dot3 = () => [0, 1, 2].map((i) => <span key={i} className="h-2 w-2 animate-bounce rounded-full bg-faint" style={{ animationDelay: `${i * 0.15}s` }} />);

// Tappable example prompts shown before the first message
export function Suggestions({ items, onPick }) {
  return (
    <div className="mt-4 flex flex-wrap justify-center gap-2">
      {items.map((p) => <Pressable press key={p} onClick={() => onPick(p)} className="rounded-full border border-line bg-surface px-4 py-2.5 text-center text-footnote font-semibold hover:border-blue hover:text-blue">{p}</Pressable>)}
    </div>
  );
}

// Message box with a round send button. Enter sends, Shift+Enter adds a line
export function Composer({ value, onChange, onSend, busy, placeholder }) {
  // Grows with the text up to max-h-32, then scrolls
  const box = useRef(null);
  useEffect(() => { const el = box.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight + 2}px`; } }, [value]);
  return (
    <form className="flex items-end gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); onSend(); }}>
      <textarea ref={box} rows={1} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} enterKeyHint="send"
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }}
        className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border border-line bg-surface px-4 py-2.5 text-callout outline-none focus:border-blue focus:ring-4 focus:ring-blue/10" />
      <IconButton type="submit" icon={ArrowUp} label="Send" tone="primary" className="!h-11 !w-11 disabled:opacity-40" disabled={busy || !value.trim()} />
    </form>
  );
}

/**
 * Chat with an AI action that takes {messages, ...extra} and returns {reply, ...}.
 * renderReply(message) can add extras under an assistant reply; onReply(result) runs after each answer.
 */
export default function Chat({ action, extra = {}, storageKey, prompts = [], empty, placeholder = 'Ask a question…', renderReply, onReply, className }) {
  const [msgs, setMsgs] = useState(() => (storageKey ? JSON.parse(sessionStorage.getItem(storageKey) || '[]') : []));
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef(null);
  useEffect(() => {
    if (storageKey) sessionStorage.setItem(storageKey, JSON.stringify(msgs.slice(-30)));
    end.current?.scrollIntoView({ block: 'end' });
  }, [msgs, busy, storageKey]);

  const send = async (t = text) => {
    const content = t.trim();
    if (!content || busy) return;
    const next = [...msgs, { role: 'user', content }];
    setMsgs(next); setText(''); setBusy(true);
    try {
      const r = await api(action, { ...extra, messages: next.map(({ role, content: c }) => ({ role, content: c })) });
      setMsgs([...next, { role: 'assistant', content: r.reply, items: r.items }]);
      onReply?.(r);
    } catch (e) {
      setMsgs([...next, { role: 'assistant', content: e.message, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cx('flex min-h-[60dvh] flex-col', className)}>
      <div className="flex-1 space-y-3 overflow-y-auto p-4 sm:p-5">
        {!msgs.length && (
          <div className="py-6 text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-blue-soft text-blue"><MessageSquareText size={24} /></div>
            {empty}
            {prompts.length > 0 && (
              <Suggestions items={prompts} onPick={send} />
            )}
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div className={cx('max-w-[88%] whitespace-pre-wrap rounded-tile px-4 py-2.5 text-body leading-relaxed', m.role === 'user' ? 'bg-blue text-white' : m.error ? 'bg-red-soft text-red' : 'bg-bg')}>
              {m.content}
              {m.role === 'assistant' && !m.error && renderReply?.(m)}
            </div>
          </div>
        ))}
        {busy && <div className="flex"><div className="rounded-tile bg-bg px-4 py-3"><span className="inline-flex gap-1"><Dot3 /></span></div></div>}
        <div ref={end} />
      </div>
      <Composer value={text} onChange={setText} onSend={() => send()} busy={busy} placeholder={placeholder} />
      {msgs.length > 0 && <button type="button" onClick={() => setMsgs([])} className="pb-3 text-center text-caption font-semibold text-faint hover:text-ink">Clear conversation</button>}
    </div>
  );
}
