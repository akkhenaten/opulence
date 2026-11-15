import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertTriangle, Banknote, Check, CircleMinus, ClipboardCheck, Clock3, Download, FileText, Gift, Info, MessageSquare, Receipt } from 'lucide-react';
import { api, downloadAction } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Bento, Button, date, dateShort, dateTime, hours, List, Load, money, Page, Pill, Row, Section, Select, Sheet, Stat, Textarea, Tile, useAction, useApi, useConfirm,
} from '../../ui/index.jsx';
import { NotLinked } from './_parts.jsx';

const ME = { to: '/officer/me', label: 'Me' };
const SELF_EMPLOYED = 'You are self-employed: no tax or NI has been deducted.';
const STATUS_LABEL = { issued: 'Issued', paid: 'Paid', draft: 'To check' };
// A draft the office has sent for checking and the officer can still answer
const toCheck = (r) => r.status === 'draft' && r.run_status === 'in_review' && ['pending', 'no_response'].includes(r.review_status);
const REVIEW_TEXT = { pending: 'Please check', no_response: 'Please check', approved: 'You approved this', disputed: 'Query with the office', resolved: 'Query resolved' };
const KIND_TITLE = { hours: 'Hours worked', bonus: 'Bonuses', expense: 'Expenses', deduction: 'Deductions' };
const KIND_ICON = { hours: Clock3, bonus: Gift, expense: Receipt, deduction: CircleMinus };

export default function Pay() {
  const { id } = useParams();
  const { user } = useAuth();
  if (!user.officer_id) return <Page title="Pay" back={ME}><NotLinked /></Page>;
  return id ? <Statement id={id} /> : <Statements />;
}

function SelfEmployedNote() {
  return (
    <div className="flex gap-2.5 rounded-2xl bg-blue-soft px-4 py-3 text-subhead text-ink">
      <Info size={18} className="mt-0.5 shrink-0 text-blue" />
      <p>{SELF_EMPLOYED} Keep these statements for your Self Assessment tax return.</p>
    </div>
  );
}

