import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Check as CheckIcon, Download, FileText, Lock, RefreshCw, Send } from 'lucide-react';
import { api, downloadAction } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  ActionBar, Avatar, Button, Chip, cx, date, dateShort, Empty, hours, isoDate, List, Load, money, Page, Pill, Section, Segmented, Select, Tile, ToolField, ToolMenu, useAction, useApi, useConfirm, useMedia, useUrlState,
} from '../../ui/index.jsx';
import { Check, useBase } from './_parts.jsx';
import { RunsList } from './PayRuns.jsx';

const periodLabel = (s) => `${dateShort(s.period_start)} – ${date(s.period_end)}`;

export default function Pay() {
  const { user } = useAuth();
  const isCo = user.role === 'company';
  if (user.role === 'security' && !user.can_see_pay) {
    return <Page title="Pay runs"><Empty icon={Lock} title="No access to pay" body="Ask a company manager to give you access to pay information." /></Page>;
  }
  return <PayInner isCo={isCo} />;
}

function PayInner({ isCo }) {
  const list = useApi('pay.list', {});
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || (isCo ? 'draft' : 'issued');
  const setStatus = (s) => setParams((p) => { const n = new URLSearchParams(p); n.set('status', s); return n; }, { replace: true });
  const [runsKey, setRunsKey] = useState(0);
  // A status in the address with no tab means statements were asked for
  const [url, setUrl] = useUrlState({ tab: '' });
  const tab = url.tab || (params.get('status') ? 'statements' : 'runs');

  const rows = list.data || [];
  const [period, setPeriod] = useState('');
  const wide = useMedia('(min-width: 640px)');
  const periods = useMemo(() => {
    const m = new Map();
    for (const r of rows) m.set(r.period_start, r);
    return [...m.values()].sort((a, b) => (a.period_start < b.period_start ? 1 : -1));
  }, [rows]);
  const inPeriod = rows.filter((r) => !period || r.period_start === period);
  const count = (s) => inPeriod.filter((r) => r.status === s).length;

  // Totals, the runs/statements switch and the statement filters sit on the tab line, so the list starts high
  const statusSwitch = <Segmented value={status} onChange={setStatus} options={[
    { value: 'draft', label: 'Draft', count: count('draft') }, { value: 'issued', label: 'Issued', count: count('issued') },
    { value: 'paid', label: 'Paid' }, { value: 'all', label: 'All' },
  ].filter((o) => isCo || o.value !== 'draft')} />;
  const periodPick = periods.length > 0 && <Select aria-label="Pay period" className="min-w-[200px]" value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="All periods"
    options={periods.map((p) => ({ value: p.period_start, label: periodLabel(p) }))} />;
  const tools = list.data && <>
    <Totals rows={rows} />
    <Segmented value={tab} onChange={(v) => setUrl({ tab: v })} options={[
      { value: 'runs', label: 'Pay runs' },
      // The count is what needs doing: drafts to issue for the company, statements awaiting payment otherwise
      { value: 'statements', label: 'Statements', count: rows.filter((r) => r.status === (isCo ? 'draft' : 'issued')).length },
    ]} />
    {tab === 'statements' && <>
      {statusSwitch}
      {periodPick && (wide ? periodPick : <ToolMenu count={period ? 1 : 0} onClear={() => setPeriod('')}><ToolField label="Pay period">{periodPick}</ToolField></ToolMenu>)}
    </>}
  </>;

  return (
    <Page title="Pay runs" subtitle="Remittance statements for self-employed officers" tools={tools}>
      <Load q={list}>
        {() => tab === 'statements' ? <Statements key={`${status}|${period}`} rows={inPeriod} isCo={isCo} status={status} period={period} reload={list.reload} /> : (
          <>
            {isCo && <RunTile onDone={() => { list.reload(); setRunsKey((k) => k + 1); }} />}
            <RunsList reloadKey={runsKey} />
          </>
        )}
      </Load>
    </Page>
  );
}

// Totals as chips, only the ones with something in them: drafts, to pay, paid this month and hours in drafts
function Totals({ rows }) {
  const sum = (st) => rows.filter((r) => r.status === st).reduce((a, r) => a + Number(r.total), 0);
  const cnt = (st) => rows.filter((r) => r.status === st).length;
  const month = isoDate().slice(0, 7);
  const paidMonth = rows.filter((r) => r.status === 'paid' && r.paid_at && isoDate(r.paid_at).slice(0, 7) === month);
  const draftHours = rows.filter((r) => r.status === 'draft').reduce((a, r) => a + Number(r.hours), 0);
  return <>
    {cnt('draft') > 0 && <Chip value={money(sum('draft'))} label={`in ${cnt('draft')} draft${cnt('draft') === 1 ? '' : 's'}`} />}
    {cnt('issued') > 0 && <Chip value={money(sum('issued'))} label={`to pay (${cnt('issued')})`} tone="blue" />}
    {paidMonth.length > 0 && <Chip value={money(paidMonth.reduce((a, r) => a + Number(r.total), 0))} label="paid this month" tone="green" />}
    {draftHours > 0 && <Chip value={hours(draftHours)} label="in drafts" />}
  </>;
}

