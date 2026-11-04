import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import { api } from '../../api.js';
import { Avatar, Button, Empty, ErrorBox, Pressable, Segmented, Spinner, useToast } from '../../ui/index.jsx';
import PostCard from './PostCard.jsx';
import { ROLE_LABEL, whenText } from './_parts.jsx';

/** Someone's Everyday page: who they are, shout-out badges, their posts and posts they're in */
export default function Profile({ userId, onBack, onPerson, onPost }) {
  const toast = useToast();
  const [tab, setTab] = useState('posts');
  const [d, setD] = useState(null);
  const [posts, setPosts] = useState([]);
  const [next, setNext] = useState(null);
  const [error, setError] = useState(null);
  const [more, setMore] = useState(false);
  const load = async (before) => {
    const r = await api('everyday.profile', { user_id: userId, tab, before, full: true });
    return r;
  };
  const reload = () => {
    setError(null);
    load().then((r) => { setD(r); setPosts(r.posts); setNext(r.next); }).catch(setError);
  };
  useEffect(() => { setD(null); setTab('posts'); }, [userId]);
  useEffect(() => { setPosts([]); reload(); }, [userId, tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const older = async () => {
    setMore(true);
    try { const r = await load(next); setPosts((p) => [...p, ...r.posts]); setNext(r.next); } catch (e) { toast(e.message, 'error'); } finally { setMore(false); }
  };
  if (error) return <ErrorBox error={error} retry={reload} />;
  return (
    <div className="space-y-4">
      <Pressable press onClick={onBack} className="flex items-center gap-1.5 text-subhead font-semibold text-blue"><ArrowLeft size={18} /> Back to the feed</Pressable>
      {!d ? <Spinner /> : (
        <>
          <div className="rounded-tile bg-surface p-5 text-center shadow-tile">
            <Avatar name={d.person.name} src={d.person.photo_url} size={96} className="mx-auto" />
            <h2 className="mt-3 text-title2 font-bold">{d.person.name}</h2>
            <div className="text-subhead text-muted">{ROLE_LABEL[d.person.role]} · with the team since {d.since}</div>
            <div className="text-footnote text-faint">{d.post_count} post{d.post_count === 1 ? '' : 's'}</div>
            {d.badges?.length > 0 && (
              <div className="mt-4 flex flex-wrap justify-center gap-1.5">
                {d.badges.map((b) => <span key={b.id} className="rounded-full bg-amber-soft px-3 py-1.5 text-footnote font-semibold">{b.emoji} {b.label}{b.count > 1 ? ` ×${b.count}` : ''}</span>)}
              </div>
            )}
            {d.events?.length > 0 && (
              <div className="mt-4 space-y-1.5 text-left">
                <div className="text-footnote font-semibold uppercase tracking-wide text-muted">Going to</div>
                {d.events.map((e) => (
                  <Pressable press key={e.post_id} onClick={() => onPost(e.post_id)} className="flex w-full items-center gap-2 rounded-xl bg-bg px-3 py-2 text-left text-subhead">
                    <CalendarDays size={16} className="text-red" /><span className="min-w-0 flex-1 truncate font-medium">{e.title}</span><span className="text-caption text-muted">{whenText(e.starts_at)}</span>
                  </Pressable>
                ))}
              </div>
            )}
          </div>
          <Segmented full value={tab} onChange={setTab} options={[{ value: 'posts', label: 'Posts' }, { value: 'tagged', label: `Posts with ${d.person.name.split(' ')[0]}` }]} />
          {posts.map((p) => <PostCard key={p.id} post={p} onChanged={reload} onPerson={onPerson} />)}
          {!posts.length && <Empty title={tab === 'posts' ? 'No posts yet' : 'Not in any posts yet'} />}
          {next && <div className="flex justify-center pb-4"><Button variant="secondary" busy={more} onClick={older}>Show older posts</Button></div>}
        </>
      )}
    </div>
  );
}
