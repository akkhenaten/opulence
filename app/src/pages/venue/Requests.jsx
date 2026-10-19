import { useState } from 'react';
import { ArrowUp, MessageSquarePlus } from 'lucide-react';
import { Empty, Load, Page, Pill, Tile, cx, dateTime, useApi } from '../../ui/index.jsx';
import { api } from '../../api.js';

const EXAMPLES = ['Need 2 extra door staff Saturday 9pm–3am', 'Can we add a CCTV operator on Friday 8pm–2am?', 'Please cancel Sunday\'s steward shift'];
const STATUS = { requested: 'Requested', confirmed: 'Confirmed', declined: 'Declined' };

export default function Requests() {
  const list = useApi('venueRequests.list', {}, { poll: 30000 });
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async (t = text) => {
    const content = t.trim();
    if (!content || busy) return;
    // A finished request starts a fresh conversation
    const history = msgs.length && msgs[msgs.length - 1].done ? [] : msgs;
    const next = [...history, { role: 'user', content }];
    setMsgs(next); setText(''); setBusy(true);
    try {
      const r = await api('venueRequests.create', { text: content, history: history.map(({ role, content: c }) => ({ role, content: c })) });
      setMsgs([...next, { role: 'assistant', content: r.reply, done: r.status === 'requested' }]);
      if (r.status === 'requested') list.reload();
    } catch (e) {
      setMsgs([...next, { role: 'assistant', content: e.message, error: true }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page title="Requests" subtitle="Ask for staff in your own words — we'll confirm.">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
        <Tile pad={false} className="flex min-h-[420px] flex-col overflow-hidden">
          <div className="flex-1 space-y-3 p-4 sm:p-5">
            {!msgs.length && (
              <div className="py-4 text-center">
                <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-blue-soft text-blue"><MessageSquarePlus size={22} /></div>
                <div className="text-[16px] font-semibold">What do you need?</div>
                <p className="mx-auto mt-1 max-w-sm text-[14px] text-muted">Extra officers, a change of times or a cancellation. Include the day, times and how many.</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {EXAMPLES.map((e) => <button key={e} type="button" onClick={() => setText(e)} className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] font-semibold transition hover:border-blue hover:text-blue">{e}</button>)}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={cx('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cx('max-w-[88%] rounded-[20px] px-4 py-2.5 text-[15px] leading-relaxed', m.role === 'user' ? 'bg-blue text-white' : m.error ? 'bg-red-soft text-red' : m.done ? 'bg-green-soft text-green' : 'bg-bg')}>{m.content}</div>
              </div>
            ))}
            {busy && <div className="flex"><div className="rounded-[20px] bg-bg px-4 py-2.5 text-[14px] text-muted">Reading your request…</div></div>}
          </div>
          <form className="flex items-end gap-2 border-t border-line p-3" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <textarea rows={1} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. 2 door staff Saturday 9pm–3am"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              className="max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border border-line bg-surface px-4 py-2.5 text-[15px] outline-none focus:border-blue focus:ring-4 focus:ring-blue/10" />
            <button type="submit" aria-label="Send" disabled={busy || !text.trim()} className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-blue text-white transition disabled:opacity-40"><ArrowUp size={20} /></button>
          </form>
        </Tile>

        <div>
          <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">Your requests</h2>
          <Load q={list}>{(rows) => (rows.length ? (
            <div className="space-y-2">
              {rows.map((r) => (
                <Tile key={r.id} className="!p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-[14px] leading-snug">{r.text}</p>
                    <Pill status={r.status === 'requested' ? 'pending' : r.status === 'confirmed' ? 'ok' : 'declined'}>{STATUS[r.status]}</Pill>
                  </div>
                  <div className="mt-1 text-[12px] text-faint">{dateTime(r.created_at)}{r.user_name && ` · ${r.user_name}`}</div>
                  {r.status === 'declined' && r.decline_reason && <div className="mt-2 rounded-xl bg-bg px-3 py-2 text-[13px] text-muted">{r.decline_reason}</div>}
                </Tile>
              ))}
            </div>
          ) : <Empty title="No requests yet" body="Requests you send appear here with their status." />)}</Load>
        </div>
      </div>
    </Page>
  );
}