// Draft pay runs fill themselves from approved timesheets (one per pay period); this tile explains that and can catch up straight away
function RunTile({ onDone }) {
  const sug = useApi('pay.suggestPeriod');
  const [run, busy] = useAction();
  const nav = useNavigate();
  const base = useBase();
  const refresh = async () => {
    const res = await run(() => api('pay.generate', {}), (x) => `Up to date · ${x.created} draft statement${x.created === 1 ? '' : 's'}`).catch(() => null);
    if (!res) return;
    onDone();
    if (res.pay_run_id) nav(`${base}/pay/runs/${res.pay_run_id}`);
  };
  return (
    <Tile title="Live pay run" icon={RefreshCw} className="mb-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 basis-64 text-subhead text-muted">
          Approved shifts go straight onto each officer's draft statement in the pay run for their period{sug.data ? ` (${sug.data.pay_period || 'weekly'})` : ''}, and follow any later change.
          Only shifts the venue has signed off are paid; the rest move to the next run when you send it for review.
        </p>
        <Button variant="secondary" icon={RefreshCw} busy={busy} onClick={refresh}>Bring up to date</Button>
      </div>
    </Tile>
  );
}

// Remounted when the status or period changes, so the selection starts empty
function Statements({ rows: inPeriod, isCo, status, period, reload }) {
  const base = useBase();
  const confirm = useConfirm();
  const [run, busy] = useAction();
  const [csv, csvBusy] = useAction();
  const [sel, setSel] = useState(() => new Set());

  const shown = inPeriod.filter((r) => status === 'all' || r.status === status);
  const selected = shown.filter((r) => sel.has(r.id));
  const drafts = selected.filter((r) => r.status === 'draft');
  const issued = selected.filter((r) => r.status === 'issued');
  const exportable = selected.filter((r) => r.status !== 'draft');
  const allOn = shown.length > 0 && selected.length === shown.length;
  const toggle = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const total = (list) => money(list.reduce((a, r) => a + Number(r.total), 0));

  const issue = async () => {
    if (!(await confirm({ title: `Issue ${drafts.length} statement${drafts.length === 1 ? '' : 's'}?`, body: `${total(drafts)} in total. Each officer is emailed their remittance statement. Issued statements cannot be edited.`, confirm: 'Issue' }))) return;
    await run(() => api('pay.issue', { ids: drafts.map((r) => r.id) }), (x) => `${x.issued} issued`).catch(() => {});
    setSel(new Set()); reload();
  };
  const markPaid = async () => {
    if (!(await confirm({ title: `Mark ${issued.length} as paid?`, body: `${total(issued)} in total. Officers are told their payment is on its way.`, confirm: 'Mark paid' }))) return;
    await run(() => api('pay.markPaid', { ids: issued.map((r) => r.id) }), (x) => `${x.paid} marked paid`).catch(() => {});
    setSel(new Set()); reload();
  };
  const exportCsv = () => csv(() => downloadAction('pay.exportCsv', exportable.length ? { ids: exportable.map((r) => r.id) } : { period_start: period }), 'Bank file downloaded').catch(() => {});

  return (
    <Section title="Statements" action={isCo && (
      <Button size="sm" variant="soft" icon={Download} busy={csvBusy} disabled={!exportable.length && !period} onClick={exportCsv}
        title={!exportable.length && !period ? 'Select issued statements or a period' : undefined}>Bank CSV</Button>
    )}>
      {!shown.length ? (
        <Empty icon={FileText} title={status === 'draft' ? 'No draft statements' : 'No statements'} body={status === 'draft' && isCo ? 'Approve a timesheet and its officer gets a draft statement straight away.' : undefined} />
      ) : (
        <List>
          {isCo && (
            <div className="flex items-center gap-3 bg-bg/60 px-4 py-2 text-caption font-semibold uppercase tracking-wide text-faint">
              <Check checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(shown.map((r) => r.id)))} label="Select all" />
              <span className="flex-1">{shown.length} statement{shown.length === 1 ? '' : 's'}</span>
              <span className="num normal-case tracking-normal text-ink">{total(shown)}</span>
            </div>
          )}
          {shown.map((s) => (
            <div key={s.id} className={cx('flex items-center gap-3 px-4 py-3 transition hover:bg-bg', sel.has(s.id) && 'bg-blue-soft/50')}>
              {isCo && <Check checked={sel.has(s.id)} onChange={() => toggle(s.id)} label={`Select ${s.officer_name}`} />}
              <Link to={`${base}/pay/${s.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar name={s.officer_name} size={38} className="hidden sm:grid" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body font-semibold">{s.officer_name}</div>
                  <div className="truncate text-footnote text-muted">{periodLabel(s)}{s.number ? ` · ${s.number}` : ''}</div>
                  {!s.has_bank && s.status !== 'paid' && <div className="mt-0.5 inline-flex items-center gap-1 text-caption font-semibold text-amber"><AlertTriangle size={14} />No bank details</div>}
                </div>
                <div className="shrink-0 text-right">
                  <div className="num text-body font-bold">{money(s.total)}</div>
                  <div className="num text-caption text-muted">{hours(s.hours)}</div>
                </div>
                <Pill status={s.status} className={status === 'all' ? '' : 'hidden sm:inline-flex'} />
              </Link>
            </div>
          ))}
        </List>
      )}
      <p className="mt-3 px-1 text-caption text-faint">Officers are self-employed contractors. Statements show gross amounts — no tax or National Insurance is deducted.</p>

      <ActionBar show={isCo && selected.length > 0}>
        <span className="mr-2 text-subhead font-semibold"><span className="num">{selected.length}</span> selected · <span className="num">{total(selected)}</span></span>
        <Button variant="secondary" size="sm" onClick={() => setSel(new Set())}>Clear</Button>
        {drafts.length > 0 && <Button size="sm" icon={Send} busy={busy} onClick={issue}>Issue {drafts.length}</Button>}
        {issued.length > 0 && <Button size="sm" variant="soft" icon={CheckIcon} busy={busy} onClick={markPaid}>Mark {issued.length} paid</Button>}
      </ActionBar>
    </Section>
  );
}
