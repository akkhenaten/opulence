import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Clock, Download, FilePlus2, FileText, ReceiptText, Search } from 'lucide-react';
import { api, downloadAction } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Bento, Button, Empty, Input, List, Load, Page, Pill, Section, Segmented, Select, Sheet, Stat, Tile, cx, dateShort, daysUntil, isoDate, money,
  useAction, useApi,
} from '../../ui/index.jsx';
import { useBase } from './_parts.jsx';

const outstanding = (i) => i.kind === 'invoice' && ['issued', 'overdue'].includes(i.status);
const sum = (list, k = 'gross') => list.reduce((a, i) => a + Number(i[k] || 0), 0);

export default function Invoices() {
  const { user } = useAuth();
  return user.role === 'venue' ? <VenueInvoices /> : <CompanyInvoices />;
}

/* ---------- Company ---------- */

function CompanyInvoices() {
  const list = useApi('invoices.list', {});
  const [params, setParams] = useSearchParams();
  const status = params.get('status') || 'all';
  const setStatus = (s) => setParams(s === 'all' ? {} : { status: s }, { replace: true });
  const [gen, setGen] = useState(false);
  const [exp, setExp] = useState(false);

  return (
    <Page title="Invoices" subtitle="Bill venues for signed hours"
      actions={<>
        <Button variant="secondary" icon={Download} onClick={() => setExp(true)}>Export</Button>
        <Button icon={FilePlus2} onClick={() => setGen(true)}>Generate</Button>
      </>}>
      <Load q={list}>
        {(rows) => <CompanyBody rows={rows} status={status} setStatus={setStatus} onGenerate={() => setGen(true)} />}
      </Load>
      {gen && <GenerateSheet onClose={() => setGen(false)} onDone={() => { list.reload(); setStatus('draft'); }} />}
      {exp && <ExportSheet onClose={() => setExp(false)} />}
    </Page>
  );
}

function CompanyBody({ rows, status, setStatus, onGenerate }) {
  const [q, setQ] = useState('');
  const out = rows.filter(outstanding);
  const overdue = rows.filter((i) => i.status === 'overdue');
  const drafts = rows.filter((i) => i.status === 'draft');
  const month = isoDate().slice(0, 7);
  const paidMonth = rows.filter((i) => i.status === 'paid' && i.paid_at && isoDate(i.paid_at).slice(0, 7) === month);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((i) => {
      if (status === 'credit') { if (i.kind !== 'credit') return false; } else if (status !== 'all' && (i.status !== status || i.kind === 'credit')) return false;
      return !s || [i.number, i.venue_name, i.client_name].some((x) => String(x || '').toLowerCase().includes(s));
    });
  }, [rows, status, q]);
  const c = (st) => rows.filter((i) => i.kind === 'invoice' && i.status === st).length;

  return (
    <>
      <Bento className="mb-6">
        <Tile title="Outstanding" icon={ReceiptText} tone="blue" className="col-span-2">
          <Stat value={money(sum(out))} label={`${out.length} invoice${out.length === 1 ? '' : 's'} awaiting payment`} />
        </Tile>
        <Tile title="Overdue" icon={AlertTriangle} to="?status=overdue">
          <Stat value={money(sum(overdue))} label={`${overdue.length} overdue`} tone={overdue.length ? 'red' : undefined} />
        </Tile>
        <Tile title="Paid this month" icon={Clock}>
          <Stat value={money(sum(paidMonth))} label={`${paidMonth.length} paid`} tone="green" hint={drafts.length ? `${drafts.length} draft${drafts.length === 1 ? '' : 's'} to issue` : undefined} />
        </Tile>
      </Bento>

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Segmented value={status} onChange={setStatus} options={[
          { value: 'all', label: 'All' }, { value: 'draft', label: 'Draft', count: c('draft') }, { value: 'issued', label: 'Issued' },
          { value: 'overdue', label: 'Overdue', count: c('overdue') }, { value: 'paid', label: 'Paid' }, { value: 'void', label: 'Void' }, { value: 'credit', label: 'Credit notes' },
        ]} />
        <label className="relative min-w-0 flex-1 basis-48">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Number, venue or client"
            className="h-10 w-full rounded-xl border border-line bg-surface pl-9 pr-3 text-[14px] outline-none focus:border-blue focus:ring-4 focus:ring-blue/10" />
        </label>
      </div>

      {!rows.length
        ? <Empty icon={ReceiptText} title="No invoices yet" body="Generate draft invoices from signed timesheets, check them, then issue." action={<Button icon={FilePlus2} onClick={onGenerate}>Generate invoices</Button>} />
        : <InvoiceList rows={filtered} company />}
    </>
  );
}

