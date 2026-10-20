import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Newspaper } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Button, Empty, ErrorBox, Load, Page, Sheet, Spinner, Tabs, useApi, useToast } from '../../ui/index.jsx';
import Composer from './Composer.jsx';
import Moderation from './Moderation.jsx';
import PostCard from './PostCard.jsx';
import { isMgr, PersonSheet } from './_parts.jsx';

export default function Feed() {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const mgr = isMgr(user);
  const tab = mgr && sp.get('tab') === 'moderation' ? 'moderation' : 'feed';
  const reports = useApi('everyday.reports', {}, { skip: !mgr });
  const open = reports.data?.reports?.length || 0;
  return (
    <Page title="Everyday" subtitle="News, photos and shout-outs from the team">
      {mgr && (
        <Tabs value={tab} onChange={(v) => setSp(v === 'feed' ? {} : { tab: v }, { replace: true })}
          tabs={[{ value: 'feed', label: 'Feed' }, { value: 'moderation', label: open ? `Moderation (${open})` : 'Moderation' }]} />
      )}
      {tab === 'feed' ? <Stream sp={sp} setSp={setSp} /> : <Moderation onChanged={reports.reload} />}
    </Page>
  );
}

function Stream({ sp, setSp }) {
  const toast = useToast();
  const q = useApi('everyday.feed', {});
  const [older, setOlder] = useState([]);
  const [next, setNext] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [person, setPerson] = useState(null);
  const postId = sp.get('post');

  useEffect(() => { api('everyday.seen').catch(() => {}); }, []);
  useEffect(() => { if (q.data) { setOlder([]); setNext(q.data.next); } }, [q.data]);

  const more = async () => {
    setLoadingMore(true);
    try {
      const r = await api('everyday.feed', { before: next });
      setOlder((o) => [...o, ...r.posts]);
      setNext(r.next);
    } catch (e) { toast(e.message, 'error'); } finally { setLoadingMore(false); }
  };
  const reload = () => q.reload();

  return (
    <div className="mx-auto max-w-[620px] space-y-4">
      <Load q={q}>
        {(d) => {
          const posts = [...d.posts, ...older];
          return (
            <>
              <Composer rulesAccepted={d.rules_accepted} onPosted={reload} />
              {d.pinned.map((p) => <PostCard key={`pin-${p.id}`} post={p} onChanged={reload} onPerson={setPerson} />)}
              {posts.map((p) => <PostCard key={p.id} post={p} onChanged={reload} onPerson={setPerson} />)}
              {!posts.length && !d.pinned.length && <Empty icon={Newspaper} title="Nothing posted yet" body="Be the first — say hello, share a win from your shift or welcome someone new." />}
              {next && <div className="flex justify-center pb-4"><Button variant="secondary" busy={loadingMore} onClick={more}>Show older posts</Button></div>}
              {posts.length > 0 && !next && <p className="pb-6 text-center text-[13px] text-faint">You're all caught up</p>}
            </>
          );
        }}
      </Load>
      <OnePost id={postId} comment={sp.get('comment')} onClose={() => setSp({}, { replace: true })} onPerson={setPerson} onChanged={reload} />
      <PersonSheet userId={person} onClose={() => setPerson(null)} />
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
