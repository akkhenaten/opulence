import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Megaphone, MessagesSquare, Pencil, Trash2, X } from 'lucide-react';
import {
  Button, dateTime, dayLabel, Empty, isoDate, KV, List, Load, mondayOf, Page, Pill, range, relative, Row, Segmented, Sheet, Textarea, Toggle, useAction, useApi, useUrlState,
} from '../../ui/index.jsx';
import { api } from '../../api.js';
import { useBase } from './_parts.jsx';
import { ChangeSheet, describeChange, isFilled, RepeatTag, statusOf } from './_cover.jsx';

const FILTERS = {
  pending: (c) => c.status === 'pending' || c.change_status === 'pending',
  accepted: (c) => c.status === 'accepted' && !isFilled(c),
  filled: isFilled,
  declined: (c) => c.status === 'declined' || c.status === 'cancelled',
  all: () => true,
};

// Dates of one repeating request with the same status show as one row
function group(list) {
  const out = [];
  const at = {};
  for (const c of list) {
    const key = c.kind === 'recurring' && c.change_status !== 'pending' ? `${c.series_id}:${statusOf(c)}` : c.id;
    if (at[key] != null) out[at[key]].dates.push(c);
    else { at[key] = out.length; out.push({ key, first: c, dates: [c] }); }
  }
  return out;
}

export default function Cover() {
  const { base } = useBase();
  const q = useApi('cover.list', {});
  const [url, setUrl] = useUrlState({ tab: 'pending' });
  const tab = FILTERS[url.tab] ? url.tab : 'pending';
  const [openKey, setOpenKey] = useState(null);
  const rows = q.data || [];
  const n = (k) => rows.filter(FILTERS[k]).length;
  // The drawer steps through the rows of the tab in view
  const shown = group(rows.filter(FILTERS[tab]));
  const at = shown.findIndex((g) => g.key === openKey);
  const open = at >= 0 ? shown[at] : null;

  return (
    // The status switch sits on the tab line, so the list starts high
    <Page title="Cover requests" subtitle="Venues asking for extra officers" tools={(
      <Segmented value={tab} onChange={(v) => setUrl({ tab: v })} options={[
          { value: 'pending', label: 'To decide', count: n('pending') }, { value: 'accepted', label: 'Staffing' }, { value: 'filled', label: 'Filled' },
          { value: 'declined', label: 'Declined' }, { value: 'all', label: 'All' },
      ]} />
    )}>
      <Load q={q}>{() => {
        const list = shown;
        if (!list.length) return <Empty icon={Megaphone} title={tab === 'pending' ? 'Nothing to decide' : 'Nothing here'} body={tab === 'pending' ? 'New requests and changes from venues appear here.' : undefined} />;
        return (
          <List>
            {list.map(({ key, first: c, dates }) => (
              <Row key={key} onClick={() => setOpenKey(key)} chevron
                title={<>{c.venue_name} <span className="font-normal text-muted">· {c.headcount} × {c.role_name}</span></>}
                subtitle={<>{dayLabel(c.starts_at)} <span className="num">{range(c.starts_at, c.ends_at)}</span>{dates.length > 1 ? ` · +${dates.length - 1} more date${dates.length > 2 ? 's' : ''}` : ''}{c.requested_by_name ? ` · ${c.requested_by_name}` : ''}</>}
                right={(
                  <div className="flex flex-col items-end gap-1">
                    {c.change_status === 'pending' ? <Pill tone="amber">Change asked</Pill> : <Pill status={statusOf(c)} />}
                    {c.status === 'accepted' && dates.length === 1 ? <span className="num text-caption text-muted">{c.filled}/{c.headcount} staffed</span> : <RepeatTag c={c} short />}
                  </div>
                )} />
            ))}
          </List>
        );
      }}</Load>
      {open && <Detail key={open.key} c={open.first} dates={open.dates} base={base} onClose={() => setOpenKey(null)} onDone={() => { setOpenKey(null); q.reload(); }}
        onPrev={at > 0 ? () => setOpenKey(shown[at - 1].key) : undefined}
        onNext={at < shown.length - 1 ? () => setOpenKey(shown[at + 1].key) : undefined} />}
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

  if (mode === 'edit' || mode === 'delete') return <ChangeSheet c={c} mode={mode} isMgr onClose={() => setMode(null)} onDone={onDone} />;

  const changeAsked = c.change_status === 'pending';
  const live = ['pending', 'accepted'].includes(c.status) && new Date(c.starts_at) > new Date();
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
          {live && !changeAsked && !mode && <Button variant="ghost" icon={Trash2} onClick={() => setMode('delete')}>Cancel cover</Button>}
        </div>
      </div>
    </Sheet>
  );
}
