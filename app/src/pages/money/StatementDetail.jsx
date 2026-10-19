import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check as CheckIcon, Download, Plus, Send, Trash2 } from 'lucide-react';
import { api, downloadAction } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Avatar, Bento, Button, Empty, IconButton, Input, KV, List, Load, Page, Pill, Section, Segmented, Sheet, Stat, Tile, cx, date, dateTime, dayLabel,
  hours, money, useAction, useApi, useConfirm, useForm,
} from '../../ui/index.jsx';
import { useBase } from './_parts.jsx';

const KIND = { bonus: 'Bonus', expense: 'Expense', deduction: 'Deduction' };

export default function StatementDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const base = useBase();
  const nav = useNavigate();
  const isCo = user.role === 'company';
  const q = useApi('pay.get', { id });
  const confirm = useConfirm();
  const [run, busy] = useAction();
  const [pdf, pdfBusy] = useAction();
  const [adding, setAdding] = useState(false);

  return (
    <Load q={q}>
      {(st) => {
        const draft = st.status === 'draft';
        const shiftLines = st.lines.filter((l) => l.kind === 'hours');
        const extras = st.lines.filter((l) => l.kind !== 'hours');
        const shiftTotal = shiftLines.reduce((a, l) => a + Number(l.amount), 0);
        const extrasTotal = extras.reduce((a, l) => a + Number(l.amount), 0);
        const editable = isCo && draft;

        const issue = async () => {
          if (!(await confirm({ title: 'Issue statement?', body: `${st.officer_name} is emailed a remittance statement for ${money(st.total)}. It can no longer be edited.`, confirm: 'Issue' }))) return;
          await run(() => api('pay.issue', { ids: [st.id] }), 'Statement issued').catch(() => {});
          q.reload();
        };
        const markPaid = async () => {
          if (!(await confirm({ title: 'Mark as paid?', body: `Confirm ${money(st.total)} has been sent to ${st.officer_name}.`, confirm: 'Mark paid' }))) return;
          await run(() => api('pay.markPaid', { ids: [st.id] }), 'Marked as paid').catch(() => {});
          q.reload();
        };
        const del = async () => {
          if (!(await confirm({ title: 'Delete draft?', body: 'The timesheets go back into the next pay run.', confirm: 'Delete', danger: true }))) return;
          const ok = await run(() => api('pay.delete', { id: st.id }), 'Draft deleted').then(() => true, () => false);
          if (ok) nav(`${base}/pay`);
        };
        const removeLine = async (l) => {
          if (!(await confirm({ title: 'Remove line?', body: l.timesheet_id ? 'The timesheet goes back into the next pay run.' : l.description, confirm: 'Remove', danger: true }))) return;
          await run(() => api('pay.removeLine', { id: l.id }), 'Line removed').catch(() => {});
          q.reload();
        };

        return (
          <Page title={st.officer_name} subtitle={`Remittance statement · ${date(st.period_start)} – ${date(st.period_end)}`} back={{ to: `${base}/pay`, label: 'Pay runs' }}
            actions={<>
              <Button variant="secondary" icon={Download} busy={pdfBusy} onClick={() => pdf(() => downloadAction('pay.pdf', { id: st.id })).catch(() => {})}>PDF</Button>
              {isCo && draft && <Button icon={Send} busy={busy} onClick={issue}>Issue</Button>}
              {isCo && st.status === 'issued' && <Button icon={CheckIcon} busy={busy} onClick={markPaid}>Mark paid</Button>}
            </>}>
            <Bento className="mb-2">
              <Tile tone="blue" className="col-span-2">
                <div className="flex items-start justify-between gap-3">
                  <Stat value={money(st.total)} label="Total payable" hint={st.number || 'Draft — not yet issued'} />
                  <Pill status={st.status} />
                </div>
              </Tile>
              <Tile title="Hours"><Stat value={hours(st.hours)} label={`${shiftLines.length} shift${shiftLines.length === 1 ? '' : 's'}`} /></Tile>
              <Tile title="Adjustments"><Stat value={money(extrasTotal)} label={`${extras.length} line${extras.length === 1 ? '' : 's'}`} tone={extrasTotal < 0 ? 'red' : undefined} /></Tile>
            </Bento>

            <Section title="Contractor">
              <Tile>
                <div className="mb-4 flex items-center gap-3">
                  <Avatar name={st.officer_name} size={44} />
                  <div className="min-w-0"><div className="truncate text-[16px] font-bold">{st.officer_name}</div><div className="truncate text-[13px] text-muted">{st.email}</div></div>
                </div>
                <KV items={[
                  ['UTR', st.utr || 'Not provided'],
                  ['Period', `${date(st.period_start)} – ${date(st.period_end)}`],
                  st.issued_at && ['Issued', dateTime(st.issued_at)],
                  st.paid_at && ['Paid', dateTime(st.paid_at)],
                ]} />
              </Tile>
            </Section>

            <Section title="Shifts worked" action={<span className="num text-[13px] font-semibold">{money(shiftTotal)}</span>}>
              {!shiftLines.length ? <Empty title="No shifts on this statement" /> : (
                <List>
                  {shiftLines.map((l) => (
                    <div key={l.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-semibold">{l.description}</div>
                        <div className="mt-0.5 text-[13px] text-muted num">
                          {l.work_date && `${dayLabel(l.work_date)} · `}{hours(l.hours)} × {money(l.rate)}/h
                        </div>
                      </div>
                      <div className="num shrink-0 text-[15px] font-bold">{money(l.amount)}</div>
                      {editable && <IconButton icon={Trash2} label="Remove line" onClick={() => removeLine(l)} className="-mr-2 h-8 w-8 text-red hover:bg-red-soft" />}
                    </div>
                  ))}
                </List>
              )}
              <p className="mt-2 px-1 text-[12px] text-faint">Rate shown is the average hourly rate for the shift, including any night, weekend or bank holiday uplift.</p>
            </Section>

            <Section title="Bonuses, expenses and deductions" action={editable && <Button size="sm" variant="soft" icon={Plus} onClick={() => setAdding(true)}>Add line</Button>}>
              {!extras.length ? (
                <div className="rounded-tile border border-dashed border-line bg-surface/60 px-4 py-6 text-center text-[14px] text-muted">No adjustments</div>
              ) : (
                <List>
                  {extras.map((l) => (
                    <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                      <Pill tone={l.kind === 'deduction' ? 'red' : l.kind === 'bonus' ? 'green' : 'blue'}>{KIND[l.kind]}</Pill>
                      <div className="min-w-0 flex-1 truncate text-[15px]">{l.description}</div>
                      <div className={cx('num shrink-0 text-[15px] font-bold', Number(l.amount) < 0 && 'text-red')}>{money(l.amount)}</div>
                      {editable && <IconButton icon={Trash2} label="Remove line" onClick={() => removeLine(l)} className="-mr-2 h-8 w-8 text-red hover:bg-red-soft" />}
                    </div>
                  ))}
                </List>
              )}
            </Section>

            <Tile className="mt-6">
              <div className="space-y-2 text-[15px]">
                <div className="flex justify-between"><span className="text-muted">Shifts</span><span className="num">{money(shiftTotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Adjustments</span><span className="num">{money(extrasTotal)}</span></div>
                <div className="flex justify-between border-t border-line pt-2 text-[18px] font-bold"><span>Total payable</span><span className="num">{money(st.total)}</span></div>
              </div>
              <p className="mt-3 text-[12px] text-faint">Self-employed contractor. No tax or National Insurance deducted.</p>
            </Tile>

            {editable && (
              <div className="mt-6 flex justify-center">
                <Button variant="danger" icon={Trash2} busy={busy} onClick={del}>Delete draft</Button>
              </div>
            )}

            {adding && <AddLineSheet statementId={st.id} onClose={() => setAdding(false)} onSaved={q.reload} />}
          </Page>
        );
      }}
    </Load>
  );
}

function AddLineSheet({ statementId, onClose, onSaved }) {
  const [run, busy] = useAction();
  const f = useForm({ kind: 'bonus', description: '', amount: '' });
  const ok = f.v.description.trim() && Number(f.v.amount) > 0;
  const save = async () => {
    await run(() => api('pay.addLine', { statement_id: statementId, kind: f.v.kind, description: f.v.description.trim(), amount: Math.abs(Number(f.v.amount)) }), 'Line added');
    onSaved();
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title="Add line" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!ok} onClick={() => save().catch(() => {})}>Add</Button></>}>
      <div className="space-y-4">
        <Segmented value={f.v.kind} onChange={(k) => f.set('kind', k)} options={[{ value: 'bonus', label: 'Bonus' }, { value: 'expense', label: 'Expense' }, { value: 'deduction', label: 'Deduction' }]} />
        <Input label="Description" placeholder={f.v.kind === 'expense' ? 'e.g. Parking at venue' : f.v.kind === 'deduction' ? 'e.g. Uniform replacement' : 'e.g. Cover at short notice'} autoFocus {...f.bind('description')} />
        <Input label="Amount (£)" type="number" inputMode="decimal" step="0.01" min="0" hint={f.v.kind === 'deduction' ? 'Taken off the total' : 'Added to the total'} {...f.bind('amount')} />
      </div>
    </Sheet>
  );
}

