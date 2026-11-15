// The report's properties as one row of chips under the title: what, how serious, when and where, and the
// emergency facts. Each opens a small sheet; empty ones are dimmed, ones Orb filled carry a ✦ until someone taps them.
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Ambulance, Baby, Ban, Check, CircleHelp, Clock3, DoorOpen, Flame, Gauge, Hammer, Hand, HeartPulse, MapPin, MessageSquareWarning, Pill as PillIcon, ShieldAlert,
  ShoppingBag, Siren, Sparkles, Swords, UserRoundX,
} from 'lucide-react';
import {
  Button, cx, dayLabel, fromLocalInput, Input, Pressable, range, Segmented, Select, Sheet, Spinner, Textarea, time, toLocalInput, useApi, YesNo,
} from '../../../ui/index.jsx';
import { INCIDENT_TYPES, SEVERITIES, typeLabel } from '../../officer/_parts.jsx';

export const TYPE_ICON = {
  ejection: DoorOpen, refused_entry: Ban, assault: Swords, theft: ShoppingBag, drugs: PillIcon, weapon: ShieldAlert, medical: HeartPulse,
  damage: Hammer, fire: Flame, disorder: MessageSquareWarning, lost_child: Baby, vulnerable_person: UserRoundX, other: CircleHelp,
};
export const SEV_DOT = { low: 'bg-faint', medium: 'bg-amber', high: 'bg-red', critical: 'bg-red' };
// One chosen look for every picker: type, severity and shift
const pickCls = (on) => cx('rounded-2xl border-2 transition-colors', on ? 'border-blue bg-blue-soft text-blue' : 'border-transparent bg-bg text-ink');

export const H = 3600000;
export const DAY = 24 * H;
// Officers can report up to 30 days back (incidents.create checks the same)
export const BACKDATE_DAYS = 30;
const PAGE = 8;

/**
 * Which shift and time the report is for. Officers pick tonight's shift or one from the last 30 days;
 * managers pick any venue, and optionally a shift that day and an officer.
 */
export function useWhen({ edit, manager, existing, d0, v, setV }) {
  const [sp] = useSearchParams();
  const [shiftId, setShiftId] = useState(() => (edit ? null : d0.shift_id || sp.get('shift')));
  const [from] = useState(() => new Date(Date.now() - BACKDATE_DAYS * DAY).toISOString());
  const shiftsQ = useApi('shifts.mine', { from }, { skip: edit || manager });
  const shifts = useMemo(() => (shiftsQ.data || [])
    .filter((s) => ['assigned', 'accepted'].includes(s.assignment_status) && new Date(s.starts_at) - 2 * H <= Date.now())
    .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at)), [shiftsQ.data]);
  const recent = useMemo(() => shifts.filter((s) => Date.now() - new Date(s.ends_at) < 12 * H), [shifts]);
  // "Earlier" when coming from an older shift's page, or when there is nothing on tonight
  const [when, setWhen] = useState(d0.when || 'now');
  useEffect(() => {
    if (edit || manager || shiftId || !shifts.length) return;
    const now = Date.now();
    const live = shifts.find((s) => new Date(s.starts_at) - 2 * H <= now && new Date(s.ends_at).getTime() + 2 * H >= now);
    if (live || recent.length) setShiftId((live || recent[0]).id);
    else setWhen('earlier');
  }, [shifts, recent, edit, manager, shiftId]);
  const shift = shifts.find((s) => s.id === shiftId);
  const locked = !edit && !manager && !!(d0.shift_id || sp.get('shift'));
  // Picking an earlier shift moves the time onto it, unless it is already within that shift
  const pickShift = (s) => {
    setShiftId(s.id);
    const t = fromLocalInput(v.occurred_at);
    const ms = t ? new Date(t).getTime() : NaN;
    if (!(ms >= new Date(s.starts_at) - 2 * H && ms <= new Date(s.ends_at).getTime() + 2 * H)) setV((x) => ({ ...x, occurred_at: toLocalInput(new Date(Math.min(Date.parse(s.starts_at), Date.now()))) }));
  };
  useEffect(() => {
    if (shift && !recent.includes(shift)) { setWhen('earlier'); pickShift(shift); }
  }, [shift, recent]); // eslint-disable-line react-hooks/exhaustive-deps
  const [m, setM] = useState(() => ({ venue_id: '', shift_id: '', officer_id: '', ...(d0.manager || {}) }));
  const venuesQ = useApi('venues.list', {}, { skip: !manager });
  const venueName = manager ? venuesQ.data?.find((x) => x.id === m.venue_id)?.name : shift?.venue_name || existing?.venue_name || d0.venue_name;

  const at = fromLocalInput(v.occurred_at);
  const atMs = at ? new Date(at).getTime() : NaN;
  const future = atMs > Date.now() + 5 * 60000;
  const outsideShift = !edit && !manager && !!shift && (atMs < new Date(shift.starts_at) - 2 * H || atMs > new Date(shift.ends_at).getTime() + 2 * H);
  const tooOld = !edit && !manager && Date.now() - atMs > BACKDATE_DAYS * DAY;
  return { shiftId, setShiftId, shiftsQ, shifts, recent, when, setWhen, shift, locked, pickShift, m, setM, venuesQ, venueName, at, future, outsideShift, tooOld };
}

