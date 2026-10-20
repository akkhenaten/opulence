import { useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Clock, PoundSterling, ShieldAlert, TrendingUp } from 'lucide-react';
import {
  Bento, Empty, ErrorBox, Input, List, Page, Pill, Row, Section, Segmented, Spinner, Stat, Table, Tile, date, dateShort, daysUntil, hours, money, money0, titleCase, useApi,
} from '../../ui/index.jsx';
import { Columns, HBars, HourStrip, PRESETS, num, pct, presetRange } from './_parts.jsx';

const SEV = ['critical', 'high', 'medium', 'low'];

export default function Reports() {
  const [preset, setPreset] = useState('this');
  const [custom, setCustom] = useState(presetRange('this'));
  const range = preset === 'custom' ? custom : presetRange(preset);
  const ok = range.from && range.to && range.from <= range.to;
  const body = { from: range.from, to: range.to };

  const margin = useApi('reports.margin', body, { skip: !ok });
  const hrs = useApi('reports.hours', body, { skip: !ok });
  const inc = useApi('reports.incidents', body, { skip: !ok });
  const overdue = useApi('reports.overdue');

  return (
    <Page title="Reports" subtitle={ok ? `${date(range.from)} – ${date(range.to)}` : 'Choose a date range'} wide>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <Segmented value={preset} onChange={(p) => { if (p === 'custom') setCustom(range); setPreset(p); }} options={PRESETS} />
        {preset === 'custom' && (
          <div className="flex gap-2">
            <Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="From" />
            <Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="To" />
          </div>
        )}
      </div>

      <MoneySection q={margin} overdue={overdue} hrs={hrs} />
      <HoursSection q={hrs} />
      <IncidentsSection q={inc} />
      <OverdueSection q={overdue} />
    </Page>
  );
}

const Wait = ({ q, children }) => {
  if (q.loading && !q.data) return <Spinner className="py-10" />;
  if (q.error && !q.data) return <ErrorBox error={q.error} retry={q.reload} />;
  return q.data ? children(q.data) : null;
};

function MoneySection({ q, overdue, hrs }) {
  const rows = q.data || [];
  const t = rows.reduce((a, r) => ({ revenue: a.revenue + num(r.revenue), cost: a.cost + num(r.pay_cost), margin: a.margin + num(r.margin), hours: a.hours + num(r.hours) }), { revenue: 0, cost: 0, margin: 0, hours: 0 });
  const worked = (hrs.data || []).reduce((a, r) => a + num(r.hours), 0);
  const od = (overdue.data || []).reduce((a, r) => a + num(r.gross), 0);
  return (
    <>
      <Bento>
        <Tile title="Revenue" icon={PoundSterling} tone="blue"><Stat value={money0(t.revenue)} label="Invoiced, net of VAT" hint={`${hours(t.hours)} billed`} /></Tile>
        <Tile title="Margin" icon={TrendingUp}><Stat value={money0(t.margin)} label={`${pct(t.margin, t.revenue)} of revenue`} hint={`Pay cost ${money0(t.cost)}`} tone={t.margin < 0 ? 'red' : 'green'} /></Tile>
        <Tile title="Hours worked" icon={Clock}><Stat value={hours(Math.round(worked * 100) / 100)} label="All timesheets" hint="Signed or not" /></Tile>
        <Tile title="Overdue" icon={AlertTriangle} to="/company/invoices?status=overdue"><Stat value={money0(od)} label={`${(overdue.data || []).length} invoices`} tone={od ? 'red' : undefined} hint="Today, any period" /></Tile>
      </Bento>

      <Section title="Margin by venue">
        <Wait q={q}>
          {(data) => (!data.length ? <Empty icon={BarChart3} title="No invoiced hours in this period" body="Margin is based on invoice lines. Generate invoices to see it here." /> : (
            <div className="grid gap-4 lg:grid-cols-[2fr_3fr]">
              <Tile title="Revenue">
                <HBars items={data.map((r) => ({ key: r.id, label: r.venue_name, value: r.revenue, display: money0(r.revenue), sub: pct(r.margin, r.revenue) }))} />
              </Tile>
              <Table rows={data} columns={[
                { key: 'venue_name', label: 'Venue', render: (r) => <span className="font-semibold">{r.venue_name}</span> },
                { key: 'hours', label: 'Hours', align: 'right', render: (r) => num(r.hours).toLocaleString('en-GB', { maximumFractionDigits: 1 }) },
                { key: 'revenue', label: 'Revenue', align: 'right', render: (r) => money(r.revenue) },
                { key: 'pay_cost', label: 'Pay cost', align: 'right', render: (r) => <span className="text-muted">{money(r.pay_cost)}</span> },
                { key: 'margin', label: 'Margin', align: 'right', render: (r) => <span className={num(r.margin) < 0 ? 'font-semibold text-red' : 'font-semibold'}>{money(r.margin)}</span> },
                { key: 'pct', label: '%', align: 'right', render: (r) => <MarginPill m={r.margin} r={r.revenue} /> },
              ]} />
            </div>
          ))}
        </Wait>
      </Section>
    </>
  );
}

