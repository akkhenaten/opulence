// Pay runs: draft → staff review → finalised → issued → paid. Officers check their statement; queries are resolved here.
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Banknote, Check as CheckIcon, CircleDot, FileText, Lock, MessageSquare, Pause, Receipt, Send, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Avatar, Bento, Button, cx, date, dateShort, dateTime, Empty, hours, Input, List, Load, money, Page, Pill, Row, Section, Segmented, Select, Sheet, Stat, Textarea, Tile,
  useAction, useApi, useConfirm,
} from '../../ui/index.jsx';
import { useBase } from './_parts.jsx';

export const RUN_LABEL = { draft: 'Draft', in_review: 'With staff', reconciled: 'Finalised', issued: 'Issued', paid: 'Paid' };
export const REVIEW_LABEL = { pending: 'Waiting', approved: 'Approved', disputed: 'Query', no_response: 'No response', resolved: 'Resolved' };
const STEPS = ['draft', 'in_review', 'reconciled', 'issued', 'paid'];
const STEP_TEXT = { draft: 'Drafts created', in_review: 'Staff review', reconciled: 'Finalised', issued: 'Issued', paid: 'Paid' };
const periodOf = (r) => `${dateShort(r.period_start)} – ${date(r.period_end)}`;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Compact list of pay runs for the Pay page. */
export function RunsList({ reloadKey }) {
  const base = useBase();
  const runs = useApi('payRuns.list', { limit: 12, _k: reloadKey });
  return (
    <Section title="Pay runs">
      <Load q={runs} skeleton="rows" n={3}>
        {(rows) => (!rows.length ? <Empty icon={Banknote} title="No pay runs yet" body="Create drafts from signed timesheets to start a pay run." /> : (
          <List>
            {rows.map((r) => (
              <Row key={r.id} to={`${base}/pay/runs/${r.id}`} chevron
                left={<span className={cx('grid h-10 w-10 place-items-center rounded-xl', r.open_disputes ? 'bg-red-soft text-red' : 'bg-blue-soft text-blue')}>{r.open_disputes ? <AlertTriangle size={18} /> : <Banknote size={18} />}</span>}
                title={periodOf(r)}
                subtitle={[plural(r.statements, 'statement'), money(r.total), r.status === 'in_review' && `${r.approved + r.resolved} of ${r.statements} checked`, r.open_disputes && plural(r.open_disputes, 'open query', 'open queries')].filter(Boolean).join(' · ')}
                right={<Pill status={r.status}>{RUN_LABEL[r.status]}</Pill>} />
            ))}
          </List>
        ))}
      </Load>
    </Section>
  );
}

export default function PayRunDetail() {
  const { user } = useAuth();
  if (user.role === 'security' && !user.can_see_pay) {
    return <Page title="Pay run"><Empty icon={Lock} title="No access to pay" body="Ask a company manager to give you access to pay information." /></Page>;
  }
  return <Detail isCo={user.role === 'company'} />;
}

