import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, CircleX, Hourglass, Layers, Megaphone, MessagesSquare, Pencil, Trash2, UserCheck, UserPlus, X } from 'lucide-react';
import {
  Button, dateTime, dayLabel, Empty, isoDate, KV, Load, mondayOf, Page, Pill, range, relative, Segmented, Sheet, Textarea, Toggle, useAction, useApi, useUrlState,
} from '../../ui/index.jsx';
import { api } from '../../api.js';
import { useBase } from './_parts.jsx';
import { coverWaiting, useRotaCounts } from './_rotaCounts.js';
import { canCancel, canChange, ChangeRequest, describeChange, isFilled, RepeatTag, statusOf } from './_cover.jsx';
import { groupRequests, RequestCards, sortGroups } from './_requestCards.jsx';

const FILTERS = {
  pending: coverWaiting,
  accepted: (c) => c.status === 'accepted' && !isFilled(c),
  filled: isFilled,
  declined: (c) => c.status === 'declined' || c.status === 'cancelled',
  all: () => true,
};

export default function Cover() {
  const { base } = useBase();
  const q = useApi('cover.list', {});
  const tabCounts = useRotaCounts({ cover: q });
  const [url, setUrl] = useUrlState({ tab: 'pending', open: '' });
  const tab = FILTERS[url.tab] ? url.tab : 'pending';
  const [openId, setOpenId] = useState(null);
  const rows = q.data || [];
  const n = (k) => rows.filter(FILTERS[k]).length;
  // Tabs filter per date, then the dates gather into one card per request; the drawer steps through them in order
  const groups = sortGroups(groupRequests(rows.filter(FILTERS[tab])));
  const flat = groups.flatMap((g) => [...g.upcoming, ...g.folded]);
  const at = flat.findIndex((c) => c.id === openId);
  const open = at >= 0 ? flat[at] : null;
  // Accepting or declining "all dates" covers the other waiting dates of the same pattern
  const sameSeries = (c) => (c.kind === 'recurring' && c.change_status !== 'pending'
    ? flat.filter((x) => x.series_id === c.series_id && statusOf(x) === statusOf(c) && x.change_status !== 'pending') : [c]);
  // ?open=<date id> (from a venue's page) opens that date once the list is in
  useEffect(() => {
    if (!url.open || !q.data) return;
    if (flat.some((c) => c.id === url.open)) setOpenId(url.open);
    setUrl({ open: '' });
  }, [url.open, q.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const actions = (g) => {
    const ask = g.upcoming.find((c) => c.change_status === 'pending');
    const pend = g.upcoming.find((c) => c.status === 'pending' && c.change_status !== 'pending');
    return (
      <>
        {ask && <Button size="sm" variant="soft" icon={Check} onClick={() => setOpenId(ask.id)}>Review change</Button>}
        {pend && <Button size="sm" variant="soft" icon={Check} onClick={() => setOpenId(pend.id)}>Accept or decline</Button>}
        {g.conversation_id && <Button size="sm" variant="ghost" icon={MessagesSquare} to={`${base}/messages/${g.conversation_id}`}>Conversation</Button>}
      </>
    );
  };

  return (
    // The status switch sits on the tab line, so the list starts high
    <Page title="Venue requests" subtitle="Venues asking for officers: answer each date or the whole request" tabCounts={tabCounts} tools={(
      <Segmented value={tab} onChange={(v) => setUrl({ tab: v })} options={[
          { value: 'pending', label: 'To decide', icon: Hourglass, count: n('pending') }, { value: 'accepted', label: 'Being staffed', icon: UserPlus }, { value: 'filled', label: 'Staffed', icon: UserCheck },
          { value: 'declined', label: 'Declined', icon: CircleX }, { value: 'all', label: 'All', icon: Layers },
      ]} />
    )}>
      <Load q={q}>{() => {
        if (!groups.length) return <Empty icon={Megaphone} title={tab === 'pending' ? 'Nothing to decide' : 'Nothing here'} body={tab === 'pending' ? 'New requests and changes from venues appear here.' : undefined} />;
        return <RequestCards key={tab} office groups={groups} onOpen={(c) => setOpenId(c.id)} actions={actions} />;
      }}</Load>
      {open && <Detail key={open.id} c={open} dates={sameSeries(open)} base={base} onClose={() => setOpenId(null)} onDone={() => { setOpenId(null); q.reload(); }}
        onPrev={at > 0 ? () => setOpenId(flat[at - 1].id) : undefined}
        onNext={at < flat.length - 1 ? () => setOpenId(flat[at + 1].id) : undefined} />}
    </Page>
  );
}

// The created shift when the list knows it, otherwise the week it falls in
const rotaLink = (base, c) => (c.shift_id ? `${base}/rota?shift=${c.shift_id}` : `${base}/rota?week=${mondayOf(isoDate(c.starts_at))}`);

function Detail({ c, dates, base, onClose, onDone, onPrev, onNext }) {
  const nav = useNavigate();
  const [mode, setMode] = useState(null); // 'accept' | 'decline' | 'edit' | 'delete' | 'refuse'
  const [scope, setScope] = useState(dates.length > 1 ? 'series' : 'one');
  const [asOpen, setAsOpen] = useState(true);
  const [reason, setReason] = useState('');
  const [run, busy] = useAction();
  const series = c.kind === 'recurring';
  const many = scope === 'series' && series;
  // Accepting goes straight on to staffing the (first) new shift
  const accept = () => run(() => api('cover.accept', { id: c.id, open: asOpen, scope: many ? 'series' : 'one' }), many ? 'All dates accepted' : 'Accepted, shift created')
    .then((r) => {
      const id = r?.id || r?.shift_ids?.[0];
      if (id) nav(`${base}/rota?shift=${id}&assign=1&week=${mondayOf(isoDate(r.starts_at || c.starts_at))}`); else onDone();
    }).catch(() => {});
  const decline = () => run(() => api('cover.decline', { id: c.id, reason: reason.trim(), scope: many ? 'series' : 'one' }), 'Declined').then(onDone).catch(() => {});
  const decide = (approve) => run(() => api('cover.decideChange', { id: c.id, approve, reason: reason.trim() }), approve ? 'Change approved' : 'Change declined').then(onDone).catch(() => {});

  if (mode === 'edit' || mode === 'delete') return <ChangeRequest edit={[c]} onClose={() => setMode(null)} onDone={onDone} />;

  const changeAsked = c.change_status === 'pending';
  const live = canChange(c);
  let footer = null;
  if (changeAsked) {
    footer = mode === 'refuse'
      ? <><Button variant="secondary" onClick={() => setMode(null)}>Back</Button><Button variant="danger" busy={busy} onClick={() => decide(false)}>Decline change</Button></>
      : <><Button variant="secondary" icon={X} onClick={() => setMode('refuse')}>Decline</Button><Button icon={Check} busy={busy} onClick={() => decide(true)}>Approve change</Button></>;
  } else if (c.status === 'pending' && !mode) footer = <><Button variant="secondary" icon={X} onClick={() => setMode('decline')}>Decline</Button><Button icon={Check} onClick={() => setMode('accept')}>Accept</Button></>;
  else if (mode === 'accept') footer = <><Button variant="secondary" onClick={() => setMode(null)}>Back</Button><Button onClick={accept} busy={busy}>{many ? `Accept ${dates.length} dates` : 'Accept and create shift'}</Button></>;
  else if (mode === 'decline') footer = <><Button variant="secondary" onClick={() => setMode(null)}>Back</Button><Button variant="danger" onClick={decline} busy={busy}>Decline</Button></>;
  else if (c.status === 'accepted') footer = <><Button variant="secondary" onClick={() => setMode('edit')} icon={Pencil} disabled={!live}>Change</Button><Button to={rotaLink(base, c)}>Staff it in the rota</Button></>;

  return (
    <Sheet open side onClose={onClose} title={c.venue_name} footer={footer}
      onPrev={mode ? undefined : onPrev} onNext={mode ? undefined : onNext}>
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Pill status={statusOf(c)} />
          {c.status === 'accepted' && <span className="num text-footnote text-muted">{c.filled}/{c.headcount} staffed</span>}
          <RepeatTag c={c} />
        </div>
        {changeAsked && (
          <div className="rounded-2xl bg-amber-soft p-4 text-amber">
            <div className="text-footnote font-semibold uppercase tracking-wide">{c.change_by_name || 'The venue'} asked for a change</div>
            <p className="mt-1 text-body">{describeChange(c)}</p>
            <p className="mt-1 text-footnote">Approving updates the shifts and tells the officers already booked.</p>
          </div>
        )}
        <KV items={[
          ['Needed', `${c.headcount} × ${c.role_name}`],
          c.stream_name && ['Bill to', c.stream_name],
          ['When', <>{dayLabel(c.starts_at)}, <span className="num">{range(c.starts_at, c.ends_at)}</span></>],
          series && ['Pattern', c.pattern],
          dates.length > 1 && ['Dates', dates.map((d) => dayLabel(d.starts_at)).join(', ')],
          ['Requested by', c.requested_by_name ? `${c.requested_by_name}, ${relative(c.created_at)}` : relative(c.created_at)],
          ['Shifts created', c.status === 'accepted' ? String(c.shift_count) : null],
          ['Notes', c.notes],
          c.status === 'declined' && ['Decline reason', c.decline_reason],
        ]} />
        {(mode === 'accept' || mode === 'decline') && dates.length > 1 && (
          <Segmented full value={scope} onChange={setScope} options={[{ value: 'series', label: `All ${dates.length} dates` }, { value: 'one', label: 'Only the first date' }]} />
        )}
        {mode === 'accept' && (
          <div className="rounded-2xl bg-bg/70 p-4">
            <p className="mb-2 text-subhead text-muted">
              {many ? `Creates a published shift for each date${c.end_date ? '' : ', and new dates are booked automatically as the pattern rolls on'}. ` : `Creates a published shift for ${dateTime(c.starts_at)} with ${c.headcount} place${c.headcount > 1 ? 's' : ''}. `}
              The venue is told it is accepted.
            </p>
            <Toggle label="Offer as open shifts" hint="Officers can ask to work them from the app" checked={asOpen} onChange={setAsOpen} />
          </div>
        )}
        {(mode === 'decline' || mode === 'refuse') && <Textarea label="Reason for the venue" rows={3} placeholder="e.g. No licensed officers free at that time" value={reason} onChange={(e) => setReason(e.target.value)} />}
        <div className="flex flex-wrap gap-2">
          {c.conversation_id && <Button variant="soft" icon={MessagesSquare} to={`${base}/messages/${c.conversation_id}`}>Conversation with the venue</Button>}
          {live && !changeAsked && c.status === 'pending' && !mode && <Button variant="ghost" icon={Pencil} onClick={() => setMode('edit')}>Change</Button>}
          {canCancel(c) && !mode && <Button variant="ghost" icon={Trash2} onClick={() => setMode('delete')}>Cancel request</Button>}
        </div>
      </div>
    </Sheet>
  );
}
