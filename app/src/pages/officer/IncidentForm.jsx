import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Ambulance, Baby, Ban, Camera, Check, ChevronLeft, ChevronRight, CircleHelp, DoorOpen, FilePlus, Flame, Hammer, HeartPulse, ImagePlus, MessageSquareWarning,
  Pencil, Pill as PillIcon, Plus, ShieldAlert, ShoppingBag, Siren, Sparkles, Swords, Trash2, UserRoundX,
} from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Button, cx, dateTime, dayLabel, fromLocalInput, Input, KV, Load, Page, Pill, Pressable, range, Segmented, Select, Sheet, Spinner, Textarea, Toggle, toLocalInput, useAction, useApi, useConfirm, useToast,
} from '../../ui/index.jsx';
import { INCIDENT_TYPES, NotLinked, Progress, SEVERITIES, typeLabel } from './_parts.jsx';
import { DOC_ACCEPT, FileTile, MAX_FILES, useUploads } from '../shared/evidence.jsx';

const TYPE_ICON = {
  ejection: DoorOpen, refused_entry: Ban, assault: Swords, theft: ShoppingBag, drugs: PillIcon, weapon: ShieldAlert, medical: HeartPulse,
  damage: Hammer, fire: Flame, disorder: MessageSquareWarning, lost_child: Baby, vulnerable_person: UserRoundX, other: CircleHelp,
};
const SEV_STYLE = {
  low: 'border-line bg-surface text-ink', medium: 'border-amber/40 bg-amber-soft text-amber', high: 'border-red/40 bg-red-soft text-red', critical: 'border-red bg-red text-white',
};
const STEPS = ['Evidence', 'What', 'When & where', 'People', 'Actions', 'Review'];
const BLANK = {
  type: '', severity: '', occurred_at: '', location: '', description: '', people_involved: '', injuries: '', actions_taken: '',
  force_used: false, force_justification: '', police_called: false, police_ref: '', ambulance_called: false, ambulance_ref: '',
};
const H = 3600000;
const DAY = 24 * H;
// Officers can report up to 30 days back (incidents.create checks the same)
const BACKDATE_DAYS = 30;
const PAGE = 8;

export default function IncidentForm() {
  const { id } = useParams();
  const { user } = useAuth();
  const { pathname } = useLocation();
  // Managers file from /company or /security/incidents/new for any venue and date
  if (!id && user.role !== 'officer' && !pathname.startsWith('/officer')) return <Wizard manager />;
  if (!user.officer_id) return <Page title="Report incident"><NotLinked /></Page>;
  return id ? <EditLoader id={id} /> : <Wizard />;
}

function EditLoader({ id }) {
  const q = useApi('incidents.get', { id });
  return (
    <Load q={q}>
      {(inc) => (inc.status === 'closed'
        ? <Page title="Edit report" back={{ to: `/officer/incidents/${id}`, label: inc.ref }}><div className="rounded-2xl bg-bg p-4 text-body text-muted">This report is closed and can no longer be edited.</div></Page>
        : <Wizard existing={inc} />)}
    </Load>
  );
}