function Statements() {
  const q = useApi('pay.list');
  return (
    <Page title="Pay" subtitle="Your pay statements and year to date" back={ME}>
      <p className="mb-3 text-footnote text-muted">Your rates are in <Link to="/officer/profile" className="font-semibold text-blue">Profile and bank</Link></p>
      <Load q={q} skeleton="rows">
        {(rows) => {
          if (!rows.length) {
            return (
              <div className="space-y-3">
                <SelfEmployedNote />
                <div className="rounded-tile bg-surface px-6 py-12 text-center shadow-tile">
                  <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-blue-soft text-blue"><FileText size={24} /></div>
                  <div className="text-callout font-semibold">No statements yet</div>
                  <p className="mx-auto mt-1 max-w-sm text-subhead text-muted">Your statement appears here when the company runs pay. You'll be asked to check it before it's issued.</p>
                </div>
              </div>
            );
          }
          const checks = rows.filter(toCheck);
          const final = rows.filter((r) => r.status !== 'draft');
          const latest = final[0];
          const year = new Date().getFullYear();
          const ytd = final.filter((r) => String(r.period_end).startsWith(String(year)));
          const ytdTotal = ytd.reduce((a, r) => a + Number(r.total || 0), 0);
          const ytdHours = ytd.reduce((a, r) => a + Number(r.hours || 0), 0);
          return (
            <div className="space-y-3">
              {checks.map((c) => (
                <Tile key={c.id} to={`/officer/pay/${c.id}`} className="!bg-amber-soft">
                  <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface text-amber"><ClipboardCheck size={20} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="text-callout font-semibold">Please check your pay</div>
                      <div className="text-subhead">{dateShort(c.period_start)} – {date(c.period_end)} · <span className="num font-semibold">{money(c.total)}</span></div>
                      {c.review_deadline && <div className="text-footnote text-muted">Approve or tell us what's wrong by {dateTime(c.review_deadline)}</div>}
                    </div>
                  </div>
                </Tile>
              ))}
              {latest && <Tile tone="blue" to={`/officer/pay/${latest.id}`} className="!p-6">
                <div className="flex items-center justify-between">
                  <span className="text-footnote font-semibold uppercase tracking-wide opacity-80">Latest statement</span>
                  <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-caption font-semibold">{latest.status === 'paid' ? 'Paid' : 'Awaiting payment'}</span>
                </div>
                <div className="display num mt-3 text-[40px] font-bold leading-none">{money(latest.total)}</div>
                <div className="mt-2 text-body opacity-85">{dateShort(latest.period_start)} – {date(latest.period_end)} · {hours(latest.hours)}</div>
                {latest.status === 'paid' && latest.paid_at && <div className="mt-1 text-footnote opacity-75">Paid on {date(latest.paid_at)}</div>}
              </Tile>}

              {ytd.length > 0 && <Bento className="!grid-cols-2">
                <Tile title={`${year} so far`} icon={Banknote}><Stat value={money(ytdTotal)} label={`${ytd.length} statement${ytd.length === 1 ? '' : 's'}`} /></Tile>
                <Tile title="Hours paid" icon={Clock3}><Stat value={hours(ytdHours)} label={`In ${year}`} /></Tile>
              </Bento>}

              <SelfEmployedNote />

              <Section title="All statements" icon={FileText} count={rows.length}>
                <List>
                  {rows.map((r) => (
                    <Row key={r.id} to={`/officer/pay/${r.id}`}
                      title={`${dateShort(r.period_start)} – ${date(r.period_end)}`}
                      subtitle={`${r.number || 'Statement'} · ${hours(r.hours)}`}
                      right={<div className="flex flex-col items-end gap-1"><span className="num font-bold">{money(r.total)}</span>{r.status === 'draft' ? <Pill status={r.review_status}>{REVIEW_TEXT[r.review_status] || 'Draft'}</Pill> : <Pill status={r.status}>{STATUS_LABEL[r.status]}</Pill>}</div>} />
                  ))}
                </List>
              </Section>
            </div>
          );
        }}
      </Load>
    </Page>
  );
}

function Statement({ id }) {
  const q = useApi('pay.get', { id });
  const [run, busy] = useAction();
  const [act, actBusy] = useAction();
  const [querying, setQuerying] = useState(false);
  const confirm = useConfirm();
  const pdf = () => run(() => downloadAction('pay.pdf', { id })).catch(() => {});
  return (
    <Page title="Statement" back={{ to: '/officer/pay', label: 'Pay' }}
      actions={q.data && <Button variant="secondary" icon={Download} iconOnly="phone" busy={busy} onClick={pdf}>PDF</Button>}>
      <Load q={q} skeleton="rows">
        {(st) => {
          const lines = st.lines || [];
          const groups = ['hours', 'bonus', 'expense', 'deduction'].map((k) => ({ k, items: lines.filter((l) => l.kind === k) })).filter((g) => g.items.length);
          const draft = st.status === 'draft';
          const open = (st.disputes || []).filter((d) => d.status === 'open');
          const canAnswer = draft && st.run?.status === 'in_review' && ['pending', 'no_response', 'disputed', 'resolved'].includes(st.review_status);
          const approve = async () => {
            if (!(await confirm({ title: 'Approve this statement?', body: `You confirm ${money(st.total)} for ${dateShort(st.period_start)} – ${date(st.period_end)} is right.`, confirm: 'Approve' }))) return;
            await act(() => api('pay.review', { statement_id: st.id, approve: true }), 'Thanks, approved').catch(() => {});
            q.reload();
          };
          return (
            <div className="space-y-3">
              {draft && (
                <div className="rounded-tile bg-amber-soft p-4">
                  <div className="flex gap-2.5">
                    {open.length ? <MessageSquare size={20} className="mt-0.5 shrink-0 text-amber" /> : <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber" />}
                    <div className="min-w-0 flex-1 text-subhead">
                      {open.length ? <p><b>Your query is with the office.</b> They will reply in the thread and update your statement.</p>
                        : st.review_status === 'approved' ? <p><b>You approved this statement.</b> It will be issued once the office finalises the pay run.</p>
                          : canAnswer ? <p><b>Please check this statement.</b> {st.run?.review_deadline ? `Approve it or tell us what's wrong by ${dateTime(st.run.review_deadline)}.` : "Approve it or tell us what's wrong."}</p>
                            : <p><b>Draft.</b> This statement has not been issued yet.</p>}
                    </div>
                  </div>
                  {canAnswer && !open.length && st.review_status !== 'approved' && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button icon={Check} busy={actBusy} onClick={approve}>Approve</Button>
                      <Button variant="secondary" icon={MessageSquare} onClick={() => setQuerying(true)}>Something's wrong</Button>
                    </div>
                  )}
                  {canAnswer && st.review_status === 'approved' && <Button size="sm" variant="link" className="mt-2" onClick={() => setQuerying(true)}>Spotted a problem? Tell us</Button>}
                </div>
              )}

              {(st.disputes || []).length > 0 && (
                <Section title="Your queries" icon={MessageSquare} count={st.disputes.length}>
                  <List>
                    {st.disputes.map((d) => (
                      <div key={d.id} className="px-4 py-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-footnote font-semibold text-muted">{d.line_description}</span>
                          <Pill status={d.status}>{d.status === 'open' ? 'With the office' : 'Resolved'}</Pill>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap text-subhead">{d.comment}</p>
                        {d.resolution && <p className="mt-1.5 rounded-xl bg-green-soft px-3 py-2 text-footnote">{d.resolution}</p>}
                        {d.conversation_id && <Button size="sm" variant="link" icon={MessageSquare} to={`/officer/messages/${d.conversation_id}`}>Open thread</Button>}
                      </div>
                    ))}
                  </List>
                </Section>
              )}

              <section className="rounded-tile bg-surface p-6 text-center shadow-tile">
                {draft ? <Pill status="pending">Not yet issued</Pill> : <Pill status={st.status}>{st.status === 'paid' ? 'Paid' : 'Issued, awaiting payment'}</Pill>}
                <div className="display num mt-3 text-[44px] font-bold leading-none">{money(st.total)}</div>
                <div className="mt-2 text-body text-muted">{dateShort(st.period_start)} – {date(st.period_end)}</div>
                <div className="mt-4 grid grid-cols-3 divide-x divide-line rounded-2xl bg-bg py-3 text-footnote">
                  <div><div className="num text-headline font-bold">{hours(st.hours)}</div><div className="text-muted">Hours</div></div>
                  <div><div className="text-body font-bold">{st.issued_at ? dateShort(st.issued_at) : '—'}</div><div className="text-muted">Issued</div></div>
                  <div><div className="text-body font-bold">{st.paid_at ? dateShort(st.paid_at) : '—'}</div><div className="text-muted">Paid</div></div>
                </div>
              </section>

              <SelfEmployedNote />

              {groups.map((g) => (
                <Section key={g.k} title={KIND_TITLE[g.k]} icon={KIND_ICON[g.k]} count={g.items.length}>
                  <List>
                    {g.items.map((l) => (
                      <Row key={l.id} title={l.description}
                        subtitle={g.k === 'hours' ? [l.work_date && dateShort(l.work_date), l.hours != null && `${hours(l.hours)} × ${money(l.rate)}`].filter(Boolean).join(' · ') : l.work_date ? dateShort(l.work_date) : null}
                        right={<span className={`num font-semibold ${Number(l.amount) < 0 ? 'text-red' : ''}`}>{money(l.amount)}</span>} />
                    ))}
                  </List>
                </Section>
              ))}

              <div className="flex items-center justify-between rounded-tile bg-surface px-5 py-4 shadow-tile">
                <span className="text-headline font-bold">Total</span>
                <span className="num text-title2 font-bold">{money(st.total)}</span>
              </div>

              <Section title="Details" icon={Info}>
                <List>
                  <Row title="Statement number" right={<span className="font-semibold">{st.number || '—'}</span>} />
                  <Row title="UTR" right={<span className="num font-semibold">{st.utr || 'Not on file'}</span>} />
                </List>
                {!st.utr && <p className="mt-2 px-1 text-footnote text-muted">Add your UTR in your profile so it appears on your statements.</p>}
              </Section>

              <Button size="lg" variant="secondary" icon={Download} className="w-full" busy={busy} onClick={pdf}>Download PDF</Button>
              {querying && <QuerySheet st={st} onClose={() => setQuerying(false)} onDone={q.reload} />}
            </div>
          );
        }}
      </Load>
    </Page>
  );
}

function QuerySheet({ st, onClose, onDone }) {
  const [line, setLine] = useState('');
  const [text, setText] = useState('');
  const [run, busy] = useAction();
  const send = () => run(() => api('pay.review', { statement_id: st.id, dispute: { line_id: line || undefined, comment: text.trim() } }), 'Sent to the office')
    .then(() => { onDone(); onClose(); }).catch(() => {});
  return (
    <Sheet open onClose={onClose} title="What looks wrong?"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button icon={MessageSquare} busy={busy} disabled={text.trim().length < 3} onClick={send}>Send</Button></>}>
      <div className="space-y-4">
        <Select label="Which line?" value={line} onChange={(e) => setLine(e.target.value)} placeholder="The whole statement"
          options={(st.lines || []).map((l) => ({ value: l.id, label: `${l.work_date ? `${dateShort(l.work_date)} · ` : ''}${l.description} · ${money(l.amount)}` }))} />
        <Textarea label="Tell us what's wrong" rows={4} autoFocus placeholder="e.g. I stayed until 3am on Saturday, not 2am." value={text} onChange={(e) => setText(e.target.value)}
          hint="The office gets your message straight away and replies in a chat thread." />
      </div>
    </Sheet>
  );
}
