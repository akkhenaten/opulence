import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, ShieldCheck, Smartphone, X } from 'lucide-react';
import {
  Avatar, Button, cx, dayLabel, Empty, Load, Page, Pill, range, relative, Tabs, time, useAction, useApi, useConfirm,
} from '../../ui/index.jsx';
import { api } from '../../api.js';
import { SELF_HINT, SelfPills } from './_parts.jsx';
import { ProofFlags, SelfieCompare } from './_proof.jsx';

const KIND = { in: 'Clock-in', out: 'Clock-out', break_start: 'Break start', break_end: 'Break end' };

export default function Exceptions() {
  const [sp, setSp] = useSearchParams();
  const tab = ['open', 'decided', 'phones'].includes(sp.get('tab')) ? sp.get('tab') : 'open';
  const setTab = (t) => setSp(t === 'open' ? {} : { tab: t }, { replace: true });
  const q = useApi('clock.exceptions', { include_decided: tab === 'decided' }, { skip: tab === 'phones' });
  const phones = useApi('device.list', { pending: true });
  const [run] = useAction();
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState(null);

  const decide = async (e, approve) => {
    if (!approve && !(await confirm({ title: `Reject ${e.officer_name}'s ${KIND[e.kind]?.toLowerCase() || 'clock event'}?`, body: 'The event will not count towards their timesheet. You can set the times by hand from Live.', confirm: 'Reject', danger: true }))) return;
    setBusyId(e.id);
    run(() => api('clock.decide', { id: e.id, approve }), approve ? 'Approved' : 'Rejected').then(() => q.reload()).catch(() => {}).finally(() => setBusyId(null));
  };

  return (
    <Page title="Exceptions" subtitle="Clock events that failed a check: phone, location, venue code or selfie">
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'open', label: 'To review', count: tab === 'open' ? q.data?.length : undefined }, { value: 'decided', label: 'History' },
        { value: 'phones', label: 'Phones', count: phones.data?.length || undefined },
      ]} />
      {tab === 'phones' ? <Phones q={phones} /> : <Load q={q}>{(rows) => {
        const list = tab === 'decided' ? rows.filter((r) => r.status !== 'exception') : rows;
        if (!list.length) return <Empty icon={ShieldCheck} title={tab === 'open' ? 'All clear' : 'No decisions yet'} body={tab === 'open' ? 'No clock exceptions waiting for review.' : undefined} />;
        return (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {list.map((e) => (
              <div key={e.id} className="rounded-tile border border-hairline bg-surface p-4 shadow-tile sm:p-5">
                <div className="flex items-start gap-3">
                  <Avatar name={e.officer_name} size={42} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2">
                      <span className="truncate text-callout font-semibold">{e.officer_name}</span>
                      <SelfPills row={e} small />
                      <span className="text-footnote text-muted">{KIND[e.kind] || e.kind} at <span className="num font-semibold text-ink">{time(e.ts)}</span></span>
                    </div>
                    <div className="truncate text-footnote text-muted">{e.venue_name} · {dayLabel(e.starts_at)} <span className="num">{range(e.starts_at, e.ends_at)}</span></div>
                  </div>
                  {e.status !== 'exception' && <Pill status={e.status} />}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <ProofFlags e={e} />
                  {e.accuracy != null && <span className="num inline-flex items-center rounded-full bg-fill px-2.5 py-0.5 text-caption font-semibold text-muted">GPS ±{Math.round(e.accuracy)}m</span>}
                </div>
                {e.selfie_url && <div className="mt-3"><SelfieCompare e={e} /></div>}
                {e.has_selfie === false && e.selfie_deleted_at && <p className="mt-2 text-caption text-faint">Selfie deleted after 90 days</p>}
                {e.exception_reason && <p className="mt-3 rounded-2xl bg-bg/70 px-3.5 py-2.5 text-subhead">"{e.exception_reason}"</p>}
                {e.status === 'exception' ? (
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <span className="text-caption text-faint">{relative(e.ts)}</span>
                    {e.self_locked ? <span className="text-caption text-muted">{SELF_HINT}</span> : <div className="flex gap-2">
                      <Button size="sm" variant="secondary" icon={X} disabled={busyId === e.id} onClick={() => decide(e, false)}>Reject</Button>
                      <Button size="sm" icon={Check} busy={busyId === e.id} onClick={() => decide(e, true)}>Approve</Button>
                    </div>}
                  </div>
                ) : (
                  <p className="mt-3 text-caption text-muted">{e.status === 'approved' ? 'Approved' : 'Rejected'}{e.decided_by_name ? ` by ${e.decided_by_name}` : ''}{e.decided_at ? `, ${relative(e.decided_at)}` : ''}</p>
                )}
              </div>
            ))}
          </div>
        );
      }}</Load>}
    </Page>
  );
}

// Officers asking to clock in on a different phone
function Phones({ q }) {
  const [run] = useAction();
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState(null);
  const decide = async (d, approve) => {
    if (approve && !(await confirm({ title: `Approve ${d.officer_name}'s new phone?`, body: `${d.label} becomes their clock-in phone${d.current_label ? ` and ${d.current_label} stops working` : ''}. Only approve it if you know they changed phone.`, confirm: 'Approve' }))) return;
    if (!approve && !(await confirm({ title: 'Reject this phone?', body: 'Clock-ins from it stay flagged for review.', confirm: 'Reject', danger: true }))) return;
    setBusyId(d.id);
    run(() => api('device.decide', { id: d.id, approve }), approve ? 'Phone approved' : 'Phone rejected').then(() => q.reload()).catch(() => {}).finally(() => setBusyId(null));
  };
  return (
    <Load q={q}>{(rows) => (!rows.length ? <Empty icon={Smartphone} title="No phone requests" body="When an officer registers a new phone, it waits here for a manager to approve it." /> : (
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {rows.map((d) => (
          <div key={d.id} className="rounded-tile border border-hairline bg-surface p-4 shadow-tile sm:p-5">
            <div className="flex items-start gap-3">
              <Avatar name={d.officer_name} size={42} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-callout font-semibold">{d.officer_name}</div>
                <div className="text-footnote text-muted">New phone: <b className="text-ink">{d.label}</b>{d.current_label ? ` · replaces ${d.current_label}` : ''}</div>
              </div>
              <span className="shrink-0 text-caption text-faint">{relative(d.created_at)}</span>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="secondary" icon={X} disabled={busyId === d.id} onClick={() => decide(d, false)}>Reject</Button>
              <Button size="sm" icon={Check} busy={busyId === d.id} onClick={() => decide(d, true)}>Approve</Button>
            </div>
          </div>
        ))}
      </div>
    ))}</Load>
  );
}
