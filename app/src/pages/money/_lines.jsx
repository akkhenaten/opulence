// Invoice / statement / pay run lines laid out like the Timesheets week table: a header row per shift day with its totals,
// rows tinted by where the timesheet stands (venue signed, awaiting sign-off) and lines added by hand at the end.
import { Fragment, useMemo } from 'react';
import { Check, Clock, History, PenLine } from 'lucide-react';
import { cx, dayLabel, hours, money, Pill } from '../../ui/index.jsx';

const LOOK = {
  signed: { label: 'Venue signed', row: 'bg-green-soft/40', edge: 'border-l-green', tone: 'green', icon: Check },
  awaiting: { label: 'Awaiting venue sign-off', row: 'bg-amber-soft/40', edge: 'border-l-amber', tone: 'amber', icon: Clock },
  manual: { label: 'Added by hand', row: '', edge: 'border-l-line', tone: 'grey', icon: PenLine },
};

const iso = (d) => (d ? String(d).slice(0, 10) : null);
export const lineLook = (l) => (!l.timesheet_id ? 'manual' : l.ts_status === 'signed' ? 'signed' : 'awaiting');
// A late line missed its own (already billed) period and rides on this draft, marked with its real shift date
export const isLateLine = (l, periodStart) => !!(l.timesheet_id && periodStart && iso(l.work_date) && iso(l.work_date) < iso(periodStart));

/**
 * lines: [{ id, timesheet_id, ts_status, work_date, description, hours, rate, amount, ... }]
 * extra: more columns [{ key, label, render(l), total?(lines) }] shown after Amount (desktop) and as a footnote line (phone)
 * who(l): optional first column (officer name on a pay run); onRow(l): open a line; action(l): trailing button(s)
 */
