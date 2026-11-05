import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BellOff, Camera, Mic, SquarePen } from 'lucide-react';
import { useAuth } from '../../auth.jsx';
import { cx, Empty, IconButton, Load, Pressable, SearchInput, useApi } from '../../ui/index.jsx';
import { api } from '../../api.js';
import { useRealtime, useRealtimeConnected } from '../../realtime.js';
import NewMessage from './NewMessage.jsx';
import Thread, { NoThread } from './Thread.jsx';
import { ConvAvatar, useBase, whenLabel } from './_parts.jsx';

// Fills the screen under the top bar (and above the phone tab bar) so the thread scrolls on its own
const FILL = 'h-[calc(100dvh-56px-var(--tabbar-h)-env(safe-area-inset-top))] lg:h-[calc(100dvh-56px-32px)]';

/** Inbox on the left, the open conversation on the right (wide screens); one or the other on phones. */
export default function Messages() {
  const { id } = useParams();
  const live = useRealtimeConnected();
  const inbox = useApi('messages.inbox', {}, { poll: live ? 60000 : 15000 });
  useRealtime(['msg', 'read'], () => inbox.reload());
  return (
    <div className="mx-auto w-full max-w-6xl lg:px-6 lg:pb-8">
      <div className={cx('flex overflow-hidden bg-surface lg:rounded-tile lg:border lg:border-hairline lg:shadow-tile', FILL)}>
        <aside className={cx('min-h-0 w-full flex-col lg:flex lg:w-[340px] lg:shrink-0 lg:border-r lg:border-line', id ? 'hidden' : 'flex')}>
          <Inbox q={inbox} current={id} />
        </aside>
        <section className={cx('min-h-0 min-w-0 flex-1 flex-col', id ? 'flex' : 'hidden lg:flex')}>
          {id ? <Thread key={id} id={id} onChanged={inbox.reload} /> : <NoThread />}
        </section>
      </div>
    </div>
  );
}

function Inbox({ q, current }) {
  const { user } = useAuth();
  const base = useBase();
  const [search, setSearch] = useState('');
  const [compose, setCompose] = useState(false);
  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (q.data || []).filter((c) => !s || `${c.title} ${c.label || ''} ${c.last?.body || ''}`.toLowerCase().includes(s));
  }, [q.data, search]);
  // Words inside messages too, across every conversation
  const [found, setFound] = useState(null);
  useEffect(() => {
    const s = search.trim();
    if (s.length < 2) { setFound(null); return undefined; }
    const t = setTimeout(() => api('messages.search', { q: s }).then((r) => setFound(r.results)).catch(() => setFound([])), 300);
    return () => clearTimeout(t);
  }, [search]);
  return (
    <>
      <div className="px-4 pb-3 pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h1 className="text-title1 font-bold">Messages</h1>
          <IconButton icon={SquarePen} tone="solid" label="New message" onClick={() => setCompose(true)} />
        </div>
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search messages" />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-[calc(16px+var(--fab-room))]">
        <Load q={q} skeleton="rows">
          {() => (list.length ? list.map((c) => {
            const own = c.last?.sender_id === user.id;
            const preview = c.last ? `${own ? 'You: ' : c.kind !== 'direct' && c.last.sender ? `${c.last.sender.split(' ')[0]}: ` : ''}${c.last.body || ''}` : 'No messages yet';
            return (
              <Pressable key={c.id} to={`${base}/${c.id}`} className={cx('flex items-center gap-3 px-4 py-2.5', current === c.id && '!bg-blue-soft')}>
                <ConvAvatar c={c} size={48} />
                <div className="min-w-0 flex-1 border-b border-line pb-2.5 pt-0.5">
                  <div className="flex items-baseline gap-2">
                    <span className={cx('min-w-0 flex-1 truncate text-body', c.unread ? 'font-bold' : 'font-semibold')}>{c.title}</span>
                    <span className={cx('shrink-0 text-caption', c.unread ? 'font-semibold text-blue' : 'text-faint')}>{whenLabel(c.last?.at || c.last_message_at)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span className={cx('line-clamp-2 min-w-0 flex-1 text-footnote', c.unread ? 'text-ink' : 'text-muted')}>
                      {c.last?.voice ? <Mic size={14} className="mr-1 inline -translate-y-px" /> : c.last?.photos > 0 && <Camera size={14} className="mr-1 inline -translate-y-px" />}
                      {preview || (c.last?.voice ? 'Voice message' : c.last?.photos ? 'Photo' : '')}
                    </span>
                    {c.muted && <BellOff size={14} className="shrink-0 text-faint" />}
                    {c.unread > 0 && <span className="min-w-[20px] shrink-0 rounded-full bg-blue px-1.5 text-center text-caption2 font-bold leading-5 text-white">{c.unread}</span>}
                  </div>
                  {c.label && <div className="mt-0.5 truncate text-caption2 font-semibold uppercase tracking-wide text-faint">{c.label}</div>}
                </div>
              </Pressable>
            );
          }) : !found?.length && <Empty title={search ? 'No matches' : 'No messages yet'} body={search ? 'Try another word.' : 'Start a conversation with anyone in the company.'} />)}
        </Load>
        {found?.length > 0 && (
          <>
            <h2 className="px-4 pb-1 pt-4 text-footnote font-semibold uppercase tracking-wide text-muted">In messages</h2>
            {found.map((r) => (
              <Pressable key={r.id} to={`${base}/${r.conversation.id}?m=${r.id}`} className="block px-4 py-2.5">
                <div className="flex items-baseline gap-2">
                  <span className="min-w-0 flex-1 truncate text-body font-semibold">{r.conversation.title}</span>
                  <span className="shrink-0 text-caption text-faint">{whenLabel(r.at)}</span>
                </div>
                <div className="line-clamp-2 text-footnote text-muted">
                  {r.voice && <Mic size={13} className="mr-1 inline -translate-y-px" />}{r.mine ? 'You' : r.sender?.split(' ')[0]}: {r.text}
                </div>
              </Pressable>
            ))}
          </>
        )}
      </div>
      <NewMessage open={compose} onClose={() => setCompose(false)} />
    </>
  );
}
