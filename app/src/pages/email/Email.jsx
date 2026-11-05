import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Mail, RefreshCw, Settings, SquarePen, Star } from 'lucide-react';
import { Button, cx, Empty, IconButton, Load, Pressable, SearchInput, Segmented, Select, SkeletonPage, useAction, useApi } from '../../ui/index.jsx';
import { api } from '../../api.js';
import Composer from './Composer.jsx';
import Thread from './Thread.jsx';
import { ConnectButtons, ReconnectBanner } from './_settings.jsx';
import { BASE, emailChanged, FOLDERS, lastAccount, MatchChips, rememberAccount, whenLabel } from './_parts.jsx';

// Fills the screen under the top bar (and above the phone tab bar) so the list and the email scroll on their own
const FILL = 'h-[calc(100dvh-56px-var(--tabbar-h)-env(safe-area-inset-top))] lg:h-[calc(100dvh-56px-32px)]';

/** Connected mailboxes: the list on the left, the open email on the right (wide screens); one or the other on phones. */
export default function Email() {
  const { account: routeAccount, thread } = useParams();
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const accounts = useApi('email.accounts');
  const [compose, setCompose] = useState(sp.get('compose') ? { mode: 'new', to: sp.get('to') ? [sp.get('to')] : [] } : null);

  const list = accounts.data?.accounts || [];
  const acc = list.find((a) => a.id === (routeAccount || sp.get('a'))) || list.find((a) => a.id === lastAccount()) || list[0];
  const folder = FOLDERS.some((f) => f.value === sp.get('f')) ? sp.get('f') : 'inbox';
  useEffect(() => { if (acc) rememberAccount(acc.id); }, [acc?.id]);

  const go = useCallback((a, f, t) => {
    const qs = new URLSearchParams();
    if (!t && a) qs.set('a', a);
    if (f && f !== 'inbox') qs.set('f', f);
    nav(`${t ? `${BASE}/${a}/${t}` : BASE}${qs.toString() ? `?${qs}` : ''}`);
  }, [nav]);

  if (accounts.loading && !accounts.data) return <SkeletonPage />;
  if (!list.length) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <Load q={accounts}>
          {(d) => (
            <Empty icon={Mail} title="Connect your email"
              body="Read and answer your Gmail or Outlook here, next to your rota, staff and venues. Your mail stays with Google or Microsoft; nothing is copied to Orb."
              action={<ConnectButtons providers={d.providers} ready={d.ready} />} />
          )}
        </Load>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl lg:px-6 lg:pb-8">
      <div className={cx('flex overflow-hidden bg-surface lg:rounded-tile lg:border lg:border-hairline lg:shadow-tile', FILL)}>
        <aside className={cx('min-h-0 w-full flex-col lg:flex lg:w-[380px] lg:shrink-0 lg:border-r lg:border-line', thread ? 'hidden' : 'flex')}>
          <Inbox key={acc.id} acc={acc} accounts={list} folder={folder} current={thread}
            onAccount={(id) => go(id, folder)} onFolder={(f) => go(acc.id, f)} onOpen={(t) => go(acc.id, folder, t)}
            onCompose={() => setCompose({ mode: 'new' })} onAccountsChanged={accounts.reload} />
        </aside>
        <section className={cx('min-h-0 min-w-0 flex-1 flex-col', thread ? 'flex' : 'hidden lg:flex')}>
          {thread ? (
            <Thread key={`${acc.id}/${thread}`} account={acc} id={thread}
              onClose={() => go(acc.id, folder)} onChanged={() => { accounts.reload(); emailChanged(); window.dispatchEvent(new Event('orb:email-list')); }}
              onCompose={setCompose} />
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center text-muted">
              <div><Mail size={24} className="mx-auto mb-2 text-faint" /><div className="text-subhead">Pick an email to read it</div></div>
            </div>
          )}
        </section>
      </div>
      {compose && (
        <Composer init={compose} account={acc} accounts={list.filter((a) => a.status === 'connected')}
          onClose={() => { setCompose(null); if (sp.get('compose')) setSp({}, { replace: true }); }}
          onSent={() => { window.dispatchEvent(new Event('orb:email-list')); accounts.reload(); }} />
      )}
    </div>
  );
}