function MarginPill({ m, r }) {
  const p = num(r) ? (num(m) / num(r)) * 100 : 0;
  return <Pill tone={p < 0 ? 'red' : p < 15 ? 'amber' : 'green'}>{pct(m, r)}</Pill>;
}

function HoursSection({ q }) {
  const { weeks, venues } = useMemo(() => {
    const w = new Map(); const v = new Map();
    for (const r of q.data || []) {
      w.set(r.week, (w.get(r.week) || 0) + num(r.hours));
      v.set(r.venue_name, (v.get(r.venue_name) || 0) + num(r.hours));
    }
    return {
      weeks: [...w.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([k, n]) => ({ key: k, label: dateShort(k), value: Math.round(n * 10) / 10 })),
      venues: [...v.entries()].sort((a, b) => b[1] - a[1]).map(([k, n]) => ({ label: k, value: Math.round(n * 10) / 10 })),
    };
  }, [q.data]);
  const fmt = (n) => num(n).toLocaleString('en-GB', { maximumFractionDigits: 0 });
  return (
    <Section title="Hours worked">
      <Wait q={q}>
        {() => (!weeks.length ? <Empty icon={Clock} title="No hours in this period" /> : (
          <div className="grid gap-4 lg:grid-cols-2">
            <Tile title="By week (week starting)"><Columns items={weeks} format={fmt} /></Tile>
            <Tile title="By venue"><HBars items={venues} format={(n) => `${fmt(n)}h`} /></Tile>
          </div>
        ))}
      </Wait>
    </Section>
  );
}

function IncidentsSection({ q }) {
  return (
    <Section title="Incidents">
      <Wait q={q}>
        {(d) => {
          const total = d.byType.reduce((a, r) => a + num(r.n), 0);
          if (!total) return <Empty icon={ShieldAlert} title="No incidents in this period" />;
          const sev = Object.fromEntries(d.bySeverity.map((r) => [r.severity, num(r.n)]));
          return (
            <div className="grid gap-4 lg:grid-cols-3">
              <Tile title="Total" icon={ShieldAlert}>
                <Stat value={total} label={total === 1 ? 'Incident reported' : 'Incidents reported'} />
                <div className="mt-4 grid grid-cols-2 gap-2">
                  {SEV.map((s) => (
                    <div key={s} className="flex items-center justify-between rounded-xl bg-bg px-3 py-2">
                      <Pill status={s} />
                      <span className="num text-callout font-bold">{sev[s] || 0}</span>
                    </div>
                  ))}
                </div>
              </Tile>
              <Tile title="By type"><HBars items={d.byType.map((r) => ({ label: titleCase(r.type), value: r.n }))} /></Tile>
              <Tile title="By venue"><HBars items={d.byVenue.map((r) => ({ label: r.venue_name, value: r.n }))} /></Tile>
              <Tile title="By week (week starting)" className="lg:col-span-1"><Columns items={d.byWeek.map((r) => ({ key: r.week, label: dateShort(r.week), value: r.n }))} height={110} /></Tile>
              <Tile title="Time of day" className="lg:col-span-2"><HourStrip data={d.byHour} /></Tile>
            </div>
          );
        }}
      </Wait>
    </Section>
  );
}

function OverdueSection({ q }) {
  return (
    <Section title="Overdue invoices">
      <Wait q={q}>
        {(rows) => (!rows.length ? <Empty icon={PoundSterling} title="Nothing overdue" body="All issued invoices are within their payment terms." /> : (
          <List>
            {rows.map((i) => {
              const d = -daysUntil(i.due_date);
              return (
                <Row key={i.id} to={`/company/invoices/${i.id}`} title={`${i.number} · ${i.venue_name}`}
                  subtitle={`Due ${date(i.due_date)} · ${d} day${d === 1 ? '' : 's'} overdue`}
                  right={<span className="num font-bold text-red">{money(i.gross)}</span>} />
              );
            })}
          </List>
        ))}
      </Wait>
    </Section>
  );
}