function Wizard({ existing, manager }) {
  const nav = useNavigate();
  const { user } = useAuth();
  const base = manager ? `/${user.role}` : '/officer';
  const toast = useToast();
  const edit = !!existing;
  const [step, setStep] = useState(0);
  const [v, setV] = useState(() => (edit
    ? { ...BLANK, ...Object.fromEntries(Object.keys(BLANK).map((k) => [k, existing[k] ?? BLANK[k]])), occurred_at: toLocalInput(existing.occurred_at) }
    : { ...BLANK, occurred_at: toLocalInput(new Date()) }));
  const [witnesses, setWitnesses] = useState(() => (existing?.witnesses || []).map(({ name, contact, statement }) => ({ name, contact: contact || '', statement: statement || '' })));
  const [saved, setSaved] = useState(existing?.attachments || []);
  const uploads = useUploads({ existingCount: saved.length, toast });
  const [notes, setNotes] = useState('');
  const [aiAssisted, setAiAssisted] = useState(!!existing?.ai_assisted);
  // From the shift page: ?shift= picks the shift, ?entry= links the report to a shift log entry and starts from its words
  const [sp] = useSearchParams();
  const entryId = edit ? null : sp.get('entry');
  const [shiftId, setShiftId] = useState(() => (edit ? null : sp.get('shift')));
  const fromLog = useApi('shifts.detail', { id: sp.get('shift') }, { skip: !entryId || !sp.get('shift') });
  useEffect(() => {
    const e = fromLog.data?.entries.find((x) => x.id === entryId);
    if (e?.body) setNotes((n) => n || e.body);
  }, [fromLog.data, entryId]);
  const [run, busy] = useAction();
  const top = useRef(null);

  // Shifts the officer could be reporting from: tonight's, or any they worked in the last 30 days
  const [from] = useState(() => new Date(Date.now() - BACKDATE_DAYS * DAY).toISOString());
  const shiftsQ = useApi('shifts.mine', { from }, { skip: edit || manager });
  const shifts = useMemo(() => (shiftsQ.data || [])
    .filter((s) => ['assigned', 'accepted'].includes(s.assignment_status) && new Date(s.starts_at) - 2 * H <= Date.now())
    .sort((a, b) => new Date(b.starts_at) - new Date(a.starts_at)), [shiftsQ.data]);
  const recent = useMemo(() => shifts.filter((s) => Date.now() - new Date(s.ends_at) < 12 * H), [shifts]);
  // "Earlier" when coming from an older shift's page, or when there is nothing on tonight
  const [when, setWhen] = useState('now');
  useEffect(() => {
    if (edit || manager || shiftId || !shifts.length) return;
    const now = Date.now();
    const live = shifts.find((s) => new Date(s.starts_at) - 2 * H <= now && new Date(s.ends_at).getTime() + 2 * H >= now);
    if (live || recent.length) setShiftId((live || recent[0]).id);
    else setWhen('earlier');
  }, [shifts, recent, edit, manager, shiftId]);
  const shift = shifts.find((s) => s.id === shiftId);
  useEffect(() => {
    if (shift && !recent.includes(shift)) { setWhen('earlier'); pickShift(shift); }
  }, [shift, recent]); // eslint-disable-line react-hooks/exhaustive-deps
  // Manager mode: venue, an optional shift that day and an optional officer
  const [m, setM] = useState({ venue_id: '', shift_id: '', officer_id: '' });
  const venuesQ = useApi('venues.list', {}, { skip: !manager });
  const venueName = manager ? venuesQ.data?.find((x) => x.id === m.venue_id)?.name : shift?.venue_name || existing?.venue_name;

  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e?.target ? e.target.value : e }));
  const at = fromLocalInput(v.occurred_at);
  const atMs = at ? new Date(at).getTime() : NaN;
  const future = atMs > Date.now() + 5 * 60000;
  const outsideShift = !edit && !manager && shift && (atMs < new Date(shift.starts_at) - 2 * H || atMs > new Date(shift.ends_at).getTime() + 2 * H);
  const tooOld = !edit && !manager && Date.now() - atMs > BACKDATE_DAYS * DAY;
  // Picking an earlier shift moves the time onto it, unless it is already within that shift
  const pickShift = (s) => {
    setShiftId(s.id);
    const t = fromLocalInput(v.occurred_at);
    const ms = t ? new Date(t).getTime() : NaN;
    if (!(ms >= new Date(s.starts_at) - 2 * H && ms <= new Date(s.ends_at).getTime() + 2 * H)) setV((x) => ({ ...x, occurred_at: toLocalInput(new Date(Math.min(Date.parse(s.starts_at), Date.now()))) }));
  };

  const problems = [
    !v.type || !v.severity ? 'Choose what happened and how serious it was' : null,
    !v.description.trim() ? 'Describe what happened' : null,
    !at ? 'Add the time it happened' : future ? 'The time cannot be in the future' : null,
    !edit && !manager && !shift ? 'Choose the shift you were working' : null,
    manager && !m.venue_id ? 'Choose the venue' : null,
    outsideShift ? 'The time must be within 2 hours of your shift' : null,
    tooOld ? `Officers can report up to ${BACKDATE_DAYS} days back. Ask the office for anything older.` : null,
    v.force_used && !v.force_justification.trim() ? 'Explain why force was necessary' : null,
    uploads.uploading ? 'Wait for your files to finish uploading' : null,
  ].filter(Boolean);

  const canNext = [
    true,
    v.type && v.severity && v.description.trim().length > 0,
    at && !future && (edit || (manager ? m.venue_id : shift && !outsideShift && !tooOld)),
    true,
    !v.force_used || v.force_justification.trim(),
    !problems.length,
  ][step];

  const go = (n) => { setStep(n); top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const submit = () => run(async () => {
    const { attachments } = uploads;
    const body = {
      ...v, occurred_at: at, ai_assisted: aiAssisted,
      force_justification: v.force_used ? v.force_justification : '', police_ref: v.police_called ? v.police_ref : '', ambulance_ref: v.ambulance_called ? v.ambulance_ref : '',
      witnesses: witnesses.filter((w) => w.name.trim()),
    };
    if (edit) {
      await api('incidents.update', { id: existing.id, ...body });
      if (attachments.length) await api('incidents.addAttachments', { id: existing.id, attachments });
      return existing;
    }
    if (manager) return api('incidents.create', { ...body, venue_id: m.venue_id, shift_id: m.shift_id || undefined, officer_id: m.officer_id || undefined, attachments });
    return api('incidents.create', { ...body, shift_id: shift.id, venue_id: shift.venue_id, attachments, log_entry_id: entryId || undefined });
  }, edit ? 'Report updated and resubmitted' : 'Incident reported').then((inc) => nav(`${base}/incidents/${inc.id}`, { replace: true })).catch(() => {});

  const back = edit ? { to: `/officer/incidents/${existing.id}`, label: existing.ref } : { to: `${base}/incidents`, label: 'Incidents' };

  return (
    <Page title={edit ? `Edit ${existing.ref}` : 'Report incident'} back={back}>
      <div ref={top} className="-mt-2 mb-4">
        <div className="mb-1.5 flex items-center justify-between text-footnote font-semibold">
          <span className="text-blue">{STEPS[step]}</span><span className="text-muted">Step {step + 1} of {STEPS.length}</span>
        </div>
        <Progress value={step + 1} max={STEPS.length} />
      </div>

      {edit && existing.review_comment && existing.status === 'changes_requested' && (
        <div className="mb-3 flex gap-2.5 rounded-2xl bg-amber-soft px-4 py-3 text-amber">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div><div className="text-subhead font-bold">{existing.reviewed_by_name || 'Your manager'} asked for changes</div><p className="whitespace-pre-line text-subhead">{existing.review_comment}</p></div>
        </div>
      )}

      <div key={step} style={{ animation: 'fade .2s' }}>
        {step === 0 && (
          <StepEvidence uploads={uploads} saved={saved} setSaved={setSaved} toast={toast} notes={notes} setNotes={setNotes}
            draft={{ v, setV, shiftId: manager ? m.shift_id || null : shiftId, at, incidentId: existing?.id, onAccept: () => setAiAssisted(true) }} />
        )}
        {step === 1 && <StepWhat v={v} setV={setV} set={set} />}
        {step === 2 && (manager
          ? <ManagerWhen v={v} set={set} m={m} setM={setM} at={at} future={future} venues={venuesQ} />
          : <StepWhen v={v} set={set} edit={edit} existing={existing} shifts={shifts} recent={recent} when={when} setWhen={setWhen} shift={shift}
            loading={shiftsQ.loading} shiftId={shiftId} pickShift={pickShift} future={future} outsideShift={outsideShift} tooOld={tooOld} />)}
        {step === 3 && <StepPeople v={v} set={set} witnesses={witnesses} setWitnesses={setWitnesses} />}
        {step === 4 && <StepActions v={v} set={set} setV={setV} />}
        {step === 5 && <StepReview v={v} at={at} venueName={venueName} existing={existing} witnesses={witnesses} files={uploads.done.length} saved={saved.length} aiAssisted={aiAssisted} problems={problems} goTo={go} />}
      </div>

      <div className="sticky bottom-[calc(var(--tabbar-h)+12px)] z-10 mt-5 flex gap-2 rounded-tile bg-bg/90 py-2 backdrop-blur">
        {step > 0 && <Button size="lg" variant="secondary" icon={ChevronLeft} onClick={() => go(step - 1)} disabled={busy}>Back</Button>}
        {step < STEPS.length - 1
          ? <Button size="lg" className="flex-1" disabled={!canNext} iconRight={ChevronRight} onClick={() => go(step + 1)}>Next</Button>
          : <Button size="lg" className="flex-1" busy={busy} disabled={!canNext} onClick={submit}>{edit ? 'Resubmit report' : 'Submit report'}</Button>}
      </div>
    </Page>
  );
}