/** The chip row. sheet / setSheet are lifted so the gap check can open the one that fixes a gap. */
export function Props({ v, setV, w, edit, existing, manager, filled, confirm, sheet, setSheet, setFact, readOnly }) {
  const sev = SEVERITIES.find((s) => s.value === v.severity);
  const TI = TYPE_ICON[v.type] || CircleHelp;
  const open = (k, ...also) => () => { [k, ...also].forEach(confirm); setSheet(k); };
  const whenText = w.at ? `${dayLabel(w.at)} ${time(w.at)}` : 'When';
  const chips = [
    { k: 'type', icon: TI, label: v.type ? typeLabel(v.type) : 'Type', on: !!v.type },
    { k: 'severity', dot: sev && SEV_DOT[sev.value], icon: Gauge, label: sev ? sev.label : 'Severity', on: !!sev, tone: v.severity === 'critical' || v.severity === 'high' ? 'text-red' : '' },
    { k: 'when', icon: Clock3, label: w.venueName ? `${whenText} · ${w.venueName}` : whenText, on: !!w.at },
    { k: 'location', icon: MapPin, label: v.location || 'Location', on: !!v.location.trim() },
    { k: 'police', icon: Siren, label: v.police_called ? `Police${v.police_ref ? ` · ${v.police_ref}` : ''}` : 'Police', on: v.police_called, also: ['police_called'] },
    { k: 'ambulance', icon: Ambulance, label: v.ambulance_called ? `Ambulance${v.ambulance_ref ? ` · ${v.ambulance_ref}` : ''}` : 'Ambulance', on: v.ambulance_called, also: ['ambulance_called'] },
    { k: 'force', icon: Hand, label: v.force_used ? 'Force used' : 'Force', on: v.force_used, also: ['force_used'], tone: v.force_used ? 'text-red' : '' },
  ];
  return (
    <>
      <div className="no-scrollbar edge-fade -mx-[var(--px)] flex gap-2 overflow-x-auto px-[var(--px)] py-1 sm:flex-wrap sm:overflow-visible">
        {chips.map((c) => {
          const orb = filled.has(c.k) || c.also?.some((x) => filled.has(x));
          return (
            <Pressable press key={c.k} disabled={readOnly} onClick={open(c.k, ...(c.also || []))} aria-label={`${c.k}: ${c.label}`}
              className={cx('relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-footnote font-semibold transition-colors before:absolute before:inset-x-0 before:-inset-y-1',
                c.on ? cx('border-hairline bg-surface shadow-tile', c.tone || 'text-ink') : 'border-dashed border-line bg-transparent text-faint',
                orb && 'border-blue/40 ring-2 ring-blue/10')}>
              {c.dot ? <span className={cx('h-2.5 w-2.5 rounded-full', c.dot)} aria-hidden /> : <c.icon size={16} className="shrink-0" aria-hidden />}
              <span className="max-w-[14rem] truncate">{c.label}</span>
              {orb && <Sparkles size={14} className="shrink-0 text-blue" aria-label="Filled by Orb, tap to check" />}
            </Pressable>
          );
        })}
      </div>

      <Sheet open={sheet === 'type'} onClose={() => setSheet(null)} title="What happened?" size="md">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {INCIDENT_TYPES.map((t) => {
            const I = TYPE_ICON[t.value];
            const on = v.type === t.value;
            return (
              <Pressable press key={t.value} onClick={() => { setV((s) => ({ ...s, type: t.value })); setSheet(null); }} aria-pressed={on}
                className={cx('flex min-h-[84px] flex-col items-center justify-center gap-2 px-1 py-2.5 text-center text-footnote font-semibold leading-tight', pickCls(on))}>
                <I size={24} />{t.label}
              </Pressable>
            );
          })}
        </div>
      </Sheet>

      <Sheet open={sheet === 'severity'} onClose={() => setSheet(null)} title="How serious?" size="sm">
        <div className="grid grid-cols-2 gap-2">
          {SEVERITIES.map((s) => {
            const on = v.severity === s.value;
            return (
              <Pressable press key={s.value} onClick={() => { setV((x) => ({ ...x, severity: s.value })); setSheet(null); }} aria-pressed={on} className={cx('px-3.5 py-3', pickCls(on))}>
                <div className="flex items-center gap-2 text-callout font-bold"><span className={cx('h-2.5 w-2.5 rounded-full', SEV_DOT[s.value])} aria-hidden />{s.label}{on && <Check size={18} className="ml-auto" aria-hidden />}</div>
                <div className={cx('mt-0.5 text-caption', on ? 'opacity-85' : 'text-muted')}>{s.hint}</div>
              </Pressable>
            );
          })}
        </div>
        {(v.severity === 'high' || v.severity === 'critical') && (
          <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-amber-soft px-4 py-3 text-subhead font-semibold text-amber"><AlertTriangle size={18} className="shrink-0" aria-hidden />Managers and the venue are alerted straight away.</div>
        )}
      </Sheet>

      <Sheet open={sheet === 'when'} onClose={() => setSheet(null)} title={manager ? 'When and where' : 'When and which shift'} size="md" footer={<Button onClick={() => setSheet(null)}>Done</Button>}>
        <div className="space-y-5">
          {manager ? <ManagerWhen v={v} setV={setV} w={w} /> : <StepWhen v={v} setV={setV} w={w} edit={edit} existing={existing} />}
        </div>
      </Sheet>

      <Sheet open={sheet === 'location'} onClose={() => setSheet(null)} title="Where exactly?" size="sm" footer={<Button onClick={() => setSheet(null)}>Done</Button>}>
        <Input autoFocus value={v.location} onChange={(e) => setV((s) => ({ ...s, location: e.target.value }))} placeholder="e.g. Main entrance, smoking area, upstairs bar" />
      </Sheet>

      <Sheet open={['police', 'ambulance', 'force'].includes(sheet)} onClose={() => setSheet(null)} title={{ police: 'Police', ambulance: 'Ambulance', force: 'Force' }[sheet] || ''} size="sm"
        footer={<Button onClick={() => setSheet(null)}>Done</Button>}>
        {['police', 'ambulance', 'force'].includes(sheet) && <FactFields kind={sheet} v={v} setV={setV} setFact={setFact} />}
      </Sheet>
    </>
  );
}

