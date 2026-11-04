import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowUp, CalendarDays, Hash, Newspaper, X } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useRealtime } from '../../realtime.js';
import { Button, cx, Empty, ErrorBox, Load, Page, Pressable, SearchInput, Segmented, Sheet, Spinner, useApi, usePullRefresh, useToast } from '../../ui/index.jsx';
import Composer from './Composer.jsx';
import Moderation from './Moderation.jsx';
import PostCard from './PostCard.jsx';
import Profile from './Profile.jsx';
import { isMgr, PersonSheet, whenText } from './_parts.jsx';

export default function Feed() {
  return (
    <Page title="Everyday" subtitle="News, photos and shout-outs from the team">
      <FeedBody />
    </Page>
  );
}

/** The feed itself; managers see it as a Dashboard tab, so other URL params (like ?tab=everyday) are kept */
export function FeedBody() {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const patch = (changes) => setSp((cur) => {
    const n = new URLSearchParams(cur);
    for (const [k, v] of Object.entries(changes)) { if (v == null || v === '') n.delete(k); else n.set(k, v); }
    return n;
  }, { replace: true });
  const mgr = isMgr(user);
  const view = mgr && sp.get('view') === 'moderation' ? 'moderation' : 'feed';
  const reports = useApi('everyday.reports', {}, { skip: !mgr });
  const open = reports.data?.reports?.length || 0;
  return (
    <>
      {mgr && (
        <Segmented className="mb-4" value={view} onChange={(v) => patch({ view: v === 'feed' ? null : v })}
          options={[{ value: 'feed', label: 'Feed' }, { value: 'moderation', label: open ? `Moderation (${open})` : 'Moderation' }]} />
      )}
      {view === 'feed' ? <Stream sp={sp} patch={patch} /> : <Moderation onChanged={reports.reload} />}
    </>
  );
}

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'announcements', label: 'Announcements' },
  { value: 'shoutouts', label: 'Shout-outs' },
  { value: 'events', label: 'Events' },
  { value: 'polls', label: 'Polls' },
  { value: 'venues', label: 'My venues' },
  { value: 'saved', label: 'Saved' },
];

const Pill = ({ on, onClick, children }) => (
  <Pressable press onClick={onClick} aria-pressed={on}
    className={cx('flex shrink-0 items-center gap-1 rounded-full px-3.5 py-1.5 text-footnote font-semibold', on ? 'bg-blue text-white' : 'bg-surface text-ink shadow-tile')}>{children}</Pressable>
);