function Detail({ isCo }) {
  const { id } = useParams();
  const base = useBase();
  const nav = useNavigate();
  const q = useApi('payRuns.get', { id });
  const confirm = useConfirm();
  const [run, busy] = useAction();
  const [sheet, setSheet] = useState(null);

  return (
    <Load q={q} skeleton="page">
      {(r) => {
        const waiting = r.statements.filter((s) => s.status === 'draft' && ['pending', 'no_response'].includes(s.review_status)).length;
        const toIssue = r.statements.filter((s) => s.status === 'draft' && !s.held).length;
        const held = r.statements.filter((s) => s.held && s.status === 'draft');
        const open = r.disputes.filter((d) => d.status === 'open');
        const reload = q.reload;

        const finalise = async (choice) => {
          const res = await run(() => api('payRuns.finalise', { id: r.id, no_response: choice }), (x) => (x.held ? `Finalised · ${plural(x.held, 'statement')} held back` : 'Pay run finalised')).catch(() => null);
          if (res) { setSheet(res.reconcile?.created ? { kind: 'reconcile', data: res.reconcile } : null); reload(); }
        };
        const startFinalise = async () => {
          if (waiting) return setSheet({ kind: 'finalise' });
          if (!(await confirm({ title: 'Finalise this pay run?', body: r.status === 'draft' ? 'Statements are approved without sending them to staff first. Ops AI then checks rota, clock and timesheet hours line up.' : 'Ops AI checks rota, clock and timesheet hours line up. After this you can issue the statements.', confirm: 'Finalise' }))) return;
          finalise();
        };
        const issue = async () => {
          if (!(await confirm({ title: `Issue ${plural(toIssue, 'statement')}?`, body: 'Each officer is emailed their statement and a PDF copy is saved in their documents. Issued statements cannot be edited.', confirm: 'Issue' }))) return;
          await run(() => api('payRuns.issue', { id: r.id }), (x) => `${x.issued} issued`).catch(() => {});
          reload();
        };
        const markPaid = async () => {
          if (!(await confirm({ title: 'Mark the run as paid?', body: `Officers with an issued statement are told their payment is on its way.`, confirm: 'Mark paid' }))) return;
          await run(() => api('payRuns.markPaid', { id: r.id }), (x) => `${x.paid} marked paid`).catch(() => {});
          reload();
        };
        const release = async (s) => {
          if (!(await confirm({ title: `Release ${s.officer_name}?`, body: 'Their statement is approved and goes out with the next issue.', confirm: 'Release' }))) return;
          await run(() => api('payRuns.release', { statement_id: s.id }), 'Released').catch(() => {});
          reload();
        };
        const del = async () => {
          if (!(await confirm({ title: 'Delete this pay run?', body: 'All its draft statements are deleted and the timesheets go back into the next run.', confirm: 'Delete', danger: true }))) return;
          const ok = await run(() => api('payRuns.delete', { id: r.id }), 'Pay run deleted').then(() => true, () => false);
          if (ok) nav(`${base}/pay`);
        };

        return (
          <Page title={periodOf(r)} subtitle={`Pay run${r.created_via === 'ai' ? ' · started by Ask Orb' : ''}${r.created_by_name ? ` · ${r.created_by_name}` : ''}`}
            back={{ to: `${base}/pay`, label: 'Pay runs' }}
            actions={isCo && <>
              {r.status === 'draft' && <Button variant="secondary" icon={Send} onClick={() => setSheet({ kind: 'review' })}>Send for review</Button>}
              {['draft', 'in_review'].includes(r.status) && <Button icon={ShieldCheck} busy={busy} disabled={open.length > 0} title={open.length ? 'Resolve the open queries first' : undefined} onClick={startFinalise}>Finalise</Button>}
              {['reconciled', 'issued'].includes(r.status) && toIssue > 0 && <Button icon={Send} busy={busy} onClick={issue}>Issue {toIssue}</Button>}
              {r.status === 'issued' && r.issued > 0 && <Button variant={toIssue ? 'secondary' : 'primary'} icon={CheckIcon} busy={busy} onClick={markPaid}>Mark paid</Button>}
            </>}>
            <Timeline status={r.status} />

            <Bento className="mb-2">
              <Tile tone="blue" className="col-span-2">
                <div className="flex items-start justify-between gap-3">
                  <Stat value={money(r.total)} label={plural(r.statements.length, 'statement')} hint={hours(r.hours)} />
                  <Pill tone="ink">{RUN_LABEL[r.status]}</Pill>
                </div>
              </Tile>
              <Tile title="Checked by staff"><Stat value={`${r.approved + r.resolved}/${r.statements.length}`} label={r.pending ? `${r.pending} still to respond` : 'Approved or resolved'} tone={r.pending ? undefined : 'green'} /></Tile>
              <Tile title="Queries"><Stat value={open.length} label={open.length ? 'Need an answer' : `${r.disputes.length} in total`} tone={open.length ? 'red' : undefined} /></Tile>
            </Bento>

            {r.status === 'in_review' && r.review_deadline && (
              <div className="mb-4 flex items-start gap-2.5 rounded-2xl bg-amber-soft px-4 py-3 text-subhead">
                <CircleDot size={18} className="mt-0.5 shrink-0 text-amber" />
                <p>Staff have until <b>{dateTime(r.review_deadline)}</b> to approve or query their statement.{r.no_response ? ` ${plural(r.no_response, 'officer')} did not respond.` : ''}</p>
              </div>
            )}

            {r.disputes.length > 0 && (
              <Section title="Pay queries">
                <List>
                  {r.disputes.map((d) => (
                    <div key={d.id} className="px-4 py-3">
                      <div className="flex items-start gap-3">
                        <Avatar name={d.officer_name} size={36} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-body font-semibold">{d.officer_name}</span>
                            <Pill status={d.status}>{d.status === 'open' ? 'Open' : 'Resolved'}</Pill>
                          </div>
                          <div className="text-footnote text-muted">{d.line_description} · {dateShort(d.created_at)}</div>
                          <p className="mt-1 whitespace-pre-wrap text-subhead">{d.comment}</p>
                          {d.resolution && <p className="mt-1.5 rounded-xl bg-green-soft px-3 py-2 text-footnote"><b>{d.resolved_by_name || 'Office'}:</b> {d.resolution}</p>}
                          <div className="mt-2 flex flex-wrap gap-2">
                            {d.conversation_id && <Button size="sm" variant="secondary" icon={MessageSquare} to={`${base}/messages/${d.conversation_id}`}>Thread</Button>}
                            {isCo && d.status === 'open' && <Button size="sm" icon={CheckIcon} onClick={() => setSheet({ kind: 'resolve', dispute: d })}>Resolve</Button>}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </List>
              </Section>
            )}

            {held.length > 0 && (
              <Section title="Held back">
                <List>
                  {held.map((s) => (
                    <Row key={s.id} left={<Pause size={18} className="text-amber" />} title={s.officer_name} subtitle={`${money(s.total)} · did not respond`}
                      right={isCo && <Button size="sm" variant="soft" busy={busy} onClick={() => release(s)}>Release</Button>} />
                  ))}
                </List>
              </Section>
            )}

            <Section title="Statements">
              {!r.statements.length ? <Empty icon={FileText} title="No statements in this run" /> : (
                <List>
                  {r.statements.map((s) => (
                    <Row key={s.id} to={`${base}/pay/${s.id}`} chevron left={<Avatar name={s.officer_name} size={36} />}
                      title={s.officer_name} subtitle={`${s.number || 'Draft'} · ${hours(s.hours)} · ${money(s.total)}`}
                      right={<div className="flex flex-col items-end gap-1">
                        {s.status !== 'draft' ? <Pill status={s.status} /> : s.held ? <Pill status="held">Held</Pill> : s.review_status ? <Pill status={s.review_status}>{REVIEW_LABEL[s.review_status]}</Pill> : <Pill status="draft">Not sent</Pill>}
                      </div>} />
                  ))}
                </List>
              )}
            </Section>

            {isCo && ['reconciled', 'issued', 'paid'].includes(r.status) && (
              <Section title="Invoices" action={<Button size="sm" variant="soft" icon={Receipt} to={`/company/invoices?start=${r.period_start}&end=${r.period_end}`}>Invoices</Button>}>
                {!r.invoices.length ? <p className="px-1 text-subhead text-muted">No invoices for this run yet. Only hours approved by staff in a finalised run are invoiced.</p> : (
                  <List>
                    {r.invoices.map((i) => <Row key={i.id} to={`/company/invoices/${i.id}`} chevron title={i.venue_name} subtitle={i.number || 'Draft'} right={<div className="flex items-center gap-2"><span className="num font-semibold">{money(i.gross)}</span><Pill status={i.status} /></div>} />)}
                  </List>
                )}
              </Section>
            )}

            {isCo && ['draft', 'in_review', 'reconciled'].includes(r.status) && !r.issued && !r.paid && (
              <div className="mt-6 flex justify-center"><Button variant="danger" icon={Trash2} busy={busy} onClick={del}>Delete pay run</Button></div>
            )}

            {sheet?.kind === 'review' && <ReviewSheet run={r} onClose={() => setSheet(null)} onDone={reload} />}
            {sheet?.kind === 'finalise' && <FinaliseSheet waiting={waiting} busy={busy} onClose={() => setSheet(null)} onPick={(c) => finalise(c)} />}
            {sheet?.kind === 'resolve' && <ResolveSheet dispute={sheet.dispute} onClose={() => setSheet(null)} onDone={reload} />}
            {sheet?.kind === 'reconcile' && <ReconcileSheet data={sheet.data} onClose={() => setSheet(null)} />}
          </Page>
        );
      }}
    </Load>
  );
}

function Timeline({ status }) {
  const at = STEPS.indexOf(status);
  return (
    <ol className="no-scrollbar mb-4 flex items-center gap-1 overflow-x-auto rounded-tile bg-surface px-4 py-3 shadow-tile">
      {STEPS.map((s, i) => (
        <li key={s} className="flex shrink-0 items-center gap-1">
          <span className={cx('grid h-6 w-6 place-items-center rounded-full text-caption font-bold', i < at ? 'bg-green text-white' : i === at ? 'bg-blue text-white' : 'bg-fill text-muted')}>
            {i < at ? <CheckIcon size={14} /> : i + 1}
          </span>
          <span className={cx('text-footnote font-semibold', i === at ? 'text-ink' : 'hidden text-muted sm:inline')}>{STEP_TEXT[s]}</span>
          {i < STEPS.length - 1 && <span className={cx('mx-1.5 h-px w-6', i < at ? 'bg-green' : 'bg-line')} />}
        </li>
      ))}
    </ol>
  );
}

function ReviewSheet({ run: r, onClose, onDone }) {
  const [days, setDays] = useState('3');
  const [run, busy] = useAction();
  const send = () => run(() => api('payRuns.sendForReview', { id: r.id, deadline_days: Number(days) }), (x) => `Sent to ${plural(x.sent, 'officer')}`)
    .then(() => { onDone(); onClose(); }).catch(() => {});
  return (
    <Sheet open onClose={onClose} title="Send to staff for review" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={Send} busy={busy} onClick={send}>Send</Button></>}>
      <div className="space-y-4">
        <p className="text-subhead text-muted">Each of the {plural(r.statements.length, 'officer')} gets a push and an email asking them to approve their statement or tell you what looks wrong.</p>
        <Select label="Deadline" value={days} onChange={(e) => setDays(e.target.value)}
          options={[1, 2, 3, 4, 5, 6, 7].map((n) => ({ value: String(n), label: plural(n, 'day') }))}
          hint={Number(days) > 2 ? 'A reminder goes out 48 hours before the deadline.' : 'Short deadline: no separate reminder.'} />
        <p className="text-caption text-faint">Anyone who does not respond by the deadline is marked "No response". You then choose to approve on their behalf or hold them back.</p>
      </div>
    </Sheet>
  );
}

function FinaliseSheet({ waiting, busy, onClose, onPick }) {
  const [choice, setChoice] = useState('approve');
  return (
    <Sheet open onClose={onClose} title="Finalise pay run" size="sm"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={ShieldCheck} busy={busy} onClick={() => onPick(choice)}>Finalise</Button></>}>
      <div className="space-y-4">
        <p className="text-subhead">{plural(waiting, 'officer has', 'officers have')} not approved their statement. What should happen to {waiting === 1 ? 'it' : 'them'}?</p>
        <Segmented full value={choice} onChange={setChoice} options={[{ value: 'approve', label: 'Approve for them' }, { value: 'hold', label: 'Hold back' }]} />
        <p className="text-footnote text-muted">{choice === 'approve' ? 'Their statements are issued with everyone else.' : 'Their statements stay as drafts. Release them from this page when they get in touch.'}</p>
      </div>
    </Sheet>
  );
}

function ResolveSheet({ dispute: d, onClose, onDone }) {
  const st = useApi('pay.get', { id: d.statement_id });
  const line = st.data?.lines?.find((l) => l.id === d.line_id);
  const [text, setText] = useState('');
  const [fix, setFix] = useState('none');
  const [h, setH] = useState('');
  const [adj, setAdj] = useState({ kind: 'bonus', amount: '', description: '' });
  const [run, busy] = useAction();
  const canHours = line?.kind === 'hours';
  const ok = text.trim().length >= 2 && (fix !== 'hours' || h !== '') && (fix !== 'adjust' || Number(adj.amount) > 0);
  const save = () => run(() => api('payRuns.resolveDispute', {
    dispute_id: d.id, resolution: text.trim(),
    line_hours: fix === 'hours' ? Number(h) : undefined,
    adjustment: fix === 'adjust' ? { kind: adj.kind, amount: Math.abs(Number(adj.amount)), description: adj.description.trim() || undefined } : undefined,
  }), (x) => `Resolved · new total ${money(x.total)}`).then(() => { onDone(); onClose(); }).catch(() => {});

  return (
    <Sheet open onClose={onClose} title={`Resolve query · ${d.officer_name}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={CheckIcon} busy={busy} disabled={!ok} onClick={save}>Resolve</Button></>}>
      <div className="space-y-4">
        <div className="rounded-2xl bg-bg px-4 py-3">
          <div className="text-footnote font-semibold text-muted">{d.line_description}</div>
          <p className="mt-1 whitespace-pre-wrap text-subhead">{d.comment}</p>
          {line && canHours && <div className="mt-1 text-caption text-faint num">On the statement: {hours(line.hours)} × {money(line.rate)}/h = {money(line.amount)}</div>}
        </div>
        <Segmented full value={fix} onChange={setFix} options={[
          { value: 'none', label: 'No change' }, ...(canHours ? [{ value: 'hours', label: 'Correct hours' }] : []), { value: 'adjust', label: 'Add a line' },
        ]} />
        {fix === 'hours' && <Input label="Correct hours" type="number" inputMode="decimal" step="0.25" min="0" max="24" value={h} onChange={(e) => setH(e.target.value)} hint={line ? `Was ${Number(line.hours)} h. The amount follows the line's rate.` : undefined} />}
        {fix === 'adjust' && (
          <div className="space-y-3">
            <Segmented value={adj.kind} onChange={(k) => setAdj({ ...adj, kind: k })} options={[{ value: 'bonus', label: 'Bonus' }, { value: 'expense', label: 'Expense' }, { value: 'deduction', label: 'Deduction' }]} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Amount (£)" type="number" inputMode="decimal" step="0.01" min="0" value={adj.amount} onChange={(e) => setAdj({ ...adj, amount: e.target.value })} />
              <Input label="Description" placeholder="Correction after pay query" value={adj.description} onChange={(e) => setAdj({ ...adj, description: e.target.value })} />
            </div>
          </div>
        )}
        <Textarea label="Reply to the officer" rows={3} placeholder="e.g. You're right, the clock-out was missed. Corrected to 6.5 hours." value={text} onChange={(e) => setText(e.target.value)} hint="Posted in the query thread and sent to them." />
      </div>
    </Sheet>
  );
}

function ReconcileSheet({ data, onClose }) {
  return (
    <Sheet open onClose={onClose} title="Hours check" size="sm" footer={<><Button variant="secondary" to="/company/ops">Open Ops AI</Button><Button onClick={onClose}>OK</Button></>}>
      <div className="flex gap-3">
        <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber" />
        <p className="text-subhead">The run is finalised. Ops AI checked {plural(data.checked, 'timesheet')} and found {plural(data.created, 'difference')} between rota, clock and timesheet hours. Each one is waiting in Ops AI for your decision. It is worth a look before you issue.</p>
      </div>
    </Sheet>
  );
}