// The yes/no and its reference (or, for force, the reason) — the same fields as the fact card in the page
export function FactFields({ kind, v, setV, setFact, bare }) {
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const more = (on, node) => on && <div className="mt-4 anim-fade-in">{node}</div>;
  if (kind === 'force') {
    return (
      <div>
        {!bare && <YesNo label="Was force used?" hint="Any physical intervention or restraint" icon={Hand} value={v.force_used} onChange={(x) => setFact('force', x)} danger />}
        {more(v.force_used, <Textarea label="Why was force necessary?" autoGrow minRows={3} value={v.force_justification} onChange={set('force_justification')} placeholder="What the threat was, what you tried first, the technique used and for how long" />)}
      </div>
    );
  }
  const police = kind === 'police';
  const k = police ? 'police' : 'ambulance';
  return (
    <div>
      {!bare && <YesNo label={police ? 'Were the police called?' : 'Was an ambulance called?'} icon={police ? Siren : Ambulance} value={v[`${k}_called`]} onChange={(x) => setFact(k, x)} />}
      {more(v[`${k}_called`], <Input label={police ? 'Police reference (CAD or crime number)' : 'Ambulance reference'} value={v[`${k}_ref`]} onChange={set(`${k}_ref`)} />)}
    </div>
  );
}

function Group({ title, hint, children }) {
  return (
    <section>
      {title && <h3 className="text-headline font-bold">{title}</h3>}
      {hint && <p className="mt-0.5 text-footnote text-muted">{hint}</p>}
      <div className={cx(title && 'mt-2.5')}>{children}</div>
    </section>
  );
}