function InvoiceList({ rows, company }) {
  const base = useBase();
  if (!rows.length) return <Empty icon={FileText} title="No invoices here" />;
  return (
    <List>
      {rows.map((i) => {
        const left = daysUntil(i.due_date);
        const due = outstanding(i) && i.due_date
          ? (left < 0 ? `${-left} day${left === -1 ? '' : 's'} overdue` : left === 0 ? 'Due today' : `Due in ${left} day${left === 1 ? '' : 's'}`)
          : null;
        return (
          <Link key={i.id} to={`${base}/invoices/${i.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-bg active:bg-bg">
            <div className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', i.kind === 'credit' ? 'bg-[#EEF0F3] text-muted' : 'bg-blue-soft text-blue')}>
              <ReceiptText size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold">
                {i.number || 'Draft'}{i.kind === 'credit' && <span className="ml-1.5 text-[12px] font-semibold text-muted">Credit note</span>}
              </div>
              <div className="truncate text-[13px] text-muted">
                {company ? [i.venue_name, i.client_name].filter(Boolean).join(' · ') : i.venue_name}
                {i.period_start && ` · ${dateShort(i.period_start)} – ${dateShort(i.period_end)}`}
              </div>
              {due && <div className={cx('text-[12px] font-semibold', left < 0 ? 'text-red' : 'text-muted')}>{due}</div>}
            </div>
            <div className="shrink-0 text-right">
              <div className={cx('num text-[15px] font-bold', Number(i.gross) < 0 && 'text-muted')}>{money(i.gross)}</div>
              <Pill status={i.status} />
            </div>
          </Link>
        );
      })}
    </List>
  );
}

function GenerateSheet({ onClose, onDone }) {
  const sug = useApi('pay.suggestPeriod');
  const venues = useApi('venues.list', {});
  const [range, setRange] = useState(null);
  const r = range || sug.data?.invoice || { start: '', end: '' };
  const [venue, setVenue] = useState('');
  const preview = useApi('pay.preview', { start: r.start, end: r.end }, { skip: !r.start || !r.end });
  const [run, busy] = useAction();
  const [result, setResult] = useState(null);

  const generate = async () => {
    const res = await run(() => api('invoices.generate', { start: r.start, end: r.end, venue_id: venue || undefined }), (x) => `${x.created} draft invoice${x.created === 1 ? '' : 's'} created`).catch(() => null);
    if (!res) return;
    setResult(res);
    onDone();
  };

  return (
    <Sheet open onClose={onClose} title="Generate invoices"
      footer={result
        ? <Button onClick={onClose}>Done</Button>
        : <><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!r.start || !r.end} onClick={generate}>Create drafts</Button></>}>
      {result ? (
        <div className="space-y-3">
          <div className="rounded-2xl bg-green-soft p-4">
            <div className="text-[16px] font-bold text-green">{result.created} draft invoice{result.created === 1 ? '' : 's'}</div>
            <div className="text-[14px] text-muted">from {result.timesheets} signed timesheet{result.timesheets === 1 ? '' : 's'}</div>
          </div>
          {result.missing_rates?.length > 0 && (
            <div className="rounded-2xl bg-amber-soft p-4">
              <div className="flex items-center gap-1.5 font-semibold text-amber"><AlertTriangle size={16} />No charge rate — billed at £0.00</div>
              <ul className="mt-1.5 space-y-0.5 text-[14px]">{result.missing_rates.map((m) => <li key={m}>{m}</li>)}</ul>
              <p className="mt-2 text-[12px] text-muted">Add the rate on the venue, delete the draft and generate again, or edit the lines.</p>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <Input label="From" type="date" value={r.start} onChange={(e) => setRange({ ...r, start: e.target.value })} />
            <Input label="To" type="date" value={r.end} onChange={(e) => setRange({ ...r, end: e.target.value })} />
          </div>
          <Select label="Venue" placeholder="All venues" value={venue} onChange={(e) => setVenue(e.target.value)}
            options={(venues.data || []).map((v) => ({ value: v.id, label: v.name }))} />
          {preview.data && (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-blue-soft p-4">
                <div className="num text-[24px] font-bold leading-none">{preview.data.uninvoiced.n}</div>
                <div className="mt-1 text-[13px] font-semibold">Signed, not invoiced</div>
                <div className="num text-[12px] text-muted">{Number(preview.data.uninvoiced.hours).toLocaleString('en-GB')}h, all venues</div>
              </div>
              <div className={cx('rounded-2xl p-4', preview.data.unsigned ? 'bg-amber-soft' : 'bg-bg')}>
                <div className={cx('num text-[24px] font-bold leading-none', preview.data.unsigned && 'text-amber')}>{preview.data.unsigned}</div>
                <div className="mt-1 text-[13px] font-semibold">Not yet signed</div>
                <div className="text-[12px] text-muted">Left out until signed</div>
              </div>
            </div>
          )}
          <p className="text-[13px] text-muted">One draft invoice per venue. {sug.data && `Default invoice cycle: ${sug.data.invoice_cycle}.`} Nothing is sent until you issue each invoice.</p>
        </div>
      )}
    </Sheet>
  );
}

function ExportSheet({ onClose }) {
  const [from, setFrom] = useState(`${isoDate().slice(0, 7)}-01`);
  const [to, setTo] = useState(isoDate());
  const [run, busy] = useAction();
  return (
    <Sheet open onClose={onClose} title="Export invoices" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button icon={Download} busy={busy} onClick={() => run(() => downloadAction('invoices.exportCsv', { from: from || undefined, to: to || undefined }), 'CSV downloaded').then(onClose).catch(() => {})}>Download CSV</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input label="Issued from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <Input label="Issued to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <p className="text-[13px] text-muted">Issued invoices and credit notes, ready for your accounting software. Drafts are not included.</p>
      </div>
    </Sheet>
  );
}

/* ---------- Venue manager ---------- */

function VenueInvoices() {
  const list = useApi('invoices.list', {});
  const [show, setShow] = useState('all');
  return (
    <Page title="Invoices" subtitle="Your invoices and credit notes">
      <Load q={list}>
        {(rows) => {
          const out = rows.filter(outstanding);
          const overdue = rows.filter((i) => i.status === 'overdue');
          const shown = rows.filter((i) => show === 'all' || (show === 'outstanding' ? outstanding(i) : show === 'paid' ? i.status === 'paid' : i.kind === 'credit'));
          return (
            <>
              <Bento className="mb-6">
                <Tile title="Outstanding" icon={ReceiptText} tone="blue" className="col-span-2">
                  <Stat value={money(sum(out))} label={`${out.length} invoice${out.length === 1 ? '' : 's'} to pay`} />
                </Tile>
                <Tile title="Overdue" icon={AlertTriangle} className="col-span-2 lg:col-span-1">
                  <Stat value={money(sum(overdue))} label={`${overdue.length} overdue`} tone={overdue.length ? 'red' : undefined} />
                </Tile>
              </Bento>
              <Section title="All invoices" className="mt-0">
                <Segmented className="mb-3" value={show} onChange={setShow} options={[
                  { value: 'all', label: 'All' }, { value: 'outstanding', label: 'To pay', count: out.length }, { value: 'paid', label: 'Paid' }, { value: 'credit', label: 'Credit notes' },
                ]} />
                {!rows.length ? <Empty icon={ReceiptText} title="No invoices yet" body="Invoices appear here once they are issued." /> : <InvoiceList rows={shown} />}
              </Section>
            </>
          );
        }}
      </Load>
    </Page>
  );
}