function Stream({ sp, patch }) {
  const { user } = useAuth();
  const toast = useToast();
  const filter = sp.get('filter') || 'all';
  const topic = sp.get('topic') || '';
  const search = sp.get('q') || '';
  const person = sp.get('person');
  const postId = sp.get('post');
  const [text, setText] = useState(search);
  const q = useApi('everyday.feed', { filter, topic: topic || undefined, q: search || undefined }, { skip: !!person });
  const topics = useApi('everyday.topics', {}, { skip: !!person });
  const events = useApi('everyday.events', {}, { skip: !!person });
  const [older, setOlder] = useState([]);
  const [next, setNext] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sheetPerson, setSheetPerson] = useState(null);
  const [fresh, setFresh] = useState(0);
  const [patched, setPatched] = useState({}); // live copies of posts on screen, by id
  const top = useRef(null);
  const dirty = useRef(new Set());
  const timer = useRef(null);
  const plain = filter === 'all' && !topic && !search;

  useEffect(() => { api('everyday.seen').catch(() => {}); }, []);
  useEffect(() => { if (q.data) { setOlder([]); setNext(q.data.next); setPatched({}); setFresh(0); } }, [q.data]);
  useEffect(() => setText(search), [search]);
  // Search as you type (after a pause), kept in the address so Back works
  useEffect(() => {
    if (text.trim() === search) return undefined;
    const t = setTimeout(() => patch({ q: text.trim() || null }), 450);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScreen = () => [...(q.data?.pinned || []), ...(q.data?.posts || []), ...older].map((p) => p.id);
  // Live: a new post from someone else shows a pill; changes to posts on screen refresh just those cards
  useRealtime(['feed.post', 'feed.update'], (d, event) => {
    if (event === 'reconnected') { q.reload(); return; }
    if (event === 'feed.post') { if (d.author_id !== user.id && plain) setFresh((n) => n + 1); return; }
    if (!d.post_id || !onScreen().includes(d.post_id)) return;
    dirty.current.add(d.post_id);
    if (timer.current) return;
    timer.current = setTimeout(async () => {
      timer.current = null;
      const ids = [...dirty.current];
      dirty.current.clear();
      try {
        const rows = await api('everyday.posts', { ids });
        setPatched((cur) => ({ ...cur, ...Object.fromEntries(rows.map((r) => [r.id, r])), ...Object.fromEntries(ids.filter((id) => !rows.some((r) => r.id === id)).map((id) => [id, null])) }));
      } catch { /* the next update will try again */ }
    }, 2000);
  });
  useEffect(() => () => clearTimeout(timer.current), []);

  const more = async () => {
    setLoadingMore(true);
    try {
      const r = await api('everyday.feed', { filter, topic: topic || undefined, q: search || undefined, before: next });
      setOlder((o) => [...o, ...r.posts]);
      setNext(r.next);
    } catch (e) { toast(e.message, 'error'); } finally { setLoadingMore(false); }
  };
  const reload = () => { q.reload(); events.reload(); };
  const pull = usePullRefresh(reload);
  const showFresh = () => { setFresh(0); q.reload(); top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  const live = (p) => (p.id in patched ? patched[p.id] : p);
  const openPerson = (id) => setSheetPerson(id);

  if (person) {
    return (
      <div className="mx-auto max-w-[620px]">
        <Profile userId={person} onBack={() => patch({ person: null })} onPerson={(id) => patch({ person: id })} onPost={(id) => patch({ post: id })} />
        <OnePost id={postId} comment={sp.get('comment')} onClose={() => patch({ post: null, comment: null })} onPerson={(id) => patch({ post: null, person: id })} onChanged={() => {}} />
      </div>
    );
  }

  const tagList = [...(topics.data?.featured || []).map((t) => ({ topic: t, featured: true })), ...(topics.data?.trending || [])].slice(0, 12);
  const upcoming = (events.data || []).slice(0, 8);
  return (
    <div className="mx-auto max-w-[620px] space-y-4">
      {pull}
      <div ref={top} className="scroll-mt-24" />
      {fresh > 0 && (
        <div className="sticky top-16 z-20 flex justify-center">
          <Pressable press onClick={showFresh} className="flex items-center gap-1.5 rounded-full bg-blue px-4 py-2 text-footnote font-semibold text-white shadow-lg anim-pop">
            <ArrowUp size={16} /> {fresh} new post{fresh === 1 ? '' : 's'}
          </Pressable>
        </div>
      )}
      <SearchInput value={text} onChange={(e) => setText(e.target.value)} placeholder="Search posts, comments and people" />
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {FILTERS.map((f) => <Pill key={f.value} on={filter === f.value} onClick={() => patch({ filter: f.value === 'all' ? null : f.value })}>{f.label}</Pill>)}
      </div>
      {topic ? (
        <div className="flex items-center gap-2 rounded-tile bg-surface px-4 py-3 shadow-tile">
          <Hash size={20} className="text-blue" /><span className="min-w-0 flex-1 truncate text-headline font-bold">{topic}</span>
          <Pressable press aria-label="Clear topic" onClick={() => patch({ topic: null })} className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-bg"><X size={18} /></Pressable>
        </div>
      ) : tagList.length > 0 && !search && (
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4">
          {tagList.map((t) => (
            <Pressable press key={t.topic} onClick={() => patch({ topic: t.topic })} className={cx('shrink-0 rounded-full px-3 py-1 text-footnote font-semibold', t.featured ? 'bg-blue-soft text-blue' : 'bg-bg text-muted')}>#{t.topic}</Pressable>
          ))}
        </div>
      )}
      {(filter === 'all' || filter === 'events') && !topic && !search && upcoming.length > 0 && (
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
          {upcoming.map((e) => (
            <Pressable press key={e.post_id} onClick={() => patch({ post: e.post_id })} className="w-56 shrink-0 overflow-hidden rounded-tile bg-surface text-left shadow-tile">
              {e.cover_url ? <img src={e.cover_url} alt="" className="h-24 w-full object-cover" /> : <div className="grid h-24 place-items-center bg-red-soft"><CalendarDays size={32} className="text-red" /></div>}
              <div className="p-3">
                <div className="text-caption font-semibold uppercase text-red">{whenText(e.starts_at)}</div>
                <div className="truncate text-subhead font-bold">{e.title}</div>
                <div className="text-caption text-muted">{e.going} going{e.mine === 'going' ? ' · you too' : e.mine === 'waitlist' ? ' · you are waiting' : ''}</div>
              </div>
            </Pressable>
          ))}
        </div>
      )}
      <Load q={q} skeleton="rows">
        {(d) => {
          const posts = [...d.posts, ...older].map(live).filter(Boolean);
          const pinned = d.pinned.map(live).filter(Boolean);
          return (
            <>
              {plain && <Composer rulesAccepted={d.rules_accepted} onPosted={reload} />}
              {pinned.map((p) => <PostCard key={`pin-${p.id}`} post={p} onChanged={reload} onPerson={openPerson} />)}
              {posts.map((p) => <PostCard key={p.id} post={p} onChanged={reload} onPerson={openPerson} />)}
              {!posts.length && !pinned.length && (plain
                ? <Empty icon={Newspaper} title="Nothing posted yet" body="Be the first — say hello, share a win from your shift or welcome someone new." />
                : <Empty icon={Newspaper} title={search ? `Nothing found for "${search}"` : filter === 'saved' ? 'Nothing saved yet' : 'Nothing here yet'}
                  body={filter === 'saved' ? 'Use Save post in a post\'s menu to keep it here.' : filter === 'venues' ? 'Posts tagged at venues you worked at in the last 90 days show here.' : undefined} />)}
              {next && <div className="flex justify-center pb-4"><Button variant="secondary" busy={loadingMore} onClick={more}>Show older posts</Button></div>}
              {posts.length > 0 && !next && <p className="pb-6 text-center text-footnote text-faint">You're all caught up</p>}
            </>
          );
        }}
      </Load>
      <OnePost id={postId} comment={sp.get('comment')} onClose={() => patch({ post: null, comment: null })} onPerson={openPerson} onChanged={reload} />
      <PersonSheet userId={sheetPerson} onClose={() => setSheetPerson(null)} />
    </div>
  );
}

/** A single post opened from a notification link (?post=…&comment=…). */
function OnePost({ id, comment, onClose, onPerson, onChanged }) {
  const q = useApi('everyday.post', { id }, { skip: !id });
  return (
    <Sheet open={!!id} onClose={onClose} title="Post" size="lg">
      {id && (q.error ? (
        <ErrorBox error={q.error.status === 404 ? { message: 'This post has been removed.' } : q.error} retry={q.error.status === 404 ? undefined : q.reload} />
      ) : !q.data ? <Spinner /> : (
        <PostCard post={q.data} full highlightComment={comment} onPerson={(p) => { onClose(); onPerson(p); }} onChanged={() => { onChanged(); q.reload(); }} />
      ))}
    </Sheet>
  );
}