function ShiftChoice({ s, on, onPick }) {
  return (
    <Pressable press onClick={() => onPick(s)} aria-pressed={on}
      className={cx('flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3', pickCls(on))}>
      <span className="min-w-0"><span className="block truncate text-body font-semibold">{s.venue_name}</span><span className="num text-footnote text-muted">{dayLabel(s.starts_at)} · {range(s.starts_at, s.ends_at)}</span></span>
      {on && <Check size={20} className="shrink-0" aria-hidden />}
    </Pressable>
  );
}

function StepWhen({ v, setV, w, edit, existing }) {
  const { shifts, recent, when, setWhen, shift, shiftsQ, shiftId, pickShift, future, outsideShift, tooOld, locked } = w;
  const [shown, setShown] = useState(PAGE);
  const setTime = (x) => setV((s) => ({ ...s, occurred_at: x }));
  const earlier = when === 'earlier';
  const list = earlier ? shifts : recent;
  // The time picker stays within the chosen shift (2 hours either side), and never in the future
  const lim = shift && !edit ? {
    min: toLocalInput(new Date(Date.parse(shift.starts_at) - 2 * H)),
    max: toLocalInput(new Date(Math.min(Date.parse(shift.ends_at) + 2 * H, Date.now()))),
  } : { max: toLocalInput(new Date()) };
  const choose = (x) => {
    setWhen(x);
    if (x === 'now' && recent.length) { pickShift(recent[0]); setTime(toLocalInput(new Date())); }
  };
  const timeCard = (
    <Group key="time" title={earlier ? 'What time?' : 'When did it happen?'} hint={earlier && shift ? 'Your best estimate is fine. Say in the report if you are not sure.' : undefined}>
      <div className="flex gap-2">
        <Input className="min-w-0 flex-1" type="datetime-local" value={v.occurred_at} min={lim.min} max={lim.max} onChange={(e) => setTime(e.target.value)} />
        {!earlier && <Button variant="secondary" onClick={() => setTime(toLocalInput(new Date()))}>Now</Button>}
      </div>
      {future && <p className="mt-2 text-footnote font-semibold text-red">The time cannot be in the future.</p>}
      {outsideShift && <p className="mt-2 text-footnote font-semibold text-red">This is more than 2 hours outside the shift you picked.</p>}
      {tooOld && <p className="mt-2 text-footnote font-semibold text-red">You can report up to {BACKDATE_DAYS} days back. Ask the office to file anything older.</p>}
    </Group>
  );
  const shiftCard = (
    <Group key="shift" title={locked || edit ? 'Shift' : earlier ? 'Which shift was it?' : 'Which shift?'} hint={edit || locked ? undefined : earlier ? `Shifts you worked in the last ${BACKDATE_DAYS} days.` : 'Incidents are filed against the venue you were working at.'}>
      {edit ? (
        <div className="rounded-2xl bg-bg px-4 py-3 text-body font-semibold">{existing.venue_name}</div>
      ) : locked && shift ? (
        <div className="rounded-2xl bg-bg px-4 py-3"><div className="truncate text-body font-semibold">{shift.venue_name}</div><div className="num text-footnote text-muted">{dayLabel(shift.starts_at)} · {range(shift.starts_at, shift.ends_at)}</div></div>
      ) : shiftsQ.loading && !shifts.length ? <Spinner className="py-6" /> : !list.length ? (
        <p className="rounded-2xl bg-amber-soft px-4 py-3 text-subhead font-semibold text-amber">
          {earlier || !shifts.length
            ? `You have no shifts in the last ${BACKDATE_DAYS} days. Ask the office to file anything older.`
            : 'You are not on a shift right now. Choose Earlier to report something from a past shift.'}
        </p>
      ) : (
        <div className="space-y-2">
          {list.slice(0, shown).map((s) => <ShiftChoice key={s.id} s={s} on={s.id === shiftId} onPick={pickShift} />)}
          {list.length > shown && <Button variant="secondary" className="w-full" onClick={() => setShown((n) => n + PAGE)}>Show more shifts</Button>}
        </div>
      )}
    </Group>
  );
  return (
    <>
      {!edit && !locked && (
        <Segmented full value={when} onChange={choose} options={[{ value: 'now', label: 'Tonight / just now' }, { value: 'earlier', label: 'Earlier' }]} />
      )}
      {earlier ? [shiftCard, timeCard] : [timeCard, shiftCard]}
    </>
  );
}

