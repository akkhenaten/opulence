import { useState } from 'react';
import { Check, MapPin, QrCode, ShieldCheck, X } from 'lucide-react';
import {
  Avatar, Button, cx, dayLabel, Empty, Load, Page, Pill, range, relative, Tabs, time, useAction, useApi, useConfirm,
} from '../../ui/index.jsx';
import { api } from '../../api.js';

const KIND = { in: 'Clock-in', out: 'Clock-out', break_start: 'Break start', break_end: 'Break end' };

function Flag({ ok, icon: Icon, children }) {
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-caption font-semibold', ok ? 'bg-green-soft text-green' : 'bg-red-soft text-red')}>
      <Icon size={14} />{children}
    </span>
  );
}

export default function Exceptions() {
  const [tab, setTab] = useState('open');
  const q = useApi('clock.exceptions', { include_decided: tab === 'decided' });
  const [run] = useAction();
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState(null);

  const decide = async (e, approve) => {
    if (!approve && !(await confirm({ title: `Reject ${e.officer_name}'s ${KIND[e.kind]?.toLowerCase() || 'clock event'}?`, body: 'The event will not count towards their timesheet. You can set the times by hand from Live.', confirm: 'Reject', danger: true }))) return;
    setBusyId(e.id);
    run(() => api('clock.decide', { id: e.id, approve }), approve ? 'Approved' : 'Rejected').then(() => q.reload()).catch(() => {}).finally(() => setBusyId(null));
  };

  return (
    <Page title="Exceptions" subtitle="Clock events that failed the location or QR check">
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'open', label: 'To review', count: tab === 'open' ? q.data?.length : undefined }, { value: 'decided', label: 'History' }]} />
      <Load q={q}>{(rows) => {
        const list = tab === 'decided' ? rows.filter((r) => r.status !== 'exception') : rows;
        if (!list.length) return <Empty icon={ShieldCheck} title={tab === 'open' ? 'All clear' : 'No decisions yet'} body={tab === 'open' ? 'No clock exceptions waiting for review.' : undefined} />;
        return (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {list.map((e) => (
              <div key={e.id} className="rounded-tile border border-black/[0.04] bg-surface p-4 shadow-tile sm:p-5">
                <div className="flex items-start gap-3">
                  <Avatar name={e.officer_name} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <span className="truncate text-callout font-semibold">{e.officer_name}</span>
                      <span className="text-footnote text-muted">{KIND[e.kind] || e.kind} at <span className="num font-semibold text-ink">{time(e.ts)}</span></span>
                    </div>
                    <div className="truncate text-footnote text-muted">{e.venue_name} · {dayLabel(e.starts_at)} <span className="num">{range(e.starts_at, e.ends_at)}</span></div>
                  </div>
                  {e.status !== 'exception' && <Pill status={e.status} />}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(e.kind === 'in' || e.kind === 'out') && (
                    <Flag ok={e.geo_ok} icon={MapPin}>
                      {e.distance_m == null ? 'No location' : <span className="num">{Math.round(e.distance_m)}m away{e.radius_m ? ` · limit ${e.radius_m}m` : ''}</span>}
                    </Flag>
                  )}
                  {e.kind === 'in' && <Flag ok={e.qr_ok} icon={QrCode}>{e.qr_ok ? 'QR ok' : 'QR failed'}</Flag>}
                  {e.accuracy != null && <span className="num inline-flex items-center rounded-full bg-fill px-2.5 py-0.5 text-caption font-semibold text-muted">GPS ±{Math.round(e.accuracy)}m</span>}
                </div>
                {e.exception_reason && <p className="mt-3 rounded-2xl bg-bg/70 px-3.5 py-2.5 text-subhead">"{e.exception_reason}"</p>}
                {e.status === 'exception' ? (
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-caption text-faint">{relative(e.ts)}</span>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" icon={X} disabled={busyId === e.id} onClick={() => decide(e, false)}>Reject</Button>
                      <Button size="sm" icon={Check} busy={busyId === e.id} onClick={() => decide(e, true)}>Approve</Button>
                    </div>
                  </div>
                ) : (
                  <p className="mt-3 text-caption text-muted">{e.status === 'approved' ? 'Approved' : 'Rejected'}{e.decided_by_name ? ` by ${e.decided_by_name}` : ''}{e.decided_at ? `, ${relative(e.decided_at)}` : ''}</p>
                )}
              </div>
            ))}
          </div>
        );
      }}</Load>
    </Page>
  );
}
