import { useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Banknote, CalendarRange, Check as CheckIcon, Download, FileText, Lock, Play, Send } from 'lucide-react';
import { api, downloadAction } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  ActionBar, Avatar, Bento, Button, cx, date, dateShort, Empty, hours, Input, isoDate, List, Load, money, Page, Pill, Section, Segmented, Select, Stat, Tile, useAction, useApi, useConfirm,
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

  return (
    <Page title="Pay runs" subtitle="Remittance statements for self-employed officers">
      <Load q={list}>
        {(rows) => (
          <>
            <Totals rows={rows} />
            {isCo && <RunTile onDone={() => { list.reload(); setRunsKey((k) => k + 1); }} />}
            <RunsList reloadKey={runsKey} />
            <Statements rows={rows} isCo={isCo} status={status} setStatus={setStatus} reload={list.reload} />
          </>
        )}
      </Load>
    </Page>
  );
}

function Totals({ rows }) {
  const sum = (st) => rows.filter((r) => r.status === st).reduce((a, r) => a + Number(r.total), 0);
  const cnt = (st) => rows.filter((r) => r.status === st).length;
  const month = isoDate().slice(0, 7);
  const paidMonth = rows.filter((r) => r.status === 'paid' && r.paid_at && isoDate(r.paid_at).slice(0, 7) === month);
  return (
    <Bento className="mb-4">
      <Tile title="Drafts" icon={FileText}><Stat value={money(sum('draft'))} label={`${cnt('draft')} to check and issue`} /></Tile>
      <Tile title="To pay" icon={Banknote} tone="blue"><Stat value={money(sum('issued'))} label={`${cnt('issued')} issued, awaiting payment`} /></Tile>
      <Tile title="Paid this month" icon={CheckIcon}><Stat value={money(paidMonth.reduce((a, r) => a + Number(r.total), 0))} label={`${paidMonth.length} statements`} tone="green" /></Tile>
      <Tile title="Hours in drafts" icon={CalendarRange}><Stat value={hours(rows.filter((r) => r.status === 'draft').reduce((a, r) => a + Number(r.hours), 0))} label="Signed timesheets" /></Tile>
    </Bento>
  );
}