// Office filing: any venue in scope, any past date; the shift and officer are optional
function ManagerWhen({ v, setV, w }) {
  const { m, setM, at, future, venuesQ } = w;
  const day = v.occurred_at.slice(0, 10);
  const range0 = day ? { from: fromLocalInput(`${day}T00:00`), to: new Date(Date.parse(fromLocalInput(`${day}T00:00`)) + 30 * H).toISOString() } : null;
  const shiftsQ = useApi('shifts.list', { ...range0, venue_id: m.venue_id }, { skip: !m.venue_id || !range0 });
  const officersQ = useApi('officers.list', {});
  const dayShifts = (shiftsQ.data || []).filter((s) => s.status === 'published');
  const sh = dayShifts.find((s) => s.id === m.shift_id);
  const people = sh
    ? sh.assignments.filter((a) => ['assigned', 'accepted'].includes(a.status)).map((a) => ({ value: a.officer_id, label: a.name }))
    : (officersQ.data || []).map((o) => ({ value: o.id, label: `${o.first_name} ${o.last_name}` }));
  const pick = (k) => (e) => setM((x) => ({ ...x, [k]: e.target.value, ...(k === 'venue_id' ? { shift_id: '', officer_id: '' } : k === 'shift_id' ? { officer_id: '' } : {}) }));
  const old = at && Date.now() - Date.parse(at) > DAY;
  return (
    <>
      <Group title="When did it happen?" hint="Any past date. Your best estimate of the time is fine.">
        <Input type="datetime-local" value={v.occurred_at} max={toLocalInput(new Date())} onChange={(e) => setV((s) => ({ ...s, occurred_at: e.target.value }))} />
        {future && <p className="mt-2 text-footnote font-semibold text-red">The time cannot be in the future.</p>}
        {old && !future && <p className="mt-2 text-footnote text-muted">This will show as reported later, with today's date as the report date.</p>}
      </Group>
      <Group title="Where?">
        <div className="space-y-3">
          <Select label="Venue" value={m.venue_id} onChange={pick('venue_id')} placeholder="Choose venue"
            options={(venuesQ.data || []).filter((x) => x.active !== false).map((x) => ({ value: x.id, label: x.name }))} />
          {m.venue_id && (
            <Select label="Shift (optional)" value={m.shift_id} onChange={pick('shift_id')} placeholder={shiftsQ.loading ? 'Loading shifts…' : dayShifts.length ? 'No particular shift' : 'No shifts that day'}
              options={dayShifts.map((s) => ({ value: s.id, label: `${dayLabel(s.starts_at)} · ${range(s.starts_at, s.ends_at)} · ${s.role_name}` }))} />
          )}
          <Select label="Officer involved (optional)" value={m.officer_id} onChange={pick('officer_id')} placeholder="No officer" options={people} />
        </div>
      </Group>
    </>
  );
}
