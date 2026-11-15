import { useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Banknote, CalendarDays, Check as CheckIcon, ClipboardCheck, Clock, Contact, Download, MessageSquare, Plus, RefreshCw, Send, SlidersHorizontal, Trash2 } from 'lucide-react';
import { api, downloadAction } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Avatar, Bento, Button, Callout, IconButton, Input, KV, List, Load, Page, Pill, Section, Segmented, Sheet, Stat, Tile, cx, date, dateTime,
  hours, money, useAction, useApi, useConfirm, useForm,
} from '../../ui/index.jsx';
import { useBase } from './_parts.jsx';
import { REVIEW_LABEL, RUN_LABEL } from './PayRuns.jsx';
import { DayLines, signedSplit, timesheetHref } from './_lines.jsx';
import { SELF_HINT, SelfPills } from '../manager/_parts.jsx';
import RecordHistory from '../people/_history.jsx';

const KIND = { bonus: 'Bonus', expense: 'Expense', deduction: 'Deduction' };

export default function StatementDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const base = useBase();
  const nav = useNavigate();
  const loc = useLocation();
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
        const split = signedSplit(shiftLines);
        const shiftTotal = shiftLines.reduce((a, l) => a + Number(l.amount), 0);
        const extrasTotal = extras.reduce((a, l) => a + Number(l.amount), 0);
        // Your own statement is changed by another company manager
        const editable = isCo && draft && !st.self_locked;
        // Inside a pay run, statements are issued from the run once staff have checked them
        const inRun = !!st.run;
        const canIssue = isCo && draft && (!inRun || (['reconciled', 'issued'].includes(st.run.status) && !st.held && ['approved', 'resolved'].includes(st.review_status)));

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
          if (!(await confirm({ title: 'Delete draft?', body: 'Only bonuses, expenses and deductions are on it; they are removed.', confirm: 'Delete', danger: true }))) return;
          const ok = await run(() => api('pay.delete', { id: st.id }), 'Draft deleted').then(() => true, () => false);
          if (ok) nav(`${base}/pay`);
        };
        const removeLine = async (l) => {
          if (!(await confirm({ title: 'Remove line?', body: l.description, confirm: 'Remove', danger: true }))) return;
          await run(() => api('pay.removeLine', { id: l.id }), 'Line removed').catch(() => {});
          q.reload();
        };

        return (
          <Page title={st.officer_name} subtitle={`Remittance statement · ${date(st.period_start)} – ${date(st.period_end)}`} back={st.run ? { to: `${base}/pay/runs/${st.run.id}`, label: 'Pay run' } : { to: `${base}/pay`, label: 'Pay runs' }}
            actions={[
              { label: st.pdf_document_id ? 'Saved PDF' : 'PDF', icon: Download, busy: pdfBusy, onClick: () => pdf(() => downloadAction('pay.pdf', { id: st.id })).catch(() => {}) },
              canIssue && { label: 'Issue', icon: Send, variant: 'primary', busy, onClick: issue },
              isCo && st.status === 'issued' && { label: 'Mark paid', icon: CheckIcon, variant: 'primary', busy, onClick: markPaid },
            ]}>
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

            {inRun && (
              <Section title="Staff check" icon={ClipboardCheck} action={<Button size="sm" variant="soft" icon={Banknote} to={`${base}/pay/runs/${st.run.id}`}>Pay run · {RUN_LABEL[st.run.status]}</Button>}>
                <Tile>
                  <div className="flex flex-wrap items-center gap-2">
                    {st.held ? <Pill status="held">Held back</Pill> : st.review_status ? <Pill status={st.review_status}>{REVIEW_LABEL[st.review_status]}</Pill> : <Pill status="draft">Not sent to staff</Pill>}
                    {st.reviewed_at && <span className="text-footnote text-muted">{dateTime(st.reviewed_at)}</span>}
                  </div>
                  {st.disputes?.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {st.disputes.map((d) => (
                        <div key={d.id} className={cx('rounded-xl px-3 py-2.5', d.status === 'open' ? 'bg-red-soft' : 'bg-bg')}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-footnote font-semibold">{d.line_description}</span>
                            <Pill status={d.status}>{d.status === 'open' ? 'Open' : 'Resolved'}</Pill>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-subhead">{d.comment}</p>
                          {d.resolution && <p className="mt-1 text-footnote text-muted"><b>{d.resolved_by_name || 'Office'}:</b> {d.resolution}</p>}
                          {d.conversation_id && <Button size="sm" variant="link" icon={MessageSquare} to={`${base}/messages/${d.conversation_id}`}>Open thread</Button>}
                        </div>
                      ))}
                      {isCo && st.disputes.some((d) => d.status === 'open') && <p className="text-caption text-faint">Resolve queries from the pay run page.</p>}
                    </div>
                  )}
                </Tile>
              </Section>
            )}

            <Section title="Contractor" icon={Contact}>
              <Tile>
                <div className="mb-4 flex items-center gap-3">
                  <Avatar name={st.officer_name} size={44} />
                  <div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><span className="truncate text-callout font-bold">{st.officer_name}</span><SelfPills row={st} small /></div><div className="truncate text-footnote text-muted">{st.email}</div></div>
                </div>
                <KV items={[
                  ['UTR', st.utr || 'Not provided'],
                  ['Period', `${date(st.period_start)} – ${date(st.period_end)}`],
                  st.issued_at && ['Issued', dateTime(st.issued_at)],
                  st.paid_at && ['Paid', dateTime(st.paid_at)],
                ]} />
              </Tile>
            </Section>

            <Section title="Shifts worked" icon={CalendarDays} action={<span className="num text-footnote font-semibold">{money(shiftTotal)}</span>}>
              {draft && shiftLines.length > 0 && (
                <Callout tone={split.awaiting ? 'warning' : 'info'} icon={split.awaiting ? Clock : RefreshCw} className="mb-2">
                  Kept up to date from approved timesheets.
                  {split.awaiting ? ` ${split.signed} of ${split.signed + split.awaiting} shifts are signed off by the venue; only those are paid in this run, the rest move to the next one.` : ' Every shift on it is signed off by the venue.'}
                </Callout>
              )}
              <DayLines lines={shiftLines} periodStart={draft ? st.period_start : null} showState={draft} empty="No shifts on this statement"
                onRow={isCo ? (l) => l.timesheet_id && nav(timesheetHref(base, l, loc.pathname, `${st.officer_name}'s statement`)) : undefined} />
              <p className="mt-2 px-1 text-caption text-faint">Rate shown is the average hourly rate for the shift, including any night, weekend or bank holiday uplift.{isCo && shiftLines.length ? (editable ? ' Tap a shift line to correct its hours.' : ' Tap a shift line to see its timesheet.') : ''}</p>
            </Section>

            <Section title="Bonuses, expenses and deductions" icon={SlidersHorizontal} action={editable && <Button size="sm" variant="soft" icon={Plus} onClick={() => setAdding(true)}>Add line</Button>}>
              {!extras.length ? (
                <div className="rounded-tile border border-dashed border-line bg-surface/60 px-4 py-6 text-center text-subhead text-muted">No adjustments</div>
              ) : (
                <List>
                  {extras.map((l) => (
                    <div key={l.id} className="flex items-center gap-3 px-4 py-3">
                      <Pill tone={l.kind === 'deduction' ? 'red' : l.kind === 'bonus' ? 'green' : 'blue'}>{KIND[l.kind]}</Pill>
                      <div className="min-w-0 flex-1 truncate text-body">{l.description}</div>
                      <div className={cx('num shrink-0 text-body font-bold', Number(l.amount) < 0 && 'text-red')}>{money(l.amount)}</div>
                      {editable && <IconButton icon={Trash2} label="Remove line" onClick={() => removeLine(l)} className="-mr-2 h-8 w-8 text-red hover:bg-red-soft" />}
                    </div>
                  ))}
                </List>
              )}
            </Section>

            <Tile className="mt-6">
              <div className="space-y-2 text-body">
                <div className="flex justify-between"><span className="text-muted">Shifts</span><span className="num">{money(shiftTotal)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Adjustments</span><span className="num">{money(extrasTotal)}</span></div>
                <div className="flex justify-between border-t border-line pt-2 text-headline font-bold"><span>Total payable</span><span className="num">{money(st.total)}</span></div>
              </div>
              <p className="mt-3 text-caption text-faint">Self-employed contractor. No tax or National Insurance deducted.</p>
              {isCo && draft && st.self_locked && <p className="mt-2 text-footnote text-muted">This is your own statement. {SELF_HINT}.</p>}
            </Tile>

            {editable && !shiftLines.length && (
              <div className="mt-6 flex justify-center">
                <Button variant="danger" icon={Trash2} busy={busy} onClick={del}>Delete draft</Button>
              </div>
            )}

            <RecordHistory entity="statement" id={st.id} />

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

