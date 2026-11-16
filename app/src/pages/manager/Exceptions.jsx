import { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Check, History, Inbox, ListChecks, ShieldCheck, Smartphone, X } from 'lucide-react';
import {
  ActionBar, Avatar, Button, Check as Tick, cx, dayLabel, Empty, List, Load, Page, Pill, range, relative, Row, Section, Segmented, Sheet, time, useAction, useApi, useConfirm, useSelect,
} from '../../ui/index.jsx';
import { api } from '../../api.js';
import { SELF_HINT, SelfPills, useBase } from './_parts.jsx';
import { ProofFlags, SelfieCompare } from './_proof.jsx';
import { useRotaCounts } from './_rotaCounts.js';

const KIND = { in: 'Clock-in', out: 'Clock-out', break_start: 'Break start', break_end: 'Break end' };

export default function Exceptions() {
  const [sp, setSp] = useSearchParams();
  const { base } = useBase();
  const tabCounts = useRotaCounts();
  const tab = sp.get('tab') === 'decided' ? 'decided' : 'open';
  const setTab = (t) => setSp(t === 'open' ? {} : { tab: t }, { replace: true });
  const q = useApi('clock.exceptions', { include_decided: tab === 'decided' }, { skip: sp.get('tab') === 'phones' });
  const [run] = useAction();
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState(null);
  const [rejecting, setRejecting] = useState(false);
  const [runMany, busyMany] = useAction();
  const open = tab === 'open' ? (q.data || []).filter((e) => e.status === 'exception' && !e.self_locked) : [];
  // Ctrl/Shift+click, Ctrl+A and Esc pick events the way they pick files
  const pick = useSelect({ ids: open.map((e) => e.id) });
  const { picking } = pick;
  const chosen = open.filter((e) => pick.has(e.id));
  const toggle = (id, e) => { if (!(e && pick.click(e, id))) pick.toggle(id); };
  const stopPicking = () => { pick.stop(); setRejecting(false); };
  const changeTab = (t) => { stopPicking(); setTab(t); };

  // Several at once: the same per-event decision, one after another, then one refresh
  const decideMany = (approve) => runMany(async () => {
    let done = 0;
    for (const e of chosen) {
      try { await api('clock.decide', { id: e.id, approve }); done += 1; } catch { /* counted below */ }
    }
    return done;
  }, (done) => `${done} ${approve ? 'approved' : 'rejected'}${done < chosen.length ? `, ${chosen.length - done} failed` : ''}`)
    .then(() => { stopPicking(); q.reload(); }).catch(() => {});

  const decide = async (e, approve) => {
    if (!approve && !(await confirm({ title: `Reject ${e.officer_name}'s ${KIND[e.kind]?.toLowerCase() || 'clock event'}?`, body: 'The event will not count towards their timesheet. You can set the times by hand from Live.', confirm: 'Reject', danger: true }))) return;
    setBusyId(e.id);
    run(() => api('clock.decide', { id: e.id, approve }), approve ? 'Approved' : 'Rejected').then(() => q.reload()).catch(() => {}).finally(() => setBusyId(null));
  };

  // Phone changes moved to Staff → Phones
  if (sp.get('tab') === 'phones') return <Navigate to={`${base}/staff/phones`} replace />;
  return (
    <Page title="Exceptions" subtitle="Clock events that failed a check: phone, location, venue code or selfie" tabCounts={tabCounts}
      actions={open.length > 1 && (picking
        ? <Button variant="secondary" onClick={stopPicking}>Done</Button>
        : <Button variant="secondary" icon={ListChecks} onClick={pick.start}>Select</Button>)}
      tools={<Segmented value={tab} onChange={changeTab} options={[
        { value: 'open', label: 'To review', icon: Inbox, count: tab === 'open' ? q.data?.length : undefined }, { value: 'decided', label: 'History', icon: History },
      ]} />}>
      <Load q={q}>{(rows) => {
        const list = tab === 'decided' ? rows.filter((r) => r.status !== 'exception') : rows;
        if (!list.length) return <Empty icon={ShieldCheck} title={tab === 'open' ? 'All clear' : 'No decisions yet'} body={tab === 'open' ? 'No clock exceptions waiting for review.' : undefined} />;
        return (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {list.map((e) => {
              const can = picking && e.status === 'exception' && !e.self_locked;
              const on = pick.has(e.id);
              return (
              <div key={e.id} onClick={can ? (ev) => toggle(e.id, ev) : undefined}
                className={cx('rounded-tile border bg-surface p-4 shadow-tile sm:p-5', on ? 'border-blue ring-1 ring-blue' : 'border-hairline', can && 'cursor-pointer select-none')}>
                <div className="flex items-start gap-3">
                  {can && <Tick round checked={on} onChange={(_, ev) => toggle(e.id, ev)} label={`Select ${e.officer_name}`} className="mt-2.5" />}
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
                    {e.self_locked ? <span className="text-caption text-muted">{SELF_HINT}</span> : !picking && <div className="flex gap-2">
                      <Button size="sm" variant="secondary" icon={X} disabled={busyId === e.id} onClick={() => decide(e, false)}>Reject</Button>
                      <Button size="sm" icon={Check} busy={busyId === e.id} onClick={() => decide(e, true)}>Approve</Button>
                    </div>}
                  </div>
                ) : (
                  <p className="mt-3 text-caption text-muted">{e.status === 'approved' ? 'Approved' : 'Rejected'}{e.decided_by_name ? ` by ${e.decided_by_name}` : ''}{e.decided_at ? `, ${relative(e.decided_at)}` : ''}</p>
                )}
              </div>
              );
            })}
          </div>
        );
      }}</Load>
      <ActionBar show={picking && chosen.length > 0}>
        <span className="num pr-1 text-subhead font-semibold">{chosen.length} selected</span>
        <Button size="sm" variant="secondary" icon={X} disabled={busyMany} onClick={() => setRejecting(true)}>Reject {chosen.length}</Button>
        <Button size="sm" icon={Check} busy={busyMany && !rejecting} disabled={busyMany} onClick={() => decideMany(true)}>Approve {chosen.length}</Button>
      </ActionBar>
      <Sheet open={rejecting} onClose={() => !busyMany && setRejecting(false)} title={`Reject ${chosen.length} clock event${chosen.length === 1 ? '' : 's'}?`} size="sm"
        footer={<><Button variant="secondary" disabled={busyMany} onClick={() => setRejecting(false)}>Cancel</Button><Button variant="danger" busy={busyMany} onClick={() => decideMany(false)}>Reject {chosen.length}</Button></>}>
        <p className="text-body text-muted">{[...new Set(chosen.map((e) => e.officer_name))].join(', ')}</p>
        <p className="mt-2 text-subhead text-muted">These events will not count towards the officers' timesheets. You can set the times by hand from Live.</p>
      </Sheet>
    </Page>
  );
}

