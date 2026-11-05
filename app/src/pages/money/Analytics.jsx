// Analytics: lateness and absence, incidents, satisfaction and customers, with the change against the period before
import { useState } from 'react';
import { CalendarClock, LineChart, MessageSquareHeart, ShieldAlert, Users } from 'lucide-react';
import { useAuth } from '../../auth.jsx';
import {
  Bento, Empty, ErrorBox, Input, Page, Section, Segmented, Select, SkeletonTiles, Stat, Tile, date, useApi,
} from '../../ui/index.jsx';
import { Columns, HBars, HourStrip, PRESETS_4W, presetRange, useBase } from './_parts.jsx';

/** True unless the office has switched the module off in Settings. */
export function useModuleOn(key) {
  const s = useApi('settings.get', {});
  return !!s.data && s.data.modules?.[key] !== false;
}

export default function Analytics() {
  return <AnalyticsView />;
}

const fig = (v, unit = '') => (v == null ? '–' : `${v}${unit}`);

// "↑ 12% vs 4 earlier" — `good` says which direction is good news, so the colour can follow
function change(sec, key, { unit = '' } = {}) {
  const c = sec.change?.[key];
  const p = sec.prev?.[key];
  if (p == null) return 'Nothing to compare with';
  if (c == null || c === 0) return `Same as before (${fig(p, unit)})`;
  return `${c > 0 ? '↑' : '↓'} ${Math.abs(c)}% vs ${fig(p, unit)}`;
}
const toneOf = (sec, key, good = 'down') => {
  const c = sec.change?.[key];
  if (!c) return undefined;
  return (c > 0) === (good === 'up') ? 'green' : 'red';
};

export function AnalyticsView({ venueId, fixedVenue }) {
  const { user } = useAuth();
  const base = useBase();
  const office = user.role !== 'venue';
  const [preset, setPreset] = useState('four');
  const [custom, setCustom] = useState(presetRange('four'));
  const [venue, setVenue] = useState(venueId || '');
  const [officer, setOfficer] = useState('');
  const range = preset === 'custom' ? custom : presetRange(preset);
  const ok = range.from && range.to && range.from <= range.to;
  const opts = useApi('analytics.options', {}, { skip: fixedVenue });
  const q = useApi('analytics.venue', { from: range.from, to: range.to, venue_id: (fixedVenue ? venueId : venue) || null, officer_id: officer || null }, { skip: !ok });
  const venues = opts.data?.venues || [];
  const officers = opts.data?.officers || [];

  const filters = (
    <div className="mb-5 flex flex-wrap items-end gap-3">
      <Segmented value={preset} onChange={(p) => { if (p === 'custom') setCustom(range); setPreset(p); }} options={PRESETS_4W} />
      {preset === 'custom' && (
        <div className="flex gap-2">
          <Input type="date" value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} aria-label="From" />
          <Input type="date" value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} aria-label="To" />
        </div>
      )}
      {!fixedVenue && venues.length > 1 && (
        <Select className="w-full sm:w-56" aria-label="Venue" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="All venues"
          options={venues.map((v) => ({ value: v.id, label: v.name }))} />
      )}
      {office && officers.length > 0 && (
        <Select className="w-full sm:w-56" aria-label="Officer" value={officer} onChange={(e) => setOfficer(e.target.value)} placeholder="All officers"
          options={officers.map((o) => ({ value: o.id, label: o.name }))} />
      )}
    </div>
  );

  const body = !ok ? <Empty icon={LineChart} title="Choose a date range" body="The start date must be on or before the end date." />
    : q.error && !q.data ? <ErrorBox error={q.error} retry={q.reload} />
    : !q.data ? <SkeletonTiles n={8} />
    : <Sections d={q.data} base={base} office={office} venueFilter={(fixedVenue ? venueId : venue) || ''} />;

  if (fixedVenue) return <>{filters}{body}</>;
  return (
    <Page title="Analytics" wide
      subtitle={ok ? `${date(range.from)} – ${date(range.to)}${q.data ? ` · compared with ${date(q.data.prev_range.from)} – ${date(q.data.prev_range.to)}` : ''}` : 'Choose a date range'}>
      {filters}
      {body}
    </Page>
  );
}

