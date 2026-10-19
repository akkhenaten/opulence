import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Camera, MapPin, Plus, Search, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../auth.jsx';
import { Button, cx, dateTime, Empty, Load, Page, Pill, Segmented, Select, useApi } from '../../ui/index.jsx';
import { INCIDENT_STATUS, INCIDENT_TYPES, NotLinked, SEVERITIES, typeLabel } from '../officer/_parts.jsx';

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
      actions={officer && user.officer_id && <Button icon={Plus} to={`${base}/incidents/new`}>Report</Button>}>
      <div className="mb-3 space-y-2">
        <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <Segmented value={f.status} onChange={(val) => setF('status', val)}
            options={[{ value: '', label: 'All' }, { value: 'submitted', label: officer ? 'Submitted' : 'To review' }, { value: 'changes_requested', label: 'Changes requested', count: toFix }, { value: 'closed', label: 'Closed' }]} />
        </div>
        <div className={cx('grid gap-2', officer ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-4')}>
          <label className="relative col-span-2 lg:col-span-1">
            <Search size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
            <input type="search" value={text} onChange={(e) => { setText(e.target.value); const n = new URLSearchParams(sp); if (e.target.value) n.set('q', e.target.value); else n.delete('q'); setSp(n, { replace: true }); }}
              placeholder="Search ref, description, police ref" aria-label="Search incidents"
              className="h-11 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-[15px] outline-none focus:border-blue focus:ring-4 focus:ring-blue/10" />
          </label>
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
          <Empty icon={ShieldAlert} title={Object.keys(body).length ? 'No incidents match' : 'No incidents yet'}
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
                      <div className="text-[12px] font-semibold text-muted">{r.ref} · {dateTime(r.occurred_at)}</div>
                      <div className="truncate text-[17px] font-bold">{typeLabel(r.type)}</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Pill status={r.status}>{INCIDENT_STATUS[r.status]}</Pill>
                      <Pill status={r.severity} />
                    </div>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[14px] text-muted">{r.description}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                    <span className="inline-flex items-center gap-1"><MapPin size={13} />{r.venue_name}{r.location ? ` · ${r.location}` : ''}</span>
                    {!officer && r.officer_name && <span>{r.officer_name}</span>}
                    {r.attachment_count > 0 && <span className="inline-flex items-center gap-1"><Camera size={13} />{r.attachment_count}</span>}
                  </div>
                  {r.status === 'changes_requested' && r.review_comment && (
                    <div className="mt-2 rounded-xl bg-amber-soft px-3 py-2 text-[13px] font-medium text-amber line-clamp-2">{r.review_comment}</div>
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
