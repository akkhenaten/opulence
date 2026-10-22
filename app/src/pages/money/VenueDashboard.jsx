import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2, CalendarDays, ClipboardCheck, MapPin, Megaphone, Plus, Radio, ReceiptText, ShieldAlert, Star } from 'lucide-react';
import { useAuth } from '../../auth.jsx';
import { FeedbackTile, RateStaffSheet } from '../venue/_feedback.jsx';
import {
  Bento, Button, Dot, List, Load, Page, Pill, Row, Section, Stat, Tile, cx, dayLabel, money, range, relative, titleCase, useApi,
} from '../../ui/index.jsx';
import { InstallCard } from '../../ui/pwa.jsx';

const STATE_LABEL = { late: 'Late', no_show: 'No show', left_early: 'Left early' };

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: 'numeric', hour12: false }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export default function VenueDashboard() {
  const { user } = useAuth();
  const q = useApi('dashboard.get', {}, { poll: 30000 });
  return (
    <Load q={q}>
      {(d) => <Body d={d} name={user?.name?.split(' ')[0]} />}
    </Load>
  );
}

function Body({ d, name }) {
  const multi = d.venues.length > 1;
  const live = d.live;
  const toSign = d.counts?.toSign || 0;
  const pendingCover = d.cover.filter((c) => c.status === 'pending').length;
  const [rate, setRate] = useState(false);

  if (!d.venues.length) {
    return (
      <Page title={`${greeting()}${name ? `, ${name}` : ''}`}>
        <Tile><p className="text-body text-muted">Your account is not linked to a venue yet. Ask your security provider to give you access.</p></Tile>
      </Page>
    );
  }

  return (
    <Page title={`${greeting()}${name ? `, ${name}` : ''}`} subtitle={multi ? `${d.venues.length} venues` : d.venues[0].name}
      actions={<><Button variant="secondary" icon={Star} onClick={() => setRate(true)}>Rate staff</Button><Button icon={Plus} to="/venue/cover">Request cover</Button></>}>
      <InstallCard className="mb-4" />
      <RateStaffSheet open={rate} onClose={() => setRate(false)} />
      <Bento>
        <Tile tone="blue" to="/venue/live" title="On site now" icon={Radio} className="col-span-2 lg:row-span-2">
          <div className="flex items-end gap-3">
            <div className="display num text-[64px] font-bold leading-none">{live.on_site}</div>
            <div className="mb-2 flex items-center gap-2 text-subhead font-semibold opacity-90"><Dot tone="green" live />{live.on_site === 1 ? 'officer on duty' : 'officers on duty'}</div>
          </div>
          <div className="mt-5 grid grid-cols-3 gap-2">
            <LiveChip n={live.upcoming} label="Due in" />
            <LiveChip n={live.late} label="Late" warn={live.late > 0} />
            <LiveChip n={live.no_show} label="No show" warn={live.no_show > 0} />
          </div>
          {live.alerts?.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {live.alerts.slice(0, 4).map((a) => (
                <div key={a.assignment_id} className="flex items-center justify-between gap-2 rounded-xl bg-white/10 px-3 py-2 text-footnote">
                  <span className="min-w-0 truncate font-semibold">{a.officer_name}{multi && <span className="font-normal opacity-75"> · {a.venue_name}</span>}</span>
                  <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-caption2 font-bold text-red">{STATE_LABEL[a.state] || (a.has_exception ? 'Check' : titleCase(a.state))}</span>
                </div>
              ))}
            </div>
          )}
        </Tile>

        <Tile title="Timesheets" icon={ClipboardCheck} to="/venue/timesheets">
          <Stat value={toSign} label={toSign === 1 ? 'Timesheet to sign' : 'Timesheets to sign'} tone={toSign ? 'blue' : undefined} hint={toSign ? 'Please check and sign' : 'All signed'} />
        </Tile>
        <Tile title="Invoices" icon={ReceiptText} to="/venue/invoices">
          <Stat value={money(d.invoices.outstanding)} label="Outstanding" hint={`${d.invoices.count} invoice${d.invoices.count === 1 ? '' : 's'}`} />
        </Tile>
        <Tile title="Cover" icon={Megaphone} to="/venue/cover">
          <Stat value={pendingCover} label="Requests awaiting reply" hint={`${d.cover.length} upcoming`} />
        </Tile>
        <Tile title="Incidents" icon={ShieldAlert} to="/venue/incidents">
          <Stat value={d.incidents.filter((i) => i.status !== 'closed').length} label="Open in recent reports" hint={`${d.incidents.length} recent`} />
        </Tile>
      </Bento>
      <FeedbackTile multi={multi} className="mt-4" />

      <div className="grid grid-cols-1 gap-x-4 lg:grid-cols-2">
        <Section title="Next 48 hours">
          {!d.shifts.length ? <Quiet icon={CalendarDays} text="No shifts booked in the next 48 hours." /> : (
            <List>
              {d.shifts.map((s) => {
                const short = s.filled < s.headcount;
                return (
                  <div key={s.id} className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-body font-semibold">{dayLabel(s.starts_at)} · <span className="num">{range(s.starts_at, s.ends_at)}</span></div>
                        <div className="truncate text-footnote text-muted">{s.role_name}{multi ? ` · ${s.venue_name}` : ''}</div>
                      </div>
                      <Pill tone={short ? 'amber' : 'green'}><span className="num">{s.filled}/{s.headcount}</span> {short ? 'filling' : 'booked'}</Pill>
                    </div>
                    {s.team?.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {s.team.map((n, i) => <span key={i} className="rounded-full bg-bg px-2.5 py-0.5 text-caption font-semibold">{n}</span>)}
                      </div>
                    )}
                  </div>
                );
              })}
            </List>
          )}
        </Section>

        <Section title="Cover requests" action={<Link to="/venue/cover" className="-my-2.5 inline-block py-2.5 text-subhead font-semibold text-blue">Request cover</Link>}>
          {!d.cover.length ? <Quiet icon={Megaphone} text="No upcoming cover requests." action={<Button size="sm" variant="soft" icon={Plus} to="/venue/cover">Request cover</Button>} /> : (
            <List>
              {d.cover.map((c) => (
                <Row key={c.id} to="/venue/cover" title={`${c.headcount} × ${c.role_name}`}
                  subtitle={`${dayLabel(c.starts_at)} · ${range(c.starts_at, c.ends_at)}${multi ? ` · ${c.venue_name}` : ''}`}
                  right={<Pill status={c.status} />} />
              ))}
            </List>
          )}
        </Section>

        <Section title="Recent incidents" action={<Link to="/venue/incidents" className="-my-2.5 inline-block py-2.5 text-subhead font-semibold text-blue">See all</Link>}>
          {!d.incidents.length ? <Quiet icon={ShieldAlert} text="No incidents reported." /> : (
            <List>
              {d.incidents.map((i) => (
                <Row key={i.id} to={`/venue/incidents/${i.id}`}
                  left={<div className={cx('grid h-9 w-9 place-items-center rounded-xl', ['high', 'critical'].includes(i.severity) ? 'bg-red-soft text-red' : 'bg-blue-soft text-blue')}><ShieldAlert size={18} /></div>}
                  title={`${titleCase(i.type)}`} subtitle={`${i.ref} · ${relative(i.occurred_at)}${multi ? ` · ${i.venue_name}` : ''}`}
                  right={<Pill status={i.severity} />} />
              ))}
            </List>
          )}
        </Section>

        <Section title={multi ? 'Your venues' : 'Your venue'}>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            {d.venues.map((v) => (
              <Tile key={v.id}>
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-soft text-blue"><Building2 size={20} /></div>
                  <div className="min-w-0">
                    <div className="truncate text-callout font-bold">{v.name}</div>
                    <div className="mt-0.5 flex items-start gap-1 text-footnote text-muted"><MapPin size={14} className="mt-0.5 shrink-0" /><span className="min-w-0">{[v.address, v.postcode].filter(Boolean).join(', ') || 'No address'}</span></div>
                  </div>
                </div>
              </Tile>
            ))}
          </div>
        </Section>
      </div>
    </Page>
  );
}

const LiveChip = ({ n, label, warn }) => (
  <div className={cx('rounded-2xl px-3 py-2.5', warn ? 'bg-white text-red' : 'bg-white/15')}>
    <div className="num text-title2 font-bold leading-none">{n}</div>
    <div className="mt-1 text-caption font-semibold opacity-80">{label}</div>
  </div>
);

const Quiet = ({ icon: Icon, text, action }) => (
  <div className="flex items-center gap-3 rounded-tile border border-dashed border-line bg-surface/60 px-4 py-5">
    <Icon size={18} className="shrink-0 text-faint" />
    <span className="flex-1 text-subhead text-muted">{text}</span>
    {action}
  </div>
);
