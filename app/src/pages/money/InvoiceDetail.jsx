import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Check as CheckIcon, Download, Pencil, Plus, Send, Trash2, Undo2 } from 'lucide-react';
import { api, downloadAction } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Bento, Button, IconButton, Input, KV, Load, Page, Pill, Section, Segmented, Sheet, Stat, Table, Textarea, Tile, cx, date, dayLabel, daysUntil,
  isoDate, money, useAction, useApi, useConfirm, useForm,
} from '../../ui/index.jsx';
import { pct, useBase } from './_parts.jsx';

export default function InvoiceDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const isCo = user.role === 'company';
  const base = useBase();
  const nav = useNavigate();
  const q = useApi('invoices.get', { id });
  const confirm = useConfirm();
  const [run, busy] = useAction();
  const [pdf, pdfBusy] = useAction();
  const [line, setLine] = useState(null); // {} new, row edit
  const [paying, setPaying] = useState(false);
  const [crediting, setCrediting] = useState(false);

  return (
    <Load q={q}>
      {(inv) => {
        const draft = inv.status === 'draft';
        const credit = inv.kind === 'credit';
        const editable = isCo && draft;
        const title = inv.number || (credit ? 'Draft credit note' : 'Draft invoice');
        const cost = inv.lines.reduce((a, l) => a + Number(l.pay_cost || 0), 0);
        const margin = Number(inv.net) - cost;
        const left = daysUntil(inv.due_date);
        const canCredit = isCo && !credit && ['issued', 'paid', 'overdue'].includes(inv.status);

        const issue = async () => {
          if (!(await confirm({ title: 'Issue invoice?', body: `${money(inv.gross)} to ${inv.client_name || inv.venue_name}. It gets a number, is emailed to the venue's managers and can no longer be edited.`, confirm: 'Issue' }))) return;
          await run(() => api('invoices.issue', { id: inv.id }), 'Invoice issued').catch(() => {});
          q.reload();
        };
        const del = async () => {
          if (!(await confirm({ title: 'Delete draft invoice?', body: 'Its timesheets become available to invoice again.', confirm: 'Delete', danger: true }))) return;
          const ok = await run(() => api('invoices.delete', { id: inv.id }), 'Draft deleted').then(() => true, () => false);
          if (ok) nav(`${base}/invoices`);
        };
        const removeLine = async (l) => {
          if (!(await confirm({ title: 'Remove line?', body: l.timesheet_id ? 'The timesheet becomes available to invoice again.' : l.description, confirm: 'Remove', danger: true }))) return;
          await run(() => api('invoices.removeLine', { id: l.id }), 'Line removed').catch(() => {});
          q.reload();
        };

        const columns = [
          { key: 'description', label: 'Description', render: (l) => <span className="block whitespace-normal">{l.description}</span>, className: 'max-w-[420px]' },
          { key: 'work_date', label: 'Date', render: (l) => (l.work_date ? dayLabel(l.work_date) : '–'), className: 'whitespace-nowrap' },
          { key: 'hours', label: 'Hours', align: 'right', render: (l) => (l.hours != null ? Number(l.hours).toFixed(2) : '–') },
          { key: 'rate', label: 'Rate', align: 'right', render: (l) => (l.rate != null ? money(l.rate) : '–') },
          { key: 'amount', label: 'Amount', align: 'right', render: (l) => <span className="num font-semibold">{money(l.amount)}</span> },
          ...(isCo && !credit ? [
            { key: 'pay_cost', label: 'Pay cost', align: 'right', render: (l) => <span className="num text-muted">{money(l.pay_cost)}</span> },
            { key: 'margin', label: 'Margin', align: 'right', render: (l) => { const m = Number(l.amount) - Number(l.pay_cost || 0); return <span className={cx('num font-semibold', m < 0 ? 'text-red' : 'text-green')}>{money(m)}</span>; } },
          ] : []),
          ...(editable ? [{
            key: 'x', label: '', align: 'right', render: (l) => (
              <span className="inline-flex gap-0.5">
                <IconButton icon={Pencil} label="Edit line" onClick={(e) => { e.stopPropagation(); setLine(l); }} className="h-8 w-8" />
                <IconButton icon={Trash2} label="Remove line" onClick={(e) => { e.stopPropagation(); removeLine(l); }} className="h-8 w-8 text-red hover:bg-red-soft" />
              </span>
            ),
          }] : []),
        ];

        return (
          <Page title={title} subtitle={[inv.client_name, inv.venue_name].filter(Boolean).join(' · ')} back={{ to: `${base}/invoices`, label: 'Invoices' }}
            actions={<>
              <Button variant="secondary" icon={Download} busy={pdfBusy} onClick={() => pdf(() => downloadAction('invoices.pdf', { id: inv.id })).catch(() => {})}>PDF</Button>
              {editable && <Button icon={Send} busy={busy} disabled={!inv.lines.length} onClick={issue}>Issue</Button>}
              {isCo && ['issued', 'overdue'].includes(inv.status) && !credit && <Button icon={CheckIcon} onClick={() => setPaying(true)}>Mark paid</Button>}
            </>}>
            <Bento className="mb-2">
              <Tile tone="blue" className="col-span-2">
                <div className="flex items-start justify-between gap-3">
                  <Stat value={money(inv.gross)} label={credit ? 'Credit total' : 'Total due'} hint={`Net ${money(inv.net)} + VAT ${money(inv.vat)}`} />
                  <Pill status={inv.status} />
                </div>
              </Tile>
              {isCo && !credit ? (
                <Tile title="Margin">
                  <Stat value={money(margin)} label={`${pct(margin, inv.net)} of net`} hint={`Pay cost ${money(cost)}`} tone={margin < 0 ? 'red' : 'green'} />
                </Tile>
              ) : (
                <Tile title="Issued"><Stat value={inv.issue_date ? date(inv.issue_date) : '–'} label={credit ? 'Credit note' : 'Invoice date'} /></Tile>
              )}
              <Tile title={inv.status === 'paid' ? 'Paid' : 'Due'}>
                {inv.status === 'paid'
                  ? <Stat value={date(inv.paid_at)} label="Payment received" tone="green" />
                  : <Stat value={inv.due_date ? date(inv.due_date) : '–'} tone={left != null && left < 0 && inv.status !== 'void' ? 'red' : undefined}
                      label={inv.due_date && ['issued', 'overdue'].includes(inv.status) ? (left < 0 ? `${-left} days overdue` : left === 0 ? 'Due today' : `In ${left} days`) : credit ? 'No payment due' : 'Set when issued'} />}
              </Tile>
            </Bento>

            <Section title="Details">
              <Tile>
                <KV items={[
                  ['Bill to', inv.client_name || inv.venue_name],
                  ['Billing address', inv.billing_address || [inv.venue_address, inv.postcode].filter(Boolean).join(', ')],
                  ['Venue', inv.venue_name],
                  ['Period', inv.period_start ? `${date(inv.period_start)} – ${date(inv.period_end)}` : null],
                  ['Issue date', inv.issue_date ? date(inv.issue_date) : 'Not issued'],
                  ['Due date', inv.due_date ? date(inv.due_date) : null],
                  inv.billing_email && ['Billing email', inv.billing_email],
                  inv.client_vat && ['Client VAT number', inv.client_vat],
                  inv.credit_of && ['Credit against', <Link key="c" to={`${base}/invoices/${inv.credit_of}`} className="font-semibold text-blue">{inv.credit_of_number || 'Original invoice'}</Link>],
                ]} />
              </Tile>
            </Section>

            <Section title={`Lines (${inv.lines.length})`} action={editable && <Button size="sm" variant="soft" icon={Plus} onClick={() => setLine({})}>Add line</Button>}>
              <Table rows={inv.lines} columns={columns} empty="No lines on this invoice" onRow={editable ? (l) => setLine(l) : undefined} />
            </Section>

            <div className="mt-4 flex justify-end">
              <div className="w-full rounded-tile bg-surface p-5 shadow-tile sm:max-w-sm">
                <div className="space-y-2 text-body">
                  <div className="flex justify-between"><span className="text-muted">Net</span><span className="num">{money(inv.net)}</span></div>
                  <div className="flex justify-between"><span className="text-muted">VAT at {Number(inv.vat_rate)}%</span><span className="num">{money(inv.vat)}</span></div>
                  <div className="flex justify-between border-t border-line pt-2 text-headline font-bold"><span>Total</span><span className="num">{money(inv.gross)}</span></div>
                  {isCo && !credit && (
                    <div className="flex justify-between pt-1 text-footnote"><span className="text-muted">Margin (net less pay cost)</span><span className={cx('num font-semibold', margin < 0 ? 'text-red' : 'text-green')}>{money(margin)} · {pct(margin, inv.net)}</span></div>
                  )}
                </div>
              </div>
            </div>

            {editable ? <NotesEditor inv={inv} onSaved={q.reload} /> : inv.notes ? (
              <Section title={credit ? 'Reason' : 'Notes'}><Tile><p className="whitespace-pre-wrap text-body">{inv.notes}</p></Tile></Section>
            ) : null}

            {(editable || canCredit) && (
              <div className="mt-8 flex flex-wrap justify-center gap-2">
                {canCredit && <Button variant="secondary" icon={Undo2} onClick={() => setCrediting(true)}>Raise credit note</Button>}
                {editable && <Button variant="danger" icon={Trash2} busy={busy} onClick={del}>Delete draft</Button>}
              </div>
            )}

            {line && <LineSheet invoiceId={inv.id} line={line} onClose={() => setLine(null)} onSaved={q.reload} />}
            {paying && <PaidSheet inv={inv} onClose={() => setPaying(false)} onSaved={q.reload} />}
            {crediting && <CreditSheet inv={inv} onClose={() => setCrediting(false)} onDone={(cn) => nav(`${base}/invoices/${cn.id}`)} />}
          </Page>
        );
      }}
    </Load>
  );
}