function RunTile({ onDone }) {
  const sug = useApi('pay.suggestPeriod');
  const [range, setRange] = useState(null);
  const r = range || sug.data?.pay || { start: '', end: '' };
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [run, busy] = useAction();
  const [gen, genBusy] = useAction();
  const confirm = useConfirm();
  const nav = useNavigate();
  const base = useBase();

  const set = (k, val) => { setRange({ ...r, [k]: val }); setPreview(null); setResult(null); };
  const doPreview = () => run(() => api('pay.preview', { start: r.start, end: r.end })).then(setPreview).catch(() => {});
  const generate = async () => {
    if (!(await confirm({ title: 'Create draft statements?', body: `One draft remittance statement per officer for ${date(r.start)} – ${date(r.end)}. Next you can send them to staff to check, then finalise and issue.`, confirm: 'Create drafts' }))) return;
    const res = await gen(() => api('pay.generate', { start: r.start, end: r.end }), (x) => `${x.created} draft statement${x.created === 1 ? '' : 's'} created`).catch(() => null);
    if (!res) return;
    setResult(res);
    setPreview(null);
    onDone();
    if (res.pay_run_id && !res.missing_rates?.length) nav(`${base}/pay/runs/${res.pay_run_id}`);
  };

  return (
    <Tile title="New pay run" icon={Play} className="mb-2">
      <div className="flex flex-wrap items-end gap-3">
        <Input label="From" type="date" value={r.start} onChange={(e) => set('start', e.target.value)} className="min-w-[150px] flex-1" />
        <Input label="To" type="date" value={r.end} onChange={(e) => set('end', e.target.value)} className="min-w-[150px] flex-1" />
        <div className="flex gap-2">
          <Button variant="secondary" busy={busy} disabled={!r.start || !r.end} onClick={doPreview}>Preview</Button>
          <Button icon={Play} busy={genBusy} disabled={!r.start || !r.end || (preview && !Number(preview.unpaid.n))} onClick={generate}>Create drafts</Button>
        </div>
      </div>
      {sug.data && <p className="mt-2 text-caption text-faint">Pay period: {sug.data.pay_period}. Only signed timesheets not already on a statement are included.</p>}

      {preview && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl bg-blue-soft p-4">
            <div className="num text-title2 font-bold leading-none">{preview.unpaid.n}</div>
            <div className="mt-1 text-footnote font-semibold">Signed timesheets to pay</div>
            <div className="text-caption text-muted num">{hours(preview.unpaid.hours)}</div>
          </div>
          <div className={cx('rounded-2xl p-4', preview.unsigned ? 'bg-amber-soft' : 'bg-bg')}>
            <div className={cx('num text-title2 font-bold leading-none', preview.unsigned && 'text-amber')}>{preview.unsigned}</div>
            <div className="mt-1 text-footnote font-semibold">Not yet signed</div>
            <div className="text-caption text-muted">These are left out of this run</div>
          </div>
          <div className="rounded-2xl bg-bg p-4">
            <div className="num text-title2 font-bold leading-none">{preview.uninvoiced.n}</div>
            <div className="mt-1 text-footnote font-semibold">Not yet invoiced</div>
            <Link to="/company/invoices" className="text-caption font-semibold text-blue">Go to invoices</Link>
          </div>
        </div>
      )}

      {result && (
        <div className="mt-4 rounded-2xl bg-green-soft p-4 text-subhead">
          <div className="font-semibold text-green">{result.created} draft statement{result.created === 1 ? '' : 's'} from {result.timesheets} timesheet{result.timesheets === 1 ? '' : 's'}</div>
          {result.pay_run_id && <Link to={`${base}/pay/runs/${result.pay_run_id}`} className="mt-1 inline-block text-footnote font-semibold text-blue">Open the pay run</Link>}
          {result.missing_rates?.length > 0 && (
            <div className="mt-3 rounded-xl bg-white p-3">
              <div className="flex items-center gap-1.5 font-semibold text-amber"><AlertTriangle size={16} />No pay rate set — paid at £0.00</div>
              <ul className="mt-1.5 space-y-0.5 text-footnote text-muted">{result.missing_rates.map((m) => <li key={m}>{m}</li>)}</ul>
              <p className="mt-2 text-caption text-faint">Add the officer's rate on their profile, delete the draft and run again — or add a bonus line.</p>
            </div>
          )}
        </div>
      )}
    </Tile>
  );
}

function Statements({ rows, isCo, status, setStatus, reload }) {
  const base = useBase();
  const confirm = useConfirm();
  const [run, busy] = useAction();
  const [csv, csvBusy] = useAction();
  const [period, setPeriod] = useState('');
  const [sel, setSel] = useState(() => new Set());

  const periods = useMemo(() => {
    const m = new Map();
    for (const r of rows) m.set(r.period_start, r);
    return [...m.values()].sort((a, b) => (a.period_start < b.period_start ? 1 : -1));
  }, [rows]);
  const inPeriod = rows.filter((r) => !period || r.period_start === period);
  const shown = inPeriod.filter((r) => status === 'all' || r.status === status);
  const count = (s) => inPeriod.filter((r) => r.status === s).length;
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
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Segmented value={status} onChange={(s) => { setStatus(s); setSel(new Set()); }} options={[
          { value: 'draft', label: 'Draft', count: count('draft') }, { value: 'issued', label: 'Issued', count: count('issued') },
          { value: 'paid', label: 'Paid' }, { value: 'all', label: 'All' },
        ].filter((o) => isCo || o.value !== 'draft')} />
        {periods.length > 0 && (
          <Select className="min-w-[200px]" value={period} onChange={(e) => { setPeriod(e.target.value); setSel(new Set()); }} placeholder="All periods"
            options={periods.map((p) => ({ value: p.period_start, label: periodLabel(p) }))} />
        )}
      </div>

      {!shown.length ? (
        <Empty icon={FileText} title={status === 'draft' ? 'No draft statements' : 'No statements'} body={status === 'draft' && isCo ? 'Choose a period above and create drafts from signed timesheets.' : undefined} />
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