function Sections({ d, base, office, venueFilter }) {
  const { attendance: a, incidents: i, satisfaction: s, customers: c } = d;
  const many = !venueFilter;
  const fb = (tone) => `${base}/feedback?status=${tone === 'complaint' ? 'open' : ''}${tone ? `&tone=${tone}` : ''}${venueFilter ? `&venue=${venueFilter}` : ''}`;
  return (
    <div className="space-y-2">
      <Section title="Lateness and absence">
        <Bento>
          <Tile icon={CalendarClock} title="On time"><Stat value={fig(a.on_time_pct, '%')} label={`${a.shifts} shift${a.shifts === 1 ? '' : 's'} worked`} hint={change(a, 'on_time_pct', { unit: '%' })} tone={toneOf(a, 'on_time_pct', 'up')} /></Tile>
          <Tile title="Late"><Stat value={a.late} label={a.avg_late ? `${a.avg_late} min late on average` : 'Late arrivals'} hint={change(a, 'late')} tone={toneOf(a, 'late')} /></Tile>
          <Tile title="Absent"><Stat value={a.no_show + a.cant_make_it} label={`${a.no_show} no-show · ${a.cant_make_it} couldn't make it`} hint={change(a, 'no_show')} tone={toneOf(a, 'no_show')} /></Tile>
          <Tile title="Cover and early leavers"><Stat value={a.cover} label={`Cover needed · ${a.left_early} left early`} hint={a.excused ? `${a.excused} excused` : change(a, 'cover')} /></Tile>
        </Bento>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {office && <Tile title="By officer"><HBars items={a.by_officer} empty="No lateness or absence in this period" /></Tile>}
          {many && a.by_venue.length > 1 && <Tile title="By venue"><HBars items={a.by_venue} /></Tile>}
          <Tile title="By weekday"><Columns items={a.by_weekday} /></Tile>
        </div>
      </Section>

      <Section title="Incidents">
        <Bento>
          <Tile icon={ShieldAlert} title="Incidents" to={`${base}/incidents`}><Stat value={i.total} label="Reported" hint={change(i, 'total')} tone={toneOf(i, 'total')} /></Tile>
          <Tile title="High or critical"><Stat value={i.high} label="Serious incidents" hint={change(i, 'high')} tone={toneOf(i, 'high')} /></Tile>
          <Tile title="Per 1,000 customers"><Stat value={fig(i.per_1000)} label="On nights with a count" hint={i.per_1000 == null ? 'Needs customer numbers' : change(i, 'per_1000')} tone={toneOf(i, 'per_1000')} /></Tile>
          <Tile title="Bans"><Stat value={i.bans} label="Customers banned" hint={change(i, 'bans')} /></Tile>
        </Bento>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <Tile title="By type"><HBars items={i.by_type} /></Tile>
          <Tile title="By severity"><HBars items={i.by_severity.filter((x) => x.value)} /></Tile>
          <Tile title="By hour" className="lg:col-span-2"><HourStrip data={i.by_hour} /></Tile>
          {i.by_month.length > 1 && <Tile title="By month"><Columns items={i.by_month} /></Tile>}
          {many && i.by_venue.length > 1 && <Tile title="By venue"><HBars items={i.by_venue} /></Tile>}
        </div>
      </Section>

      <Section title="Satisfaction">
        <Bento>
          <Tile icon={MessageSquareHeart} title="Average rating"><Stat value={s.avg == null ? '–' : `${s.avg}★`} label={`${s.ratings} rating${s.ratings === 1 ? '' : 's'}`} hint={change(s, 'avg')} tone={toneOf(s, 'avg', 'up')} /></Tile>
          <Tile title="Praise" to={fb('praise')}><Stat value={s.praise} label="Compliments" hint={change(s, 'praise')} tone={toneOf(s, 'praise', 'up')} /></Tile>
          <Tile title="Suggestions" to={fb('suggestion')}><Stat value={s.suggestion} label="Ideas from the venue" hint={change(s, 'suggestion')} /></Tile>
          <Tile title="Complaints" to={fb('complaint')}><Stat value={s.complaint} label={`${s.open_complaints} still open`} hint={change(s, 'complaint')} tone={s.open_complaints ? 'red' : toneOf(s, 'complaint')} /></Tile>
        </Bento>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          {s.by_month.length > 0 && <Tile title="Average rating by month"><Columns items={s.by_month} format={(v) => `${v}★`} /></Tile>}
          <Tile title={office ? 'Highest rated officers' : 'Highest rated staff'}><HBars items={s.top} format={(v) => `${v}★`} empty="No ratings in this period" /></Tile>
          {office && s.bottom.length > 0 && <Tile title="Lowest rated officers"><HBars items={s.bottom} format={(v) => `${v}★`} tone="soft" /></Tile>}
        </div>
      </Section>

      <Section title="Customers and staffing">
        <Bento>
          <Tile icon={Users} title="Customers"><Stat value={c.total.toLocaleString('en-GB')} label={`${c.nights} night${c.nights === 1 ? '' : 's'} counted`} hint={change(c, 'total')} /></Tile>
          <Tile title="Per night"><Stat value={fig(c.avg_per_night)} label="Average customers" hint={change(c, 'avg_per_night')} /></Tile>
          <Tile title="Per officer"><Stat value={fig(c.per_officer)} label="Customers per officer on duty" hint={change(c, 'per_officer')} /></Tile>
          <Tile title="Shifts filled" to={office ? `${base}/rota` : undefined}><Stat value={fig(c.fill_pct, '%')} label={`${c.filled} of ${c.needed} places · ${c.hours} h`} hint={change(c, 'fill_pct', { unit: '%' })} tone={toneOf(c, 'fill_pct', 'up')} /></Tile>
        </Bento>
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <Tile title="Customers per night" className="lg:col-span-2"><Columns items={c.by_night} empty="No customer numbers yet. The lead officer adds them on the shift." /></Tile>
          {c.nights > 0 && <Tile title="Average by weekday"><Columns items={c.by_weekday} /></Tile>}
          {c.nights > 0 && <Tile title="Busiest nights"><HBars items={c.busiest} /></Tile>}
        </div>
      </Section>
    </div>
  );
}
