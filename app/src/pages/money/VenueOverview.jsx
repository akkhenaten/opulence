import { useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { CalendarDays, CircleAlert, Mail, Phone, Radio, UserRound } from 'lucide-react';
import { Avatar, Button, cx, dayLabel, Empty, List, LoadFail, money, Pill, range, Row, Section, SkeletonRows, useApi } from '../../ui/index.jsx';
import { timesheetHref } from './_lines.jsx';

const DAY = 86400000;
const OPEN_INVOICE = ['issued', 'overdue'];

// What is happening at one venue: the coming week's cover, who is on site, what needs doing, and who to call.
// Only what the app already holds; money shows only to company users, as on Invoices.
export default function VenueOverview({ v, base, isCo, openTab }) {
  const loc = useLocation();
  const span = useMemo(() => { const now = Date.now(); return { from: new Date(now).toISOString(), to: new Date(now + 7 * DAY).toISOString() }; }, []);
  const shifts = useApi('shifts.list', { ...span, venue_id: v.id });
  const live = useApi('live.board', { venue_id: v.id }, { poll: 30000 });
  const toSign = useApi('timesheets.list', { venue_id: v.id, status: 'approved' });
  const queried = useApi('timesheets.list', { venue_id: v.id, status: 'disputed' });
  const invoices = useApi('invoices.list', { venue_id: v.id }, { skip: !isCo });

  const week = (shifts.data || []).filter((s) => s.status === 'published').sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const drafts = (shifts.data || []).filter((s) => s.status === 'draft').length;
  const onSite = (live.data || []).filter((r) => ['on_shift', 'on_break'].includes(r.state));
  const unpaid = (invoices.data || []).filter((i) => i.kind === 'invoice' && OPEN_INVOICE.includes(i.status));
  const hours = (r, why) => ({
    key: `ts-${r.id}`, title: `${r.officer_name} · ${dayLabel(r.starts_at)}`, subtitle: why,
    to: timesheetHref(base, { work_date: r.starts_at, timesheet_id: r.id }, loc.pathname, v.name),
  });
  const todo = [
    ...(queried.data || []).map((r) => hours(r, 'Hours queried by the venue: answer or correct them')),
    ...(toSign.data || []).map((r) => hours(r, 'Hours approved, waiting for the venue to sign')),
    ...unpaid.map((i) => ({
      key: `inv-${i.id}`, title: `${i.number || 'Invoice'} · ${money(i.gross)}`, to: `${base}/invoices/${i.id}`,
      subtitle: i.status === 'overdue' ? `Overdue since ${dayLabel(i.due_date)}` : `To pay${i.due_date ? ` by ${dayLabel(i.due_date)}` : ''}`, tone: i.status === 'overdue' ? 'red' : undefined,
    })),
    ...(v.feedback_open ? [{ key: 'fb', title: `${v.feedback_open} open feedback item${v.feedback_open === 1 ? '' : 's'}`, subtitle: 'From the venue or logged by the office', onClick: () => openTab('feedback') }] : []),
  ];
  const todoLoading = [toSign, queried, ...(isCo ? [invoices] : [])].some((x) => x.loading && !x.data);
  const MAX = 6;

  return (
    <div className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
      <div>
        <Section title="Next 7 days" icon={CalendarDays} className="mt-0" count={week.length}
          action={<Button size="sm" variant="link" to={`${base}/rota?venue=${v.id}`}>Rota</Button>}>
          <LoadFail q={shifts} what="shifts" className="mb-2" />
          {shifts.loading && !shifts.data ? <SkeletonRows n={3} /> : !shifts.error && (week.length ? (
            <List>
              {week.slice(0, 10).map((s) => {
                const short = s.filled < s.headcount;
                return (
                  <Row key={s.id} to={`${base}/shifts/${s.id}`} title={`${dayLabel(s.starts_at)} · ${range(s.starts_at, s.ends_at)}`} subtitle={s.role_name}
                    right={<Pill tone={short ? 'red' : 'green'}><span className="num">{s.filled}/{s.headcount}</span> {short ? 'short' : 'filled'}</Pill>} />
                );
              })}
            </List>
          ) : <Empty icon={CalendarDays} title="No published shifts in the next 7 days" body={drafts ? `${drafts} draft shift${drafts === 1 ? '' : 's'} not published yet.` : undefined} />)}
          {week.length > 10 && <p className="mt-2 px-1 text-footnote text-muted">And {week.length - 10} more on the Rota.</p>}
          {week.length > 0 && drafts > 0 && <p className="mt-2 px-1 text-footnote text-muted">Plus {drafts} draft shift{drafts === 1 ? '' : 's'} not published yet.</p>}
        </Section>

        <Section title="On site now" icon={Radio} count={onSite.length}>
          <LoadFail q={live} what="who is on site" className="mb-2" />
          {live.loading && !live.data ? <SkeletonRows n={2} /> : !live.error && (onSite.length ? (
            <List>
              {onSite.map((r) => (
                <Row key={r.assignment_id} to={`${base}/shifts/${r.shift_id}`} left={<Avatar name={r.officer_name} size={32} />} title={r.officer_name}
                  subtitle={`${r.role_name} · ${range(r.starts_at, r.ends_at)}${r.state === 'on_break' ? ' · on a break' : ''}`} />
              ))}
            </List>
          ) : <p className="px-1 text-subhead text-muted">Nobody is clocked in here right now.</p>)}
        </Section>
      </div>

      <div>
        <Section title="Needs action" icon={CircleAlert} count={todo.length} className="mt-6 lg:mt-0">
          {[queried, toSign, ...(isCo ? [invoices] : [])].map((x, i) => <LoadFail key={i} q={x} what={x === invoices ? 'invoices' : 'timesheets'} className="mb-2" />)}
          {todoLoading ? <SkeletonRows n={2} /> : todo.length ? (
            <List>
              {todo.slice(0, MAX).map((t) => <Row key={t.key} to={t.to} onClick={t.onClick} chevron={!!t.onClick} title={t.title} subtitle={<span className={cx(t.tone === 'red' && 'text-red')}>{t.subtitle}</span>} />)}
            </List>
          ) : <p className="px-1 text-subhead text-muted">Nothing waiting: no hours to sign or queried{isCo ? ', no invoices to pay' : ''} and no open feedback.</p>}
          {todo.length > MAX && <p className="mt-2 px-1 text-footnote text-muted">And {todo.length - MAX} more on Timesheets{isCo ? ' and Invoices' : ''}.</p>}
        </Section>

        <Section title="Site contact" icon={UserRound}>
          <List>
            {v.phone && <Row left={<Phone size={18} className="text-blue" aria-hidden />} title={<a href={`tel:${v.phone}`} className="text-blue">{v.phone}</a>} subtitle="Venue phone" />}
            {(v.contacts || []).map((c) => (
              <Row key={c.id} left={<Avatar name={c.name} size={32} />} title={c.name}
                subtitle={<span className="flex flex-wrap gap-x-3">
                  {c.phone && <a href={`tel:${c.phone}`} className="font-semibold text-blue"><Phone size={14} className="mr-0.5 inline" aria-hidden />{c.phone}</a>}
                  {c.email && <a href={`mailto:${c.email}`} className="font-semibold text-blue"><Mail size={14} className="mr-0.5 inline" aria-hidden />{c.email}</a>}
                  {!c.phone && !c.email && 'Venue manager'}
                </span>} />
            ))}
            {!v.phone && !(v.contacts || []).length && <Row title="No contact or phone yet" subtitle="Add the phone under Setup and venue managers under People" />}
          </List>
          <div className="mt-2 flex gap-1">
            <Button size="sm" variant="link" onClick={() => openTab('people')}>Venue people</Button>
            <Button size="sm" variant="link" onClick={() => openTab('setup')}>Setup</Button>
          </div>
        </Section>
      </div>
    </div>
  );
}
