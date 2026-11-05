import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Camera, ChevronRight, FilePen, MapPin, Plus, ShieldAlert, Trash2 } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Button, cx, dateTime, dayLabel, Empty, IconButton, List, Load, Page, Pill, SearchInput, Section, Segmented, Select, time, useAction, useApi, useConfirm } from '../../ui/index.jsx';
import { clearLocal } from '../officer/_draft.js';
import { INCIDENT_STATUS, INCIDENT_TYPES, LatePill, NotLinked, SEVERITIES, typeLabel } from '../officer/_parts.jsx';

const SEV_BAR = { low: 'bg-faint', medium: 'bg-amber', high: 'bg-red', critical: 'bg-red' };

export default function Incidents() {
  const { user } = useAuth();
  const base = `/${user.role}`;
  const officer = user.role === 'officer';
  const [sp, setSp] = useSearchParams();
  const f = { status: sp.get('status') || '', severity: sp.get('severity') || '', type: sp.get('type') || '', venue_id: sp.get('venue') || '' };
  const setF = (k, val) => {
    const n = new URLSearchParams(sp);
    if (val) n.set(k === 'venue_id' ? 'venue' : k, val); else n.delete(k === 'venue_id' ? 'venue' : k);
    setSp(n, { replace: true });
  };
  const [text, setText] = useState(sp.get('q') || '');
  const [search, setSearch] = useState(text);
  useEffect(() => { const t = setTimeout(() => setSearch(text.trim()), 300); return () => clearTimeout(t); }, [text]);

  const body = Object.fromEntries(Object.entries({ ...f, search }).filter(([, val]) => val));
  const q = useApi('incidents.list', body, { poll: 60000, skip: officer && !user.officer_id });
  const venues = useApi('venues.list', {}, { skip: officer });
  const counts = useApi('incidents.list', { status: 'changes_requested' }, { skip: officer && !user.officer_id });
  const toFix = counts.data?.length || 0;

  return (
    <Page title="Incidents" subtitle={officer ? 'Your incident reports' : undefined} wide={!officer}
      actions={((officer && user.officer_id) || ['company', 'security'].includes(user.role)) && <Button icon={Plus} to={`${base}/incidents/new`}>{officer ? 'Report' : 'Report incident'}</Button>}>
      {((officer && user.officer_id) || !officer) && <Drafts base={base} officer={officer} />}
      <div className="mb-3 space-y-2">
        <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Segmented value={f.status} onChange={(val) => setF('status', val)}
            options={[{ value: '', label: 'All' }, { value: 'submitted', label: officer ? 'Submitted' : 'To review' }, { value: 'changes_requested', label: 'Changes requested', count: toFix }, { value: 'closed', label: 'Closed' }]} />
        </div>
        <div className={cx('grid gap-2', officer ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4')}>
          <SearchInput className="col-span-2 lg:col-span-1" value={text} onChange={(e) => { setText(e.target.value); const n = new URLSearchParams(sp); if (e.target.value) n.set('q', e.target.value); else n.delete('q'); setSp(n, { replace: true }); }}
            placeholder="Search ref, description, police ref" aria-label="Search incidents" />
          <Select aria-label="Severity" value={f.severity} onChange={(e) => setF('severity', e.target.value)} options={[{ value: '', label: 'Any severity' }, ...SEVERITIES.map(({ value, label }) => ({ value, label }))]} />
          <Select aria-label="Type" value={f.type} onChange={(e) => setF('type', e.target.value)} options={[{ value: '', label: 'Any type' }, ...INCIDENT_TYPES]} />
          {!officer && (
            <Select aria-label="Venue" className="col-span-2 lg:col-span-1" value={f.venue_id} onChange={(e) => setF('venue_id', e.target.value)}
              options={[{ value: '', label: 'All venues' }, ...(venues.data || []).map((x) => ({ value: x.id, label: x.name }))]} />
          )}
        </div>
      </div>

      {officer && !user.officer_id ? <NotLinked /> : <Load q={q}>
        {(rows) => (!rows.length ? (
          <Empty photo="kit" icon={ShieldAlert} title={Object.keys(body).length ? 'No incidents match' : 'No incidents yet'}
            body={officer ? 'Report anything that happens on shift: ejections, injuries, damage, refusals.' : 'Incident reports from officers appear here.'}
            action={officer && user.officer_id && !Object.keys(body).length && <Button icon={Plus} to={`${base}/incidents/new`}>Report incident</Button>} />
        ) : (
          <div className={cx('grid gap-2', !officer && 'lg:grid-cols-2')}>
            {rows.map((r) => (
              <Link key={r.id} to={`${base}/incidents/${r.id}`}
                className="relative flex gap-3 overflow-hidden rounded-tile bg-surface p-4 pl-5 shadow-tile transition active:scale-[0.99]">
                <span className={cx('absolute inset-y-0 left-0 w-1.5', SEV_BAR[r.severity])} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-caption font-semibold text-muted">{r.ref} · {dateTime(r.occurred_at)}</div>
                      <div className="truncate text-headline font-bold">{typeLabel(r.type)}</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Pill status={r.status}>{INCIDENT_STATUS[r.status]}</Pill>
                      <Pill status={r.severity} />
                      <LatePill inc={r} />
                    </div>
                  </div>
                  <p className="mt-1 line-clamp-2 text-subhead text-muted">{r.description}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-footnote text-muted">
                    <span className="inline-flex items-center gap-1"><MapPin size={14} />{r.venue_name}{r.location ? ` · ${r.location}` : ''}</span>
                    {!officer && r.officer_name && <span>{r.officer_name}</span>}
                    {r.attachment_count > 0 && <span className="inline-flex items-center gap-1"><Camera size={14} />{r.attachment_count}</span>}
                  </div>
                  {r.status === 'changes_requested' && r.review_comment && (
                    <div className="mt-2 rounded-xl bg-amber-soft px-3 py-2 text-footnote font-medium text-amber line-clamp-2">{r.review_comment}</div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        ))}
      </Load>}
    </Page>
  );
}

// Reports the writer started and has not sent yet; only they see them
function Drafts({ base, officer }) {
  const q = useApi('incidents.drafts', {});
  const confirm = useConfirm();
  const [run] = useAction();
  // A manager who also works shifts sees each side's own drafts
  const rows = (q.data || []).filter((d) => d.manager === !officer);
  if (!rows.length) return null;
  const del = async (d) => {
    if (!(await confirm({ title: 'Delete this draft?', body: 'The draft and any photos added to it are deleted. This cannot be undone.', confirm: 'Delete', danger: true }))) return;
    run(() => api('incidents.draftDelete', { id: d.id }), 'Draft deleted').then(() => { clearLocal(d.id); q.reload(); }).catch(() => {});
  };
  return (
    <Section title="Your drafts" className="!mt-0 mb-5">
      <List>
        {rows.map((d) => (
          <div key={d.id} className="flex items-center gap-1 pr-2">
            <Link to={`${base}/incidents/new?draft=${d.id}`} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 transition-colors hover:bg-bg active:bg-fill">
              <FilePen size={20} className="shrink-0 text-amber" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="truncate text-body font-semibold">{d.type ? typeLabel(d.type) : 'Untitled report'}{d.venue_name ? ` · ${d.venue_name}` : ''}</div>
                <div className="truncate text-footnote text-muted">
                  {d.shift_starts_at ? `${dayLabel(d.shift_starts_at)} shift · ` : ''}Saved {dayLabel(d.updated_at)} {time(d.updated_at)} · {d.progress.done} of {d.progress.total} parts
                </div>
              </div>
              <ChevronRight size={18} className="shrink-0 text-faint" aria-hidden />
            </Link>
            <IconButton icon={Trash2} label="Delete draft" size="sm" onClick={() => del(d)} />
          </div>
        ))}
      </List>
    </Section>
  );
}