function Card({ title, hint, children }) {
  return (
    <section className="rounded-tile bg-surface p-4 shadow-tile">
      {title && <h2 className="text-headline font-bold">{title}</h2>}
      {hint && <p className="mt-0.5 text-footnote text-muted">{hint}</p>}
      <div className={cx(title && 'mt-3')}>{children}</div>
    </section>
  );
}

function StepWhat({ v, setV, set }) {
  return (
    <div className="space-y-3">
      <Card title="What happened?">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {INCIDENT_TYPES.map((t) => {
            const I = TYPE_ICON[t.value];
            const on = v.type === t.value;
            return (
              <Pressable press key={t.value} onClick={() => setV((s) => ({ ...s, type: t.value }))} aria-pressed={on}
                className={cx('flex min-h-[84px] flex-col items-center justify-center gap-1.5 rounded-2xl border-2 px-1 py-2 text-center text-footnote font-semibold leading-tight transition-colors',
                  on ? 'border-blue bg-blue-soft text-blue' : 'border-transparent bg-bg text-ink')}>
                <I size={24} />{t.label}
              </Pressable>
            );
          })}
        </div>
      </Card>
      <Card title="How serious?">
        <div className="grid grid-cols-2 gap-2">
          {SEVERITIES.map((s) => (
            <Pressable press key={s.value} onClick={() => setV((x) => ({ ...x, severity: s.value }))} aria-pressed={v.severity === s.value}
              className={cx('rounded-2xl border-2 px-3 py-3 transition-colors', v.severity === s.value ? SEV_STYLE[s.value] : 'border-transparent bg-bg', v.severity === s.value && 'ring-2 ring-blue/30')}>
              <div className="text-callout font-bold">{s.label}</div>
              <div className={cx('text-caption', v.severity === s.value ? 'opacity-85' : 'text-muted')}>{s.hint}</div>
            </Pressable>
          ))}
        </div>
        {(v.severity === 'high' || v.severity === 'critical') && <p className="mt-2 text-footnote font-semibold text-red">Managers and the venue are alerted straight away.</p>}
      </Card>
      <Card title="Describe what happened" hint="Facts in order: what you saw, heard and did. Who, what, where.">
        <Textarea rows={6} value={v.description} onChange={set('description')} placeholder="At about 23:40 a male in a red jacket was refused service at the main bar…" />
      </Card>
    </div>
  );
}

