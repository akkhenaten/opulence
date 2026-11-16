import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Download, FilePen, FileText, Hourglass, Landmark, Layers, ReceiptText, RefreshCw, Send } from 'lucide-react';
import { api, downloadAction } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useVenue } from '../../venue.jsx';
import {
  Button, Chip, cx, dateShort, daysUntil, Empty, Input, isoDate, KV, List, Load, money, MoreMenu, Page, Pill, SearchInput, Section, Segmented, Select, Sheet, Tile, ToolField, ToolMenu, useAction, useApi, useConfirm, useMedia, useUrlState,
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
  // Status and search live in the address, so a filtered list survives Back and can be shared
  const [f, setF] = useUrlState({ status: 'all', q: '', stream: '' });
  const [exp, setExp] = useState(false);
  const [run, busy] = useAction();
  // Drafts fill themselves from approved timesheets; this only catches up anything the 5-minute sweep has not reached yet
  const refresh = () => run(() => api('invoices.generate', {}), (x) => `Drafts up to date · ${x.created} open`).then(list.reload).catch(() => {});
  // One confirm issues every draft; a draft with nothing signed off by the venue yet stays a draft
  const confirm = useConfirm();
  const drafts = (list.data || []).filter((i) => i.status === 'draft' && i.kind === 'invoice');
  const issueAll = async () => {
    if (!(await confirm({ title: `Issue ${drafts.length} draft invoice${drafts.length === 1 ? '' : 's'}?`, body: 'Each venue is sent its invoice. Only hours the venue has signed off are billed; the rest move to the next invoice.', confirm: 'Issue all' }))) return;
    run(() => api('invoices.issueMany', {}), (x) => [`${x.issued} issued`, x.skipped.length && `${x.skipped.length} left as draft (nothing signed off yet, or its stream is not checked)`].filter(Boolean).join(' · ')).then(list.reload).catch(() => {});
  };

  const status = f.status;
  const wide = useMedia('(min-width: 640px)');
  // Venues billing more than one budget: pick one stream's invoices
  const streamOpts = useMemo(() => {
    const seen = new Map();
    for (const i of list.data || []) if (i.stream_label && !seen.has(i.stream_id)) seen.set(i.stream_id, `${i.venue_name} · ${i.stream_label}`);
    return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [list.data]);
  const rows = list.data || [];
  const out = rows.filter(outstanding);
  const overdue = rows.filter((i) => i.status === 'overdue');
  const month = isoDate().slice(0, 7);
  const paidMonth = rows.filter((i) => i.status === 'paid' && i.paid_at && isoDate(i.paid_at).slice(0, 7) === month);
  const c = (st) => rows.filter((i) => i.kind === 'invoice' && i.status === st).length;

  // The totals are chips and the status, search and picker sit on the tab line, so the list starts high
  const more = <Select aria-label="More statuses" className="w-40" value={MAIN.includes(status) ? '' : status} placeholder="More…"
    onChange={(e) => setF({ status: e.target.value || 'all' })} options={[{ value: 'void', label: 'Void' }, { value: 'credit', label: 'Credit notes' }]} />;
  const tools = <>
    {out.length > 0 && <Chip label={`outstanding · ${out.length}`} value={money(sum(out))} tone="blue" icon={Hourglass} compact="phone" />}
    {overdue.length > 0 && <Chip label="overdue" value={money(sum(overdue))} tone="red" icon={AlertTriangle} compact="phone" active={status === 'overdue'} onClick={() => setF({ status: status === 'overdue' ? 'all' : 'overdue' })} />}
    {paidMonth.length > 0 && <Chip label="paid this month" value={money(sum(paidMonth))} tone="green" icon={CheckCircle2} compact="phone" />}
    <Segmented value={status} onChange={(v) => setF({ status: v })} options={[
      { value: 'all', label: 'All', icon: Layers }, { value: 'draft', label: 'Draft', icon: FilePen, count: c('draft') }, { value: 'issued', label: 'Issued', icon: Send },
      { value: 'overdue', label: 'Overdue', icon: AlertTriangle, count: c('overdue') }, { value: 'paid', label: 'Paid', icon: CheckCircle2 },
    ]} />
    {wide ? more : <ToolMenu count={MAIN.includes(status) ? 0 : 1} onClear={() => setF({ status: 'all' })}><ToolField label="More statuses">{more}</ToolField></ToolMenu>}
    {streamOpts.length > 0 && <Select aria-label="Billing stream" className="w-52" value={f.stream} placeholder="All streams" onChange={(e) => setF({ stream: e.target.value })} options={streamOpts} />}
    <SearchInput className="w-full sm:w-56" value={f.q} onChange={(e) => setF({ q: e.target.value })} placeholder="Number, venue or client" />
  </>;

  return (
    <Page title="Invoices" subtitle="Approved shifts go straight onto each venue's draft" tools={tools}
      actions={<>
        <MoreMenu items={[
          { label: 'Bring drafts up to date', hint: 'Catch up approved shifts now', icon: RefreshCw, onClick: refresh },
          { label: 'Export CSV', hint: 'Issued invoices and credit notes', icon: Download, onClick: () => setExp(true) },
        ]} />
        {drafts.length > 0 && <Button icon={Send} busy={busy} onClick={issueAll}>Issue all drafts</Button>}
      </>}>
      <Load q={list}>
        {(all) => <CompanyBody rows={f.stream ? all.filter((i) => i.stream_id === f.stream) : all} status={status} q={f.q} />}
      </Load>
      {exp && <ExportSheet onClose={() => setExp(false)} />}
    </Page>
  );
}

// The five everyday statuses are tabs; void and credit notes sit in the picker beside them
const MAIN = ['all', 'draft', 'issued', 'overdue', 'paid'];

function CompanyBody({ rows, status, q }) {
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((i) => {
      if (status === 'credit') { if (i.kind !== 'credit') return false; } else if (status !== 'all' && (i.status !== status || i.kind === 'credit')) return false;
      return !s || [i.number, i.venue_name, i.client_name, i.stream_label, i.po_ref].some((x) => String(x || '').toLowerCase().includes(s));
    });
  }, [rows, status, q]);

  return !rows.length
    ? <Empty icon={ReceiptText} title="No invoices yet" body="Approve a timesheet and it goes straight onto its venue's draft invoice. Issue once the venue has signed the shifts off." />
    : <InvoiceList rows={filtered} company empty={q.trim() ? ['No invoices match', 'Try another search.'] : [EMPTY[status] || 'No invoices here']} />;
}