/** Staff → Phones: officers asking to clock in on a different phone, and those with none yet */
export function PhonesPage() {
  const phones = useApi('device.list', { pending: true });
  return (
    <Page title="Phones" subtitle="The phone each officer clocks in with. It proves where they clocked in and doesn't affect whether they can work.">
      <Phones q={phones} />
      <NotRegistered />
    </Page>
  );
}

// Active officers with no clock-in phone yet: they're prompted on Home, this is for chasing
function NotRegistered() {
  const q = useApi('officers.list', { status: 'active' });
  const { base } = useBase();
  const rows = (q.data || []).filter((o) => !o.has_phone);
  if (!rows.length) return null;
  return (
    <Section title="Not registered" icon={Smartphone} count={rows.length} className="mt-6">
      <p className="mb-3 px-1 text-subhead text-muted">Active officers without a clock-in phone. Their clock-ins show "Phone not verified" until they register one.</p>
      <List>
        {rows.map((o) => (
          <Row key={o.id} to={`${base}/staff/${o.id}`} chevron left={<Avatar name={o.name} src={o.photo_url} size={36} />} title={o.name}
            subtitle={!o.user_id ? 'No app login yet' : o.last_login ? `Last signed in ${relative(o.last_login)}` : "Hasn't signed in yet"} />
        ))}
      </List>
    </Section>
  );
}

// Officers asking to clock in on a different phone
function Phones({ q }) {
  const { base } = useBase();
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
                {d.officer_id ? <Link to={`${base}/staff/${d.officer_id}`} className="block truncate text-callout font-semibold hover:underline">{d.officer_name}</Link> : <div className="truncate text-callout font-semibold">{d.officer_name}</div>}
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
