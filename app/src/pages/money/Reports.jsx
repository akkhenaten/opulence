import { useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, Building2, Clock, Fingerprint, PoundSterling, ShieldAlert, TrendingUp, Users } from 'lucide-react';
import {
  Bento, Empty, ErrorBox, List, Page, Pill, Row, Section, Segmented, Spinner, Stat, Table, Tile, date, dateShort, daysUntil, hours, money, money0, titleCase, useApi,
} from '../../ui/index.jsx';
import { Columns, HBars, HourStrip, PRESETS, num, pct } from './_parts.jsx';
import { Part, RangeBar, useRangeUrl } from './Analytics.jsx';

const SEV = ['critical', 'high', 'medium', 'low'];
const JUMPS = [
  { id: 'r-money', label: 'Money', icon: PoundSterling }, { id: 'r-hours', label: 'Hours worked', icon: Clock }, { id: 'r-incidents', label: 'Incidents', icon: ShieldAlert },
  { id: 'r-proof', label: 'Clock-in proof', icon: Fingerprint }, { id: 'r-overdue', label: 'Overdue invoices', icon: AlertTriangle },
];

export default function Reports() {
  const r = useRangeUrl(PRESETS, 'this');
  const { range } = r;
  const ok = range.from && range.to && range.from <= range.to;
  const body = { from: range.from, to: range.to };

  const margin = useApi('reports.margin', body, { skip: !ok });
  const hrs = useApi('reports.hours', body, { skip: !ok });
  const inc = useApi('reports.incidents', body, { skip: !ok });
  const overdue = useApi('reports.overdue');
  const proof = useApi('clock.proofReport', body, { skip: !ok });

  return (
    <Page title="Reports" subtitle={ok ? `${date(range.from)} – ${date(range.to)}` : 'Choose a date range'} wide>
      <RangeBar r={r} presets={PRESETS} jumps={JUMPS} />
      <div id="r-money" className="pt-2"><MoneySection q={margin} overdue={overdue} hrs={hrs} /></div>
      <HoursSection q={hrs} />
      <IncidentsSection q={inc} />
      <ProofSection q={proof} />
      <OverdueSection q={overdue} />
    </Page>
  );
}

// How officers proved they were on site when clocking in
function ProofSection({ q }) {
  const [by, setBy] = useState('officers');
  const share = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '–');
  return (
    <Part id="r-proof" title="Clock-in proof" icon={Fingerprint} action={<Segmented value={by} onChange={setBy} iconOnly="phone" options={[{ value: 'officers', label: 'Officers', icon: Users }, { value: 'venues', label: 'Venues', icon: Building2 }]} />}>
      <Wait q={q}>
        {(d) => {
          const rows = d[by];
          if (!rows.length) return <Empty icon={Fingerprint} title="No clock-ins in this period" />;
          return (
            <Table rows={rows} columns={[
              { key: 'name', mobile: 'title', label: by === 'officers' ? 'Officer' : 'Venue', render: (r) => <span className="font-semibold">{r.name}</span> },
              { key: 'punches', mobile: 'sub', mobileLabel: true, label: 'Clock-ins', align: 'right' },
              { key: 'phone_ok', mobile: 'sub', mobileLabel: true, label: 'Phone ok', align: 'right', render: (r) => <span className={r.phone_failed ? 'font-semibold text-amber' : ''}>{share(r.phone_ok, r.punches)}</span> },
              { key: 'location_ok', mobile: 'sub', mobileLabel: true, label: 'Location', align: 'right', render: (r) => share(r.location_ok, r.punches) },
              { key: 'qr', mobile: false, label: 'QR / NFC', align: 'right', render: (r) => <span className="num">{r.qr} / {r.nfc}</span> },
              { key: 'selfies', mobile: false, label: 'Selfies', align: 'right' },
              { key: 'exceptions', mobile: 'value', label: 'Exceptions', align: 'right', render: (r) => (r.exceptions ? <Pill tone="amber">{r.exceptions} · {share(r.exceptions, r.punches)}</Pill> : '0') },
              { key: 'face_flags', mobile: 'value', label: 'Face flags', align: 'right', render: (r) => (r.face_flags ? <Pill tone="red">{r.face_flags}</Pill> : '0') },
            ]} />
          );
        }}
      </Wait>
      <p className="mt-2 px-1 text-caption text-muted">Clock-ins before phone checks started count as "phone not checked". A high exception rate at one venue usually means a missing poster, a weak signal or a tag that needs replacing.</p>
    </Part>
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

      <Section title="Margin by venue" icon={BarChart3}>
        <Wait q={q}>
          {(data) => (!data.length ? <Empty icon={BarChart3} title="No invoiced hours in this period" body="Margin is based on invoice lines. Generate invoices to see it here." /> : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_3fr]">
              <Tile title="Revenue">
                <HBars items={data.map((r) => ({ key: r.id, label: r.venue_name, value: r.revenue, display: money0(r.revenue), sub: pct(r.margin, r.revenue) }))} />
              </Tile>
              <Table rows={data} columns={[
                { key: 'venue_name', mobile: 'title', label: 'Venue', render: (r) => <span className="font-semibold">{r.venue_name}</span> },
                { key: 'hours', mobile: 'sub', mobileLabel: true, label: 'Hours', align: 'right', render: (r) => num(r.hours).toLocaleString('en-GB', { maximumFractionDigits: 1 }) },
                { key: 'revenue', mobile: 'sub', mobileLabel: true, label: 'Revenue', align: 'right', render: (r) => money(r.revenue) },
                { key: 'pay_cost', mobile: false, label: 'Pay cost', align: 'right', render: (r) => <span className="text-muted">{money(r.pay_cost)}</span> },
                { key: 'margin', mobile: 'value', label: 'Margin', align: 'right', render: (r) => <span className={num(r.margin) < 0 ? 'font-semibold text-red' : 'font-semibold'}>{money(r.margin)}</span> },
                { key: 'pct', mobile: 'value', label: '%', align: 'right', render: (r) => <MarginPill m={r.margin} r={r.revenue} /> },
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
    <Part id="r-hours" title="Hours worked" icon={Clock}>
      <Wait q={q}>
        {() => (!weeks.length ? <Empty icon={Clock} title="No hours in this period" /> : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Tile title="By week (week starting)"><Columns items={weeks} format={fmt} /></Tile>
            <Tile title="By venue"><HBars items={venues} format={(n) => `${fmt(n)}h`} /></Tile>
          </div>
        ))}
      </Wait>
    </Part>
  );
}

function IncidentsSection({ q }) {
  return (
    <Part id="r-incidents" title="Incidents" icon={ShieldAlert}>
      <Wait q={q}>
        {(d) => {
          const total = d.byType.reduce((a, r) => a + num(r.n), 0);
          if (!total) return <Empty icon={ShieldAlert} title="No incidents in this period" />;
          const sev = Object.fromEntries(d.bySeverity.map((r) => [r.severity, num(r.n)]));
          return (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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
    </Part>
  );
}

function OverdueSection({ q }) {
  return (
    <Part id="r-overdue" title="Overdue invoices" icon={AlertTriangle}>
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
    </Part>
  );
}