function NotesEditor({ inv, onSaved }) {
  const [notes, setNotes] = useState(inv.notes || '');
  const [run, busy] = useAction();
  return (
    <Section title="Notes">
      <Tile>
        <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Printed on the invoice, e.g. purchase order number" />
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="soft" busy={busy} disabled={notes === (inv.notes || '')} onClick={() => run(() => api('invoices.update', { id: inv.id, notes }), 'Notes saved').then(onSaved).catch(() => {})}>Save notes</Button>
        </div>
      </Tile>
    </Section>
  );
}

function LineSheet({ invoiceId, line, onClose, onSaved }) {
  const isNew = !line.id;
  const [run, busy] = useAction();
  const f = useForm({
    description: line.description || '', hours: line.hours != null ? String(line.hours) : '', rate: line.rate != null ? String(line.rate) : '',
    amount: line.amount != null ? String(line.amount) : '',
  });
  const h = f.v.hours === '' ? null : Number(f.v.hours);
  const r = f.v.rate === '' ? null : Number(f.v.rate);
  const calc = h != null && r != null ? Math.round(h * r * 100) / 100 : null;
  const setCalc = (k, val) => {
    const next = { ...f.v, [k]: val };
    const hh = next.hours === '' ? null : Number(next.hours);
    const rr = next.rate === '' ? null : Number(next.rate);
    if (hh != null && rr != null) next.amount = (Math.round(hh * rr * 100) / 100).toFixed(2);
    f.setV(next);
  };
  const ok = f.v.description.trim() && f.v.amount !== '' && !Number.isNaN(Number(f.v.amount));
  const save = async () => {
    const body = { description: f.v.description.trim(), hours: h, rate: r, amount: Number(f.v.amount) };
    await run(() => (isNew ? api('invoices.addLine', { invoice_id: invoiceId, ...body }) : api('invoices.updateLine', { id: line.id, ...body })), isNew ? 'Line added' : 'Line updated');
    onSaved();
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={isNew ? 'Add line' : 'Edit line'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!ok} onClick={() => save().catch(() => {})}>Save</Button></>}>
      <div className="space-y-4">
        <Textarea label="Description" rows={2} autoFocus={isNew} {...f.bind('description')} />
        <div className="grid grid-cols-3 gap-3">
          <Input label="Hours" type="number" inputMode="decimal" step="0.25" value={f.v.hours} onChange={(e) => setCalc('hours', e.target.value)} />
          <Input label="Rate (£)" type="number" inputMode="decimal" step="0.01" value={f.v.rate} onChange={(e) => setCalc('rate', e.target.value)} />
          <Input label="Amount (£)" type="number" inputMode="decimal" step="0.01" {...f.bind('amount')} />
        </div>
        <p className="text-footnote text-muted">{calc != null ? `Hours × rate = ${money(calc)}. You can override the amount.` : 'Leave hours and rate empty for a fixed charge. Use a negative amount for a discount.'}</p>
      </div>
    </Sheet>
  );
}