function Inbox({ acc, accounts, folder, current, onAccount, onFolder, onOpen, onCompose, onAccountsChanged }) {
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  useEffect(() => { const t = setTimeout(() => setTerm(search.trim()), 400); return () => clearTimeout(t); }, [search]);
  const body = { account_id: acc.id, folder, q: term || undefined };
  const q = useApi('email.list', body, { poll: 60000 });
  const [extra, setExtra] = useState({ threads: [], next: undefined });
  const [run, busy] = useAction();
  const key = JSON.stringify(body);
  useEffect(() => setExtra({ threads: [], next: undefined }), [key]);
  useEffect(() => {
    const h = () => q.reload();
    window.addEventListener('orb:email-list', h);
    return () => window.removeEventListener('orb:email-list', h);
  });

  const next = extra.next === undefined ? q.data?.next : extra.next;
  const more = () => run(async () => {
    const r = await api('email.list', { ...body, page: next });
    setExtra((s) => ({ threads: [...s.threads, ...r.threads], next: r.next || null }));
  });
  const refresh = () => run(async () => {
    q.setData(await api('email.list', { ...body, refresh: true }));
    setExtra({ threads: [], next: undefined });
    onAccountsChanged();
  });
  const seen = new Set();
  const threads = [...(q.data?.threads || []), ...extra.threads].filter((t) => !seen.has(t.id) && seen.add(t.id));
  const reconnect = acc.status !== 'connected' ? acc.id : q.error?.data?.reconnect;

  return (
    <>
      <div className="px-4 pb-2 pt-4">
        <div className="mb-3 flex items-center gap-1">
          <h1 className="min-w-0 flex-1 text-title1 font-bold">Email</h1>
          <IconButton icon={RefreshCw} label="Check for new email" onClick={refresh} disabled={busy} />
          <IconButton icon={Settings} label="Email settings" to="/company/settings?tab=email" />
          <IconButton icon={SquarePen} tone="solid" label="New email" onClick={onCompose} disabled={!!reconnect} />
        </div>
        {accounts.length > 1 && (
          <Select className="mb-2" aria-label="Mailbox" value={acc.id} onChange={(e) => onAccount(e.target.value)}
            options={accounts.map((a) => ({ value: a.id, label: `${a.address}${a.shared ? ' (shared)' : ''}${a.unread ? ` · ${a.unread}` : ''}` }))} />
        )}
        {accounts.length === 1 && <div className="mb-2 truncate text-footnote text-muted">{acc.address}{acc.shared ? ' · shared' : ''}</div>}
        <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${acc.address.split('@')[0]}`} />
        <div className="no-scrollbar -mx-4 mt-3 overflow-x-auto px-4"><Segmented value={folder} onChange={onFolder} options={FOLDERS} /></div>
      </div>
      {reconnect && <div className="px-4 pb-2"><ReconnectBanner acc={acc} /></div>}
      <div className="min-h-0 flex-1 overflow-y-auto pb-[calc(16px+var(--fab-room))]">
        {reconnect && !q.data ? null : (
          <Load q={q} skeleton="rows">
            {() => (threads.length ? (
              <>
                {threads.map((t) => <ThreadRow key={t.id} t={t} active={current === t.id} onOpen={() => onOpen(t.id)} />)}
                {next && <div className="px-4 pt-3"><Button variant="secondary" className="w-full" busy={busy} onClick={more}>Load more</Button></div>}
              </>
            ) : (
              <div className="px-4 pt-6">
                <Empty icon={Mail} title={term ? 'No matches' : folder === 'inbox' ? 'Inbox is empty' : 'Nothing here'} body={term ? 'Try other words, a name or an address.' : undefined} />
              </div>
            ))}
          </Load>
        )}
      </div>
    </>
  );
}

function ThreadRow({ t, active, onOpen }) {
  const who = t.from_name || t.from_addr;
  return (
    <Pressable onClick={onOpen} className={cx('flex gap-3 px-4 py-2.5', active && '!bg-blue-soft')}>
      <span className={cx('mt-2 h-2.5 w-2.5 shrink-0 rounded-full', t.unread ? 'bg-blue' : 'bg-transparent')} aria-label={t.unread ? 'Unread' : undefined} />
      <div className="min-w-0 flex-1 border-b border-line pb-2.5">
        <div className="flex items-baseline gap-2">
          <span className={cx('min-w-0 flex-1 truncate text-body', t.unread ? 'font-bold' : 'font-semibold')}>
            {who}{t.count > 1 && <span className="ml-1 text-footnote font-normal text-faint">{t.count}</span>}
          </span>
          {t.starred && <Star size={14} className="shrink-0 fill-amber text-amber" />}
          <span className={cx('shrink-0 text-caption', t.unread ? 'font-semibold text-blue' : 'text-faint')}>{whenLabel(t.last_at)}</span>
        </div>
        <div className={cx('truncate text-subhead', t.unread ? 'font-semibold text-ink' : 'text-ink')}>{t.subject || '(no subject)'}</div>
        <div className="line-clamp-2 text-footnote text-muted">{t.snippet}</div>
        <MatchChips matches={t.matches} link={false} className="mt-1" />
      </div>
    </Pressable>
  );
}