function ShiftChoice({ s, on, onPick }) {
  return (
    <Pressable press onClick={() => onPick(s)} aria-pressed={on}
      className={cx('flex w-full items-center justify-between gap-3 rounded-2xl border-2 px-4 py-3 transition-colors', on ? 'border-blue bg-blue-soft' : 'border-transparent bg-bg')}>
      <span className="min-w-0"><span className="block truncate text-body font-semibold">{s.venue_name}</span><span className="num text-footnote text-muted">{dayLabel(s.starts_at)} · {range(s.starts_at, s.ends_at)}</span></span>
      <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-full border-2', on ? 'border-blue bg-blue' : 'border-line')}>{on && <span className="h-2 w-2 rounded-full bg-white" />}</span>
    </Pressable>
  );
}

function StepWhen({ v, set, edit, existing, shifts, recent, when, setWhen, shift, loading, shiftId, pickShift, future, outsideShift, tooOld }) {
  const [shown, setShown] = useState(PAGE);
  const earlier = when === 'earlier';
  const list = earlier ? shifts : recent;
  // The time picker stays within the chosen shift (2 hours either side), and never in the future
  const lim = shift && !edit ? {
    min: toLocalInput(new Date(Date.parse(shift.starts_at) - 2 * H)),
    max: toLocalInput(new Date(Math.min(Date.parse(shift.ends_at) + 2 * H, Date.now()))),
  } : { max: toLocalInput(new Date()) };
  const choose = (w) => {
    setWhen(w);
    if (w === 'now' && recent.length) { pickShift(recent[0]); set('occurred_at')(toLocalInput(new Date())); }
  };
  const timeCard = (
    <Card key="time" title={earlier ? 'What time?' : 'When did it happen?'} hint={earlier && shift ? 'Your best estimate is fine. Say in the description if you are not sure.' : undefined}>
      <div className="flex gap-2">
        <Input className="flex-1" type="datetime-local" value={v.occurred_at} min={lim.min} max={lim.max} onChange={set('occurred_at')} />
        {!earlier && <Button variant="secondary" onClick={() => set('occurred_at')(toLocalInput(new Date()))}>Now</Button>}
      </div>
      {future && <p className="mt-2 text-footnote font-semibold text-red">The time cannot be in the future.</p>}
      {outsideShift && <p className="mt-2 text-footnote font-semibold text-red">This is more than 2 hours outside the shift you picked.</p>}
      {tooOld && <p className="mt-2 text-footnote font-semibold text-red">You can report up to {BACKDATE_DAYS} days back. Ask the office to file anything older.</p>}
    </Card>
  );
  const shiftCard = (
    <Card key="shift" title={earlier ? 'Which shift was it?' : 'Which shift?'} hint={edit ? undefined : earlier ? `Shifts you worked in the last ${BACKDATE_DAYS} days.` : 'Incidents are filed against the venue you were working at.'}>
      {edit ? (
        <div className="rounded-2xl bg-bg px-4 py-3 text-body font-semibold">{existing.venue_name}</div>
      ) : loading && !shifts.length ? <Spinner className="py-6" /> : !list.length ? (
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
    </Card>
  );
  return (
    <div className="space-y-3">
      {!edit && (
        <Segmented full value={when} onChange={choose} options={[{ value: 'now', label: 'Tonight / just now' }, { value: 'earlier', label: 'Earlier' }]} />
      )}
      {earlier ? [shiftCard, timeCard] : [timeCard, shiftCard]}
      <Card title="Where exactly?">
        <Input value={v.location} onChange={set('location')} placeholder="e.g. Main entrance, smoking area, upstairs bar" />
      </Card>
    </div>
  );
}

// Office filing: any venue in scope, any past date; the shift and officer are optional
function ManagerWhen({ v, set, m, setM, at, future, venues }) {
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
    <div className="space-y-3">
      <Card title="When did it happen?" hint="Any past date. Your best estimate of the time is fine.">
        <Input type="datetime-local" value={v.occurred_at} max={toLocalInput(new Date())} onChange={set('occurred_at')} />
        {future && <p className="mt-2 text-footnote font-semibold text-red">The time cannot be in the future.</p>}
        {old && !future && <p className="mt-2 text-footnote text-muted">This will show as reported later, with today's date as the report date.</p>}
      </Card>
      <Card title="Where?">
        <div className="space-y-3">
          <Select label="Venue" value={m.venue_id} onChange={pick('venue_id')} placeholder="Choose venue"
            options={(venues.data || []).filter((x) => x.active !== false).map((x) => ({ value: x.id, label: x.name }))} />
          {m.venue_id && (
            <Select label="Shift (optional)" value={m.shift_id} onChange={pick('shift_id')} placeholder={shiftsQ.loading ? 'Loading shifts…' : dayShifts.length ? 'No particular shift' : 'No shifts that day'}
              options={dayShifts.map((s) => ({ value: s.id, label: `${dayLabel(s.starts_at)} · ${range(s.starts_at, s.ends_at)} · ${s.role_name}` }))} />
          )}
          <Select label="Officer involved (optional)" value={m.officer_id} onChange={pick('officer_id')} placeholder="No officer" options={people} />
          <Input label="Where exactly?" value={v.location} onChange={set('location')} placeholder="e.g. Main entrance, smoking area, upstairs bar" />
        </div>
      </Card>
    </div>
  );
}

function StepPeople({ v, set, witnesses, setWitnesses }) {
  const setW = (i, k) => (e) => setWitnesses((ws) => ws.map((w, j) => (j === i ? { ...w, [k]: e.target.value } : w)));
  return (
    <div className="space-y-3">
      <Card title="People involved" hint="Names if known, or descriptions: age, clothing, build.">
        <Textarea rows={4} value={v.people_involved} onChange={set('people_involved')} placeholder="White male, about 30, red jacket, dark jeans" />
      </Card>
      <Card title="Injuries" hint="Anyone hurt, including you. Leave blank if none.">
        <Textarea rows={3} value={v.injuries} onChange={set('injuries')} placeholder="Cut above left eye, treated by first aider" />
      </Card>
      <Card title="Witnesses">
        <div className="space-y-3">
          {witnesses.map((w, i) => (
            <div key={i} className="rounded-2xl bg-bg p-3">
              <div className="flex items-end gap-2">
                <Input className="flex-1" label="Name" value={w.name} onChange={setW(i, 'name')} />
                <Button variant="ghost" size="sm" icon={Trash2} aria-label="Remove witness" className="mb-1 text-red" onClick={() => setWitnesses((ws) => ws.filter((_, j) => j !== i))} />
              </div>
              <Input className="mt-2" label="Phone or email" value={w.contact} onChange={setW(i, 'contact')} />
              <Textarea className="mt-2" label="What they saw" rows={2} value={w.statement} onChange={setW(i, 'statement')} />
            </div>
          ))}
          <Button variant="secondary" size="lg" icon={Plus} className="w-full" onClick={() => setWitnesses((ws) => [...ws, { name: '', contact: '', statement: '' }])}>Add witness</Button>
        </div>
      </Card>
    </div>
  );
}

function StepActions({ v, set, setV }) {
  const tog = (k) => (val) => setV((s) => ({ ...s, [k]: val }));
  return (
    <div className="space-y-3">
      <Card title="What did you do?" hint="Your actions and anyone else's: staff, police, paramedics.">
        <Textarea rows={4} value={v.actions_taken} onChange={set('actions_taken')} placeholder="Asked him to leave, escorted him out through the main door, informed the duty manager" />
      </Card>
      <Card>
        <Toggle checked={v.force_used} onChange={tog('force_used')} label="Force was used" hint="Any physical intervention or restraint" />
        {v.force_used && <Textarea className="mt-3" label="Why was force necessary?" rows={3} value={v.force_justification} onChange={set('force_justification')} placeholder="What the threat was, what you tried first, the technique used and for how long" />}
      </Card>
      <Card>
        <div className="flex items-center gap-3"><Siren size={20} className="shrink-0 text-blue" /><div className="flex-1"><Toggle checked={v.police_called} onChange={tog('police_called')} label="Police called" /></div></div>
        {v.police_called && <Input className="mt-3" label="Police reference (CAD or crime number)" value={v.police_ref} onChange={set('police_ref')} />}
      </Card>
      <Card>
        <div className="flex items-center gap-3"><Ambulance size={20} className="shrink-0 text-red" /><div className="flex-1"><Toggle checked={v.ambulance_called} onChange={tog('ambulance_called')} label="Ambulance called" /></div></div>
        {v.ambulance_called && <Input className="mt-3" label="Ambulance reference" value={v.ambulance_ref} onChange={set('ambulance_ref')} />}
      </Card>
    </div>
  );
}

function StepEvidence({ uploads, saved, setSaved, toast, notes, setNotes, draft }) {
  const cam = useRef(null);
  const lib = useRef(null);
  const doc = useRef(null);
  const confirm = useConfirm();
  const [drafting, setDrafting] = useState(false);
  const pick = (e) => { const files = [...(e.target.files || [])]; e.target.value = ''; if (files.length) uploads.add(files); };
  const removeSaved = async (a) => {
    if (!(await confirm({ title: `Remove ${a.name || 'this file'}?`, body: 'It is taken off the report. Managers can still see that it was removed.', confirm: 'Remove', danger: true }))) return;
    try {
      await api('incidents.removeAttachment', { id: a.id });
      setSaved((xs) => xs.filter((x) => x.id !== a.id));
    } catch (e) { toast(e.message, 'error'); }
  };
  const count = saved.length + uploads.items.filter((x) => x.status !== 'error').length;
  const canDraft = notes.trim().length > 0 || uploads.done.length > 0 || saved.length > 0;
  return (
    <div className="space-y-3">
      <Card title="Photos and files" hint="Damage, injuries (with consent), the scene, CCTV stills, statements. Never photograph children.">
        <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
        <input ref={lib} type="file" accept="image/*" multiple className="hidden" onChange={pick} />
        <input ref={doc} type="file" accept={DOC_ACCEPT} multiple className="hidden" onChange={pick} />
        <div className="grid grid-cols-3 gap-2">
          <Button size="lg" className="px-2" icon={Camera} onClick={() => cam.current?.click()} disabled={count >= MAX_FILES}>Camera</Button>
          <Button size="lg" className="px-2" variant="secondary" icon={ImagePlus} onClick={() => lib.current?.click()} disabled={count >= MAX_FILES}>Photos</Button>
          <Button size="lg" className="px-2" variant="secondary" icon={FilePlus} onClick={() => doc.current?.click()} disabled={count >= MAX_FILES}>File</Button>
        </div>
        {count > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {saved.map((a) => <FileTile key={a.id} {...a} badge="Saved" onRemove={a.can_remove === false ? null : () => removeSaved(a)} />)}
            {uploads.items.map((x) => <FileTile key={x.uid} {...x} onRemove={() => uploads.remove(x.uid)} />)}
          </div>
        )}
        <p className="mt-3 text-center text-footnote text-muted">{count ? `${count} of ${MAX_FILES} · up to 15 MB each` : 'Optional. Photos, PDF, Word or text files, up to 15 MB each.'}</p>
      </Card>
      <Card title="Rough notes" hint="Jot it down however it comes — times, what you saw, who did what. AI can turn it into the report.">
        <Textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="2340 red jacket male refused at bar, kicked off, pushed glass, cut on hand, first aid by Sam, escorted out main door…" />
        <Button size="lg" variant="secondary" icon={Sparkles} className="mt-3 w-full" disabled={!canDraft || uploads.uploading} onClick={() => setDrafting(true)}>
          {uploads.uploading ? 'Uploading…' : 'Draft the report with AI'}
        </Button>
        <p className="mt-2 text-center text-caption text-muted">You check every suggestion before it goes in. Or tap Next to write it yourself.</p>
      </Card>
      {drafting && <DraftSheet onClose={() => setDrafting(false)} notes={notes} keys={[...saved.map((a) => a.s3_key), ...uploads.done.map((x) => x.key)].filter(Boolean)} {...draft} />}
    </div>
  );
}

const DRAFT_FIELDS = [
  ['type', 'What happened'], ['severity', 'How serious'], ['description', 'Description'], ['location', 'Where'], ['people_involved', 'People involved'],
  ['injuries', 'Injuries'], ['actions_taken', 'What you did'], ['police_called', 'Police called'], ['ambulance_called', 'Ambulance called'],
];
const TEXT_FIELDS = ['description', 'location', 'people_involved', 'injuries', 'actions_taken'];
const show = (k, val) => {
  if (k === 'type') return typeLabel(val) || '—';
  if (k === 'severity') return SEVERITIES.find((s) => s.value === val)?.label || '—';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  return val || '—';
};

function DraftSheet({ onClose, notes, keys, v, setV, shiftId, at, incidentId, onAccept }) {
  const [st, setSt] = useState({ loading: true });
  const [done, setDone] = useState({}); // field -> 'accepted' | 'skipped'
  const [editing, setEditing] = useState({}); // field -> text
  useEffect(() => {
    let live = true;
    const current = Object.fromEntries(DRAFT_FIELDS.map(([k]) => [k, v[k]]).filter(([, x]) => x !== '' && x !== false));
    api('incidents.aiDraft', { keys, notes, shift_id: shiftId, occurred_at: at, incident_id: incidentId, current })
      .then((r) => live && setSt({ result: r }))
      .catch((e) => live && setSt({ error: e.message }));
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const sugg = st.result?.suggestions || {};
  const fields = DRAFT_FIELDS.filter(([k]) => sugg[k] && sugg[k].value !== v[k]);
  const accept = (k, value) => {
    setV((s) => ({ ...s, [k]: value }));
    setDone((d) => ({ ...d, [k]: 'accepted' }));
    setEditing((e) => { const { [k]: _, ...rest } = e; return rest; });
    onAccept();
  };
  const open = fields.filter(([k]) => !done[k]);
  const acceptAll = () => open.forEach(([k]) => accept(k, editing[k] ?? sugg[k].value));

  return (
    <Sheet open onClose={onClose} title="AI draft" size="lg"
      footer={st.result ? <>{open.length > 1 && <Button variant="secondary" onClick={acceptAll}>Accept all</Button>}<Button onClick={onClose}>Done</Button></> : <Button variant="secondary" onClick={onClose}>Close</Button>}>
      {st.loading && <div className="py-10 text-center"><Spinner className="py-4" /><p className="text-subhead text-muted">Reading your notes{keys.length ? ` and ${keys.length} file${keys.length > 1 ? 's' : ''}` : ''}…</p></div>}
      {st.error && (
        <div className="rounded-2xl bg-amber-soft px-4 py-3 text-subhead text-amber">
          <div className="font-bold">AI draft isn't available right now</div>
          <p>{st.error}. You can still write the report yourself — your files are kept.</p>
        </div>
      )}
      {st.result && (
        <div className="space-y-3">
          {st.result.questions?.length > 0 && (
            <div className="rounded-2xl bg-blue-soft px-4 py-3 text-subhead text-blue">
              <div className="mb-1 font-bold">Check these before you submit</div>
              <ul className="list-disc space-y-0.5 pl-5">{st.result.questions.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          )}
          {st.result.skipped?.length > 0 && <p className="text-footnote text-muted">Not read by AI: {st.result.skipped.join(', ')}</p>}
          {!fields.length && <p className="rounded-2xl bg-bg px-4 py-3 text-subhead text-muted">Nothing new to suggest — add more notes or photos, or carry on writing.</p>}
          {fields.map(([k, label]) => {
            const s = sugg[k];
            const state = done[k];
            const text = TEXT_FIELDS.includes(k);
            return (
              <section key={k} className={cx('rounded-2xl border p-3', state === 'accepted' ? 'border-green/40 bg-green-soft' : state === 'skipped' ? 'border-line opacity-60' : 'border-line')}>
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <h3 className="text-subhead font-bold">{label}</h3>
                  {s.source !== 'notes' && <span className="rounded-full bg-blue-soft px-2 py-0.5 text-caption2 font-semibold text-blue">{s.source === 'photo' ? 'Seen in photo' : 'Notes + photo'}</span>}
                  {state && <span className="ml-auto text-caption font-semibold text-muted">{state === 'accepted' ? 'Added' : 'Skipped'}</span>}
                </div>
                {v[k] !== '' && v[k] !== false && v[k] != null && <p className="mb-1 text-footnote text-muted"><span className="font-semibold">Now:</span> {show(k, v[k])}</p>}
                {editing[k] != null
                  ? <Textarea rows={k === 'description' ? 6 : 3} value={editing[k]} onChange={(e) => setEditing((x) => ({ ...x, [k]: e.target.value }))} />
                  : <p className="whitespace-pre-line text-body">{show(k, s.value)}</p>}
                {!state && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button size="sm" icon={Check} onClick={() => accept(k, editing[k] ?? s.value)}>Accept</Button>
                    {text && editing[k] == null && <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setEditing((x) => ({ ...x, [k]: s.value }))}>Edit</Button>}
                    <Button size="sm" variant="ghost" onClick={() => setDone((d) => ({ ...d, [k]: 'skipped' }))}>Skip</Button>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </Sheet>
  );
}

function StepReview({ v, at, venueName, existing, witnesses, files, saved, aiAssisted, problems, goTo }) {
  const yn = (b, ref) => (b ? `Yes${ref ? ` (ref ${ref})` : ''}` : 'No');
  const sev = SEVERITIES.find((s) => s.value === v.severity);
  const Edit = ({ n }) => <Button variant="link" onClick={() => goTo(n)}>Edit</Button>;
  return (
    <div className="space-y-3">
      {problems.length > 0 && (
        <div className="rounded-2xl bg-red-soft px-4 py-3 text-subhead font-semibold text-red"><ul className="space-y-0.5">{problems.map((p) => <li key={p}>{p}</li>)}</ul></div>
      )}
      <ReviewCard title="What" action={<Edit n={1} />}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-headline font-bold">{typeLabel(v.type) || 'Not chosen'}</span>
          {sev && <span className={cx('rounded-full border px-2.5 py-0.5 text-caption font-bold', SEV_STYLE[v.severity])}>{sev.label}</span>}
        </div>
        <p className="mt-2 whitespace-pre-line text-body">{v.description || <span className="text-faint">No description</span>}</p>
      </ReviewCard>
      <ReviewCard title="When and where" action={<Edit n={2} />}>
        {at && Date.now() - Date.parse(at) > DAY && (
          <Pill tone="amber" className="mb-2">Reported later · {Math.floor((Date.now() - Date.parse(at)) / DAY)} day{Date.now() - Date.parse(at) >= 2 * DAY ? 's' : ''} after</Pill>
        )}
        <KV items={[['Time', at && dateTime(at)], ['Venue', venueName], ['Location', v.location]]} />
      </ReviewCard>
      <ReviewCard title="People" action={<Edit n={3} />}>
        <KV items={[['People involved', v.people_involved], ['Injuries', v.injuries || 'None'], ['Witnesses', witnesses.filter((w) => w.name.trim()).map((w) => w.name).join(', ') || 'None']]} />
      </ReviewCard>
      <ReviewCard title="Actions" action={<Edit n={4} />}>
        <KV items={[['Actions taken', v.actions_taken], ['Force used', yn(v.force_used)], v.force_used && ['Justification', v.force_justification], ['Police', yn(v.police_called, v.police_ref)], ['Ambulance', yn(v.ambulance_called, v.ambulance_ref)]]} />
      </ReviewCard>
      <ReviewCard title="Photos and files" action={<Edit n={0} />}>
        <div className="flex items-center gap-2 text-body">{files + saved} attached{files && existing ? ` (${files} new)` : ''}</div>
        {aiAssisted && <p className="mt-1 flex items-center gap-1.5 text-footnote text-muted"><Sparkles size={14} className="text-blue" />Some wording was drafted with AI and checked by you.</p>}
      </ReviewCard>
      <p className="px-1 text-footnote text-muted">By submitting you confirm this is a true and accurate account. Every change is kept in the report history.</p>
    </div>
  );
}

function ReviewCard({ title, action, children }) {
  return (
    <section className="rounded-tile bg-surface p-4 shadow-tile">
      <div className="mb-2 flex items-center justify-between"><h3 className="text-footnote font-semibold uppercase tracking-wide text-muted">{title}</h3>{action}</div>
      {children}
    </section>
  );
}
