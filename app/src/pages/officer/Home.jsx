import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle, CalendarDays, Clock3, Coffee, FileText, Hourglass, LogIn, LogOut, MapPin, Megaphone, PencilLine, ShieldAlert, ShieldCheck,
} from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Bento, Button, cx, date, dateShort, dayLabel, daysUntil, Load, money, Page, range, Stat, Tile, useAction, useApi,
} from '../../ui/index.jsx';
import { ASSIGN_LABEL, assignTone, expiryText, greeting, NotLinked, ShiftCard, until } from './_parts.jsx';

export default function Home() {
  const { user } = useAuth();
  const dash = useApi('dashboard.get', {}, { poll: 60000 });
  const clock = useApi('clock.status', {}, { poll: 60000, skip: !user.officer_id });
  const first = (user.name || '').split(' ')[0];

  return (
    <Page title={`${greeting()}${first ? `, ${first}` : ''}`} subtitle={dayLabel(new Date())}>
      <Load q={dash}>
        {(d) => (d.linked === false ? <NotLinked /> : <Body d={d} clock={clock} reload={() => { dash.reload(); clock.reload(); }} />)}
      </Load>
    </Page>
  );
}

function Body({ d, clock, reload }) {
  const nav = useNavigate();
  const [run, busy] = useAction();
  const cur = clock.data?.current;
  const next = d.next || [];
  const hero = cur || next[0];
  const later = next.filter((s) => s.assignment_id !== hero?.assignment_id);
  const docs = d.expiringDocs || [];
  const siaDays = daysUntil(d.officer?.sia_expiry);

  const accept = (a) => run(() => api('shifts.respond', { assignment_id: a.assignment_id, accept: true }), 'Shift confirmed').then(reload).catch(() => {});

  return (
    <div className="space-y-3">
      {d.issues?.length > 0 && (
        <Tile className="border-red/20 !bg-red-soft">
          <div className="flex gap-3 text-red">
            <ShieldAlert size={24} className="mt-0.5 shrink-0" />
            <div>
              <div className="text-[17px] font-bold">You can't work shifts right now</div>
              <ul className="mt-1 space-y-0.5 text-[14px] font-medium">{d.issues.map((i) => <li key={i}>{i}</li>)}</ul>
              <p className="mt-2 text-[13px] text-red/80">Upload the missing documents or contact the office.</p>
              <Button size="sm" variant="secondary" className="mt-3" to="/officer/documents">My documents</Button>
            </div>
          </div>
        </Tile>
      )}
      {!d.issues?.length && siaDays != null && siaDays <= 60 && (
        <Tile className="border-amber/20 !bg-amber-soft" to="/officer/documents">
          <div className="flex items-center gap-3 text-amber">
            <AlertTriangle size={22} className="shrink-0" />
            <div><div className="font-bold">SIA licence: {expiryText(siaDays).toLowerCase()}</div><div className="text-[13px]">Renew it and upload the new licence.</div></div>
          </div>
        </Tile>
      )}

      <Hero s={hero} isCurrent={!!cur && cur.assignment_id === hero?.assignment_id} state={cur?.state} onAccept={accept} busy={busy} />

      <Bento className="!grid-cols-2">
        <Tile title="Hours" icon={Hourglass} to="/officer/shifts">
          <Stat value={Number(d.hoursWeek || 0).toLocaleString('en-GB', { maximumFractionDigits: 1 })} label="Last 7 days" />
        </Tile>
        <Tile title="Open shifts" icon={Megaphone} to="/officer/shifts?tab=open" tone={d.openCount ? 'soft' : undefined}>
          <Stat value={d.openCount || 0} label={d.openCount === 1 ? 'Shift to pick up' : 'Shifts to pick up'} tone={d.openCount ? 'blue' : undefined} />
        </Tile>
        <Tile title="Last pay" icon={FileText} to={d.lastStatement ? `/officer/pay/${d.lastStatement.id}` : '/officer/pay'} className="col-span-2 sm:col-span-1">
          {d.lastStatement ? (
            <Stat value={money(d.lastStatement.total)} label={`${dateShort(d.lastStatement.period_start)} – ${dateShort(d.lastStatement.period_end)}`}
              hint={d.lastStatement.status === 'paid' ? 'Paid' : 'Issued, awaiting payment'} />
          ) : <div className="text-[15px] text-muted">No statements yet</div>}
        </Tile>
        {d.incidentsToFix > 0 ? (
          <Tile title="Incident reports" icon={PencilLine} to="/officer/incidents" className="col-span-2 border-amber/20 !bg-amber-soft sm:col-span-1">
            <Stat value={d.incidentsToFix} label="Need more detail" tone="amber" hint="Your manager asked for changes" />
          </Tile>
        ) : (
          <Tile title="Documents" icon={ShieldCheck} to="/officer/documents" className="col-span-2 sm:col-span-1">
            {docs.length ? <Stat value={docs.length} label="Expiring soon" tone="amber" /> : <div className="text-[15px] text-muted">All in date</div>}
          </Tile>
        )}
      </Bento>

      {docs.length > 0 && (
        <Tile title="Documents expiring" icon={ShieldCheck} to="/officer/documents"><DocList docs={docs} /></Tile>
      )}

      <Button size="lg" variant="secondary" icon={ShieldAlert} className="w-full" onClick={() => nav('/officer/incidents/new')}>Report incident</Button>

      {later.length > 0 && (
        <div className="pt-3">
          <div className="mb-2 flex items-center justify-between px-1">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted">Coming up</h2>
            <Button size="sm" variant="ghost" to="/officer/shifts">All shifts</Button>
          </div>
          <div className="space-y-2.5">
            {later.map((s) => <ShiftCard key={s.assignment_id} s={s} to="/officer/shifts" status={ASSIGN_LABEL[s.assignment_status]} statusTone={assignTone[s.assignment_status]} />)}
          </div>
        </div>
      )}
    </div>
  );
}