export function DayLines({ lines, periodStart, extra = [], who, onRow, action, empty = 'No lines yet', showState = true }) {
  const groups = useMemo(() => {
    const m = new Map();
    for (const l of [...lines].sort((a, b) => (iso(a.work_date) || '9999').localeCompare(iso(b.work_date) || '9999'))) {
      const k = l.timesheet_id && iso(l.work_date) ? iso(l.work_date) : 'manual';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(l);
    }
    return [...m.entries()];
  }, [lines]);
  if (!lines.length) return <p className="rounded-tile bg-surface py-8 text-center text-subhead text-faint shadow-tile">{empty}</p>;

  const head = (k) => (k === 'manual' ? 'Added by hand' : dayLabel(k));
  const sum = (ls, f) => ls.reduce((a, l) => a + Number(l[f] || 0), 0);
  const dayTotal = (ls) => {
    const h = sum(ls, 'hours');
    return [h ? hours(h) : null, money(sum(ls, 'amount'))].filter(Boolean).join(' · ');
  };
  const cols = 4 + (who ? 1 : 0) + extra.length + (action ? 1 : 0);

  return (
    <>
      {/* Phone: day sections of cards */}
      <div className="md:hidden">
        {groups.map(([k, ls]) => (
          <section key={k} className="mb-1">
            <div className="flex items-center justify-between gap-2 px-1 py-2">
              <span className="text-footnote font-semibold uppercase tracking-wide text-muted">{head(k)}</span>
              <span className="num truncate text-caption text-muted">{dayTotal(ls)}</span>
            </div>
            <div className="mb-2 space-y-2">
              {ls.map((l) => {
                const lk = LOOK[lineLook(l)];
                return (
                  <div key={l.id} role={onRow ? 'button' : undefined} tabIndex={onRow ? 0 : undefined}
                    onClick={onRow ? () => onRow(l) : undefined} onKeyDown={onRow ? (e) => e.key === 'Enter' && onRow(l) : undefined}
                    className={cx('rounded-2xl border border-l-4 border-hairline bg-surface p-3 shadow-tile', lk.edge, lk.row, onRow && 'cursor-pointer')}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="min-w-0 text-body font-semibold">{who ? who(l) : l.description}</span>
                      <span className="num shrink-0 text-callout font-bold">{money(l.amount)}</span>
                    </div>
                    {who && <div className="text-footnote text-muted">{l.description}</div>}
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted">
                      {showState && <LineState l={l} periodStart={periodStart} />}
                      {l.hours != null && <span className="num">{hours(l.hours)}{l.rate != null ? ` × ${money(l.rate)}` : ''}</span>}
                      {extra.map((c) => <span key={c.key}>{c.label} {c.render(l)}</span>)}
                      {action && <span className="ml-auto" onClick={(e) => e.stopPropagation()}>{action(l)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Tablet/desktop: one table, a header row per day */}
      <div className="ui-panel hidden overflow-x-auto rounded-tile border border-hairline bg-surface shadow-tile md:block">
        <table className="w-full text-subhead">
          <thead>
            <tr className="border-b border-line text-left text-caption font-semibold uppercase tracking-wide text-faint">
              {who && <th className="py-3 pl-4 pr-3 font-semibold">Officer</th>}
              <th className={cx('py-3 pr-3 font-semibold', !who && 'pl-4')}>Description</th>
              <th className="px-3 py-3 text-right font-semibold">Hours</th>
              <th className="px-3 py-3 text-right font-semibold">Rate</th>
              <th className="px-3 py-3 text-right font-semibold">Amount</th>
              {extra.map((c) => <th key={c.key} className="px-3 py-3 text-right font-semibold">{c.label}</th>)}
              {action && <th className="px-3 py-3"><span className="sr-only">Actions</span></th>}
            </tr>
          </thead>
          <tbody>
            {groups.map(([k, ls]) => (
              <Fragment key={k}>
                <tr className="border-b border-line bg-bg/70">
                  <td colSpan={cols} className="px-4 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-footnote font-semibold uppercase tracking-wide text-muted">{head(k)}</span>
                      <span className="num text-footnote text-muted">{dayTotal(ls)}</span>
                    </div>
                  </td>
                </tr>
                {ls.map((l) => {
                  const lk = LOOK[lineLook(l)];
                  return (
                    <tr key={l.id} onClick={onRow ? () => onRow(l) : undefined}
                      className={cx('border-b border-line last:border-0', lk.row, onRow && 'cursor-pointer hover:brightness-[0.98]')}>
                      {who && <td className={cx('border-l-4 py-2.5 pl-3 pr-3 font-semibold', lk.edge)}>{who(l)}</td>}
                      <td className={cx('max-w-[440px] py-2.5 pr-3', !who && cx('border-l-4 pl-3', lk.edge))}>
                        <div className="whitespace-normal">{l.description}</div>
                        {showState && <div className="mt-0.5"><LineState l={l} periodStart={periodStart} /></div>}
                      </td>
                      <td className="num px-3 py-2.5 text-right">{l.hours != null ? Number(l.hours).toFixed(2) : '–'}</td>
                      <td className="num px-3 py-2.5 text-right">{l.rate != null ? money(l.rate) : '–'}</td>
                      <td className="num px-3 py-2.5 text-right font-semibold">{money(l.amount)}</td>
                      {extra.map((c) => <td key={c.key} className="px-3 py-2.5 text-right">{c.render(l)}</td>)}
                      {action && <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>{action(l)}</td>}
                    </tr>
                  );
                })}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function LineState({ l, periodStart }) {
  const lk = LOOK[lineLook(l)];
  const Icon = lk.icon;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-caption">
      <Pill tone={lk.tone} className="!py-0 !text-caption2"><Icon size={14} />{lk.label}</Pill>
      {isLateLine(l, periodStart) && <Pill tone="blue" className="!py-0 !text-caption2"><History size={14} />Late · worked {dayLabel(iso(l.work_date))}</Pill>}
    </span>
  );
}

/** The split a draft is issued on: signed lines go, the rest wait for the next draft */
export function signedSplit(lines) {
  const ts = lines.filter((l) => l.timesheet_id);
  const signed = ts.filter((l) => l.ts_status === 'signed');
  return {
    signed: signed.length,
    awaiting: ts.length - signed.length,
    issuable: signed.length + lines.filter((l) => !l.timesheet_id).length,
    signedAmount: signed.reduce((a, l) => a + Number(l.amount || 0), 0) + lines.filter((l) => !l.timesheet_id).reduce((a, l) => a + Number(l.amount || 0), 0),
  };
}
