import { useParams } from 'react-router-dom';
import { Banknote, Download, FileText, Info } from 'lucide-react';
import { downloadAction } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Bento, Button, date, dateShort, hours, List, Load, money, Page, Pill, Row, Section, Stat, Tile, useAction, useApi,
} from '../../ui/index.jsx';
import { NotLinked } from './_parts.jsx';

const SELF_EMPLOYED = 'You are self-employed: no tax or NI has been deducted.';
const STATUS_LABEL = { issued: 'Issued', paid: 'Paid' };
const KIND_TITLE = { hours: 'Hours worked', bonus: 'Bonuses', expense: 'Expenses', deduction: 'Deductions' };

export default function Pay() {
  const { id } = useParams();
  const { user } = useAuth();
  if (!user.officer_id) return <Page title="Pay"><NotLinked /></Page>;
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
    <Page title="Pay" subtitle="Your remittance statements">
      <Load q={q} skeleton="rows">
        {(rows) => {
          if (!rows.length) {
            return (
              <div className="space-y-3">
                <SelfEmployedNote />
                <div className="rounded-tile bg-surface px-6 py-12 text-center shadow-tile">
                  <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-blue-soft text-blue"><FileText size={24} /></div>
                  <div className="text-callout font-semibold">No statements yet</div>
                  <p className="mx-auto mt-1 max-w-sm text-subhead text-muted">Once your timesheets are approved and pay is run, your statements appear here.</p>
                </div>
              </div>
            );
          }
          const latest = rows[0];
          const year = new Date().getFullYear();
          const ytd = rows.filter((r) => String(r.period_end).startsWith(String(year)));
          const ytdTotal = ytd.reduce((a, r) => a + Number(r.total || 0), 0);
          const ytdHours = ytd.reduce((a, r) => a + Number(r.hours || 0), 0);
          return (
            <div className="space-y-3">
              <Tile tone="blue" to={`/officer/pay/${latest.id}`} className="!p-6">
                <div className="flex items-center justify-between">
                  <span className="text-footnote font-semibold uppercase tracking-wide opacity-80">Latest statement</span>
                  <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-caption font-semibold">{latest.status === 'paid' ? 'Paid' : 'Awaiting payment'}</span>
                </div>
                <div className="display num mt-3 text-[40px] font-bold leading-none">{money(latest.total)}</div>
                <div className="mt-2 text-body opacity-85">{dateShort(latest.period_start)} – {date(latest.period_end)} · {hours(latest.hours)}</div>
                {latest.status === 'paid' && latest.paid_at && <div className="mt-1 text-footnote opacity-75">Paid on {date(latest.paid_at)}</div>}
              </Tile>

              <Bento className="!grid-cols-2">
                <Tile title={`${year} so far`} icon={Banknote}><Stat value={money(ytdTotal)} label={`${ytd.length} statement${ytd.length === 1 ? '' : 's'}`} /></Tile>
                <Tile title="Hours paid"><Stat value={hours(ytdHours)} label={`In ${year}`} /></Tile>
              </Bento>

              <SelfEmployedNote />

              <Section title="All statements">
                <List>
                  {rows.map((r) => (
                    <Row key={r.id} to={`/officer/pay/${r.id}`}
                      title={`${dateShort(r.period_start)} – ${date(r.period_end)}`}
                      subtitle={`${r.number || 'Statement'} · ${hours(r.hours)}`}
                      right={<div className="flex flex-col items-end gap-1"><span className="num font-bold">{money(r.total)}</span><Pill status={r.status}>{STATUS_LABEL[r.status]}</Pill></div>} />
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
  const pdf = () => run(() => downloadAction('pay.pdf', { id })).catch(() => {});
  return (
    <Page title="Statement" back={{ to: '/officer/pay', label: 'Pay' }}
      actions={q.data && <Button variant="secondary" icon={Download} busy={busy} onClick={pdf}>PDF</Button>}>
      <Load q={q} skeleton="rows">
        {(st) => {
          const lines = st.lines || [];
          const groups = ['hours', 'bonus', 'expense', 'deduction'].map((k) => ({ k, items: lines.filter((l) => l.kind === k) })).filter((g) => g.items.length);
          return (
            <div className="space-y-3">
              <section className="rounded-tile bg-surface p-6 text-center shadow-tile">
                <Pill status={st.status}>{st.status === 'paid' ? 'Paid' : 'Issued, awaiting payment'}</Pill>
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
                <Section key={g.k} title={KIND_TITLE[g.k]}>
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

              <Section title="Details">
                <List>
                  <Row title="Statement number" right={<span className="font-semibold">{st.number || '—'}</span>} />
                  <Row title="UTR" right={<span className="num font-semibold">{st.utr || 'Not on file'}</span>} />
                </List>
                {!st.utr && <p className="mt-2 px-1 text-footnote text-muted">Add your UTR in your profile so it appears on your statements.</p>}
              </Section>

              <Button size="lg" variant="secondary" icon={Download} className="w-full" busy={busy} onClick={pdf}>Download PDF</Button>
            </div>
          );
        }}
      </Load>
    </Page>
  );
}