function DocList({ docs }) {
  return (
    <div className="divide-y divide-line">
      {docs.slice(0, 4).map((x, i) => {
        const n = daysUntil(x.expiry);
        return (
          <div key={i} className="flex items-center justify-between gap-3 py-2 text-[14px]">
            <span className="truncate font-semibold">{x.title}</span>
            <span className={cx('shrink-0 font-semibold', n < 0 ? 'text-red' : 'text-amber')}>{n < 0 ? 'Expired' : date(x.expiry)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Hero({ s, isCurrent, state, onAccept, busy }) {
  if (!s) {
    return (
      <Tile tone="ink" className="!p-6">
        <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide opacity-70"><CalendarDays size={15} />Next shift</div>
        <div className="display mt-3 text-[24px] font-bold">Nothing booked</div>
        <p className="mt-1 text-[14px] opacity-70">Pick up an open shift or check back later.</p>
        <Button size="lg" className="mt-5 w-full" to="/officer/shifts?tab=open" icon={Megaphone}>See open shifts</Button>
      </Tile>
    );
  }
  const live = isCurrent && (state === 'on_shift' || state === 'on_break');
  const started = new Date(s.starts_at) <= new Date();
  const label = live ? (state === 'on_break' ? 'On break' : 'On shift now') : started ? 'Started' : `Starts ${until(s.starts_at)}`;
  const canClock = isCurrent && new Date(s.starts_at) - Date.now() <= 30 * 60000;
  return (
    <Tile tone="blue" className="!p-6">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-[13px] font-semibold uppercase tracking-wide opacity-80">
          {live ? <span className="h-2.5 w-2.5 rounded-full bg-white live-dot" /> : <Clock3 size={15} />}{live ? label : isCurrent || started ? 'Your shift' : 'Next shift'}
        </div>
        {!live && <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[12px] font-semibold">{label}</span>}
      </div>
      <div className="display mt-3 text-[26px] font-bold leading-tight">{s.venue_name}</div>
      {(s.address || s.postcode) && (
        <div className="mt-1 flex items-start gap-1.5 text-[14px] opacity-85"><MapPin size={15} className="mt-0.5 shrink-0" />{[s.address, s.postcode].filter(Boolean).join(', ')}</div>
      )}
      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <div className="text-[13px] opacity-75">{dayLabel(s.starts_at)}</div>
          <div className="display num text-[30px] font-bold leading-none">{range(s.starts_at, s.ends_at)}</div>
        </div>
        {s.role_name && <span className="rounded-full bg-white/15 px-3 py-1 text-[13px] font-semibold">{s.role_name}</span>}
      </div>
      {s.assignment_status === 'assigned' && !live && (
        <div className="mt-5 rounded-2xl bg-white/12 p-3">
          <div className="text-[14px] font-semibold">Can you work this shift?</div>
          <div className="mt-2 flex gap-2">
            <Button className="flex-1 !bg-white !text-blue" busy={busy} onClick={() => onAccept(s)}>Confirm</Button>
            <Button className="flex-1 !bg-white/15 !text-white !shadow-none" to="/officer/shifts">Options</Button>
          </div>
        </div>
      )}
      {live ? (
        <div className="mt-5 grid grid-cols-1 gap-2">
          <Button size="lg" className="w-full !bg-white !text-blue !shadow-none" icon={state === 'on_break' ? Coffee : LogOut} to="/officer/clock">
            {state === 'on_break' ? 'End break' : 'Clock out'}
          </Button>
        </div>
      ) : canClock ? (
        <Button size="lg" className="mt-5 w-full !bg-white !text-blue !shadow-none" icon={LogIn} to="/officer/clock">Clock in</Button>
      ) : isCurrent ? (
        <Button size="lg" className="mt-5 w-full !bg-white/15 !text-white !shadow-none" icon={LogIn} to="/officer/clock">Clock-in opens 30 min before</Button>
      ) : null}
    </Tile>
  );
}