function PaidSheet({ inv, onClose, onSaved }) {
  const [day, setDay] = useState(isoDate());
  const [run, busy] = useAction();
  return (
    <Sheet open onClose={onClose} title="Mark as paid" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button busy={busy} disabled={!day} onClick={() => run(() => api('invoices.markPaid', { id: inv.id, paid_at: `${day}T12:00:00Z` }), 'Marked as paid').then(() => { onSaved(); onClose(); }).catch(() => {})}>Mark paid</Button></>}>
      <div className="space-y-4">
        <p className="text-body"><span className="font-semibold">{inv.number}</span> · <span className="num">{money(inv.gross)}</span></p>
        <Input label="Payment received on" type="date" max={isoDate()} value={day} onChange={(e) => setDay(e.target.value)} />
      </div>
    </Sheet>
  );
}

function CreditSheet({ inv, onClose, onDone }) {
  const [mode, setMode] = useState('full');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [run, busy] = useAction();
  const net = Number(inv.net);
  const amt = mode === 'full' ? net : Math.min(Math.abs(Number(amount) || 0), net);
  const vat = Math.round(amt * Number(inv.vat_rate)) / 100;
  const ok = reason.trim() && amt > 0;
  const save = () => run(() => api('invoices.credit', { id: inv.id, reason: reason.trim(), ...(mode === 'partial' ? { amount: amt } : {}) }), 'Credit note issued')
    .then((cn) => { onClose(); onDone(cn); }).catch(() => {});
  return (
    <Sheet open onClose={onClose} title="Raise credit note"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant="danger" busy={busy} disabled={!ok} onClick={save}>Issue credit note</Button></>}>
      <div className="space-y-4">
        <Segmented value={mode} onChange={setMode} options={[{ value: 'full', label: 'Full amount' }, { value: 'partial', label: 'Part amount' }]} />
        {mode === 'partial' && <Input label={`Net amount to credit (max ${money(net)})`} type="number" inputMode="decimal" step="0.01" min="0" max={net} value={amount} onChange={(e) => setAmount(e.target.value)} />}
        <Textarea label="Reason" rows={3} placeholder="Shown on the credit note" value={reason} onChange={(e) => setReason(e.target.value)} />
        <div className="rounded-2xl bg-bg p-4 text-subhead">
          <div className="flex justify-between"><span className="text-muted">Net credit</span><span className="num">{money(-amt)}</span></div>
          <div className="flex justify-between"><span className="text-muted">VAT at {Number(inv.vat_rate)}%</span><span className="num">{money(-vat)}</span></div>
          <div className="mt-1 flex justify-between border-t border-line pt-1 font-bold"><span>Total credit</span><span className="num">{money(-(amt + vat))}</span></div>
        </div>
        <p className="text-footnote text-muted">
          {mode === 'full' && inv.status !== 'paid' ? `${inv.number} will be marked void. ` : ''}The credit note is issued straight away and emailed to the venue's managers.
        </p>
      </div>
    </Sheet>
  );
}