// Each tab names what is missing, so an empty tab never reads like a search problem
const EMPTY = { draft: 'No draft invoices', issued: 'No issued invoices waiting', outstanding: 'No unpaid invoices', overdue: 'No overdue invoices', paid: 'No paid invoices', credit: 'No credit notes', void: 'No void invoices' };

function InvoiceList({ rows, company, empty = ['No invoices here'] }) {
  const base = useBase();
  if (!rows.length) return <Empty icon={FileText} title={empty[0]} body={empty[1]} />;
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
                {company ? [i.venue_name, i.stream_label, i.client_name].filter(Boolean).join(' · ') : [i.venue_name, i.stream_label].filter(Boolean).join(' · ')}
                {i.period_start && ` · ${dateShort(i.period_start)} – ${dateShort(i.period_end)}`}
              </div>
              {due && <div className={cx('text-caption font-semibold', left < 0 ? 'text-red' : 'text-muted')}>{due}</div>}
              {company && i.status === 'draft' && i.stream_checked === false && <div className="text-caption font-semibold text-amber">Stream not yet checked</div>}
              {company && i.status === 'draft' && i.kind === 'invoice' && (i.signed > 0 || i.awaiting > 0) && (
                <div className="mt-0.5 flex flex-wrap gap-x-2 text-caption font-semibold">
                  {i.signed > 0 && <span className="text-green">{i.signed} signed · {money(i.signed_net)} net ready</span>}
                  {i.awaiting > 0 && <span className="text-amber">{i.awaiting} awaiting venue</span>}
                  {i.late > 0 && <span className="text-blue">{i.late} late</span>}
                </div>
              )}
            </div>
            <div className="shrink-0 text-right">
              <div className={cx('num text-body font-bold', Number(i.gross) < 0 && 'text-muted')}>{money(i.gross)}</div>
              <div className="text-caption text-muted">incl. VAT</div>
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

const VENUE_EMPTY = {
  outstanding: ['Nothing to pay', 'New invoices show here when the office issues them.'],
  paid: ['No paid invoices yet', 'Invoices you have paid show here once the office records the payment.'],
  credit: ['No credit notes', 'Credit notes show here if the office corrects an invoice.'],
};

// Where to pay, shown only while something is outstanding; the invoice number is the reference
function PayTo() {
  const s = useApi('settings.get').data;
  if (!s?.bank_account) return null;
  return (
    <Section title="How to pay" icon={Landmark}>
      <Tile>
        <KV items={[['Account name', s.company_name], ['Bank', s.bank_name], ['Sort code', <span className="num">{s.bank_sort_code}</span>], ['Account', <span className="num">{s.bank_account}</span>], ['Reference', 'The invoice number']]} />
      </Tile>
    </Section>
  );
}

function VenueInvoices() {
  const { venueId, venue } = useVenue();
  const list = useApi('invoices.list', { venue_id: venueId || undefined });
  const [show, setShow] = useState('all');
  const rows = list.data || [];
  const out = rows.filter(outstanding);
  const overdue = rows.filter((i) => i.status === 'overdue');
  // The totals are chips beside the switch, so the list starts high
  const tools = <>
    {out.length > 0 && <Chip label={`to pay · ${out.length}`} value={money(sum(out))} tone="blue" icon={Hourglass} compact="phone" active={show === 'outstanding'} onClick={() => setShow(show === 'outstanding' ? 'all' : 'outstanding')} />}
    {overdue.length > 0 && <Chip label="overdue" value={money(sum(overdue))} tone="red" icon={AlertTriangle} compact="phone" />}
    {/* Nothing to filter until the first invoice; Credit notes only once there is one */}
    {rows.length > 0 && <Segmented value={show} onChange={setShow} options={[
      { value: 'all', label: 'All', icon: Layers }, { value: 'outstanding', label: 'To pay', icon: Hourglass, count: out.length }, { value: 'paid', label: 'Paid', icon: CheckCircle2 },
      rows.some((i) => i.kind === 'credit') && { value: 'credit', label: 'Credit notes', icon: ReceiptText },
    ].filter(Boolean)} />}
  </>;
  return (
    <Page title="Invoices" subtitle={venue ? `${venue.name}: invoices and credit notes` : 'Your invoices and credit notes'} tools={tools}>
      <Load q={list}>
        {(all) => {
          const shown = all.filter((i) => show === 'all' || (show === 'outstanding' ? outstanding(i) : show === 'paid' ? i.status === 'paid' : i.kind === 'credit'));
          return (
            <>
              {!all.length ? <Empty icon={ReceiptText} title="No invoices yet" body="Invoices appear here once they are issued." /> : <InvoiceList rows={shown} empty={VENUE_EMPTY[show] || ['No invoices here']} />}
              {out.length > 0 && <PayTo />}
            </>
          );
        }}
      </Load>
    </Page>
  );
}
