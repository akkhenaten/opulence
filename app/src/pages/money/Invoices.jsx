import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertTriangle, Clock, Download, FileText, ReceiptText, RefreshCw } from 'lucide-react';
import { api, downloadAction } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Bento, Button, cx, dateShort, daysUntil, Empty, Input, isoDate, List, Load, money, Page, Pill, SearchInput, Section, Segmented, Sheet, Stat, Tile, useAction, useApi,
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
  const [exp, setExp] = useState(false);
  const [run, busy] = useAction();
  // Drafts fill themselves from approved timesheets; this only catches up anything the 5-minute sweep has not reached yet
  const refresh = () => run(() => api('invoices.generate', {}), (x) => `Drafts up to date · ${x.created} open`).then(list.reload).catch(() => {});

  return (
    <Page title="Invoices" subtitle="Approved shifts go straight onto each venue's draft"
      actions={<>
        <Button variant="secondary" icon={Download} onClick={() => setExp(true)}>Export</Button>
        <Button variant="secondary" icon={RefreshCw} busy={busy} onClick={refresh}>Bring up to date</Button>
      </>}>
      <Load q={list}>
        {(rows) => <CompanyBody rows={rows} status={status} setStatus={setStatus} />}
      </Load>
      {exp && <ExportSheet onClose={() => setExp(false)} />}
    </Page>
  );
}

function CompanyBody({ rows, status, setStatus }) {
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
        <SearchInput className="min-w-0 flex-1 basis-48" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Number, venue or client" />
      </div>

      {!rows.length
        ? <Empty icon={ReceiptText} title="No invoices yet" body="Approve a timesheet and it goes straight onto its venue's draft invoice. Issue once the venue has signed the shifts off." />
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
            <div className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', i.kind === 'credit' ? 'bg-fill text-muted' : 'bg-blue-soft text-blue')}>
              <ReceiptText size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-body font-semibold">
                {i.number || 'Draft'}{i.kind === 'credit' && <span className="ml-1.5 text-caption font-semibold text-muted">Credit note</span>}
              </div>
              <div className="truncate text-footnote text-muted">
                {company ? [i.venue_name, i.client_name].filter(Boolean).join(' · ') : i.venue_name}
                {i.period_start && ` · ${dateShort(i.period_start)} – ${dateShort(i.period_end)}`}
              </div>
              {due && <div className={cx('text-caption font-semibold', left < 0 ? 'text-red' : 'text-muted')}>{due}</div>}
              {company && i.status === 'draft' && i.kind === 'invoice' && (i.signed > 0 || i.awaiting > 0) && (
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-caption font-semibold">
                  {i.signed > 0 && <span className="text-green">{i.signed} signed · {money(i.signed_net)} ready</span>}
                  {i.awaiting > 0 && <span className="text-amber">{i.awaiting} awaiting venue</span>}
                  {i.late > 0 && <span className="text-blue">{i.late} late</span>}
                </div>
              )}
            </div>
            <div className="shrink-0 text-right">
              <div className={cx('num text-body font-bold', Number(i.gross) < 0 && 'text-muted')}>{money(i.gross)}</div>
              <Pill status={i.status} />
            </div>
          </Link>
        );
      })}
    </List>
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
        <p className="text-footnote text-muted">Issued invoices and credit notes, ready for your accounting software. Drafts are not included.</p>
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

