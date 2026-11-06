import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, Ambulance, Baby, Ban, Camera, Check, CheckCircle2, ChevronLeft, ChevronRight, CircleHelp, Cloud, CloudOff, DoorOpen, FilePlus, Flame, Hammer, Hand, HeartPulse,
  ImagePlus, MessageSquareWarning, Pencil, Pill as PillIcon, Plus, Save, ShieldAlert, ShoppingBag, Siren, Sparkles, Swords, UserRoundX, X,
} from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Button, cx, dateTime, dayLabel, Empty, fromLocalInput, Input, KV, Load, Page, Pill, Pressable, range, relative, Segmented, Select, Sheet, Spinner, Textarea, time, toLocalInput,
  useAction, useApi, useConfirm, useKeyboardOpen, useToast, YesNo,
} from '../../ui/index.jsx';
import { Lightbox } from '../../ui/Lightbox.jsx';
import { INCIDENT_TYPES, NotLinked, Progress, SEVERITIES, typeLabel } from './_parts.jsx';
import { DOC_ACCEPT, FileTile, isImage, MAX_FILES, useUploads } from '../shared/evidence.jsx';
import { readLocal, useIncidentDraft } from './_draft.js';

const TYPE_ICON = {
  ejection: DoorOpen, refused_entry: Ban, assault: Swords, theft: ShoppingBag, drugs: PillIcon, weapon: ShieldAlert, medical: HeartPulse,
  damage: Hammer, fire: Flame, disorder: MessageSquareWarning, lost_child: Baby, vulnerable_person: UserRoundX, other: CircleHelp,
};
const SEV_STYLE = {
  low: 'border-line bg-surface text-ink', medium: 'border-amber/40 bg-amber-soft text-amber', high: 'border-red/40 bg-red-soft text-red', critical: 'border-red bg-red text-white',
};
const SEV_DOT = { low: 'bg-faint', medium: 'bg-amber', high: 'bg-red', critical: 'bg-red' };
// One chosen look for every picker on the form: type, severity and shift
const pickCls = (on) => cx('rounded-2xl border-2 transition-colors', on ? 'border-blue bg-blue-soft text-blue' : 'border-transparent bg-bg text-ink');
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
  if (!id && user.role !== 'officer' && !pathname.startsWith('/officer')) return <DraftLoader manager />;
  if (!user.officer_id) return <Page title="Report incident"><NotLinked /></Page>;
  return id ? <EditLoader id={id} /> : <DraftLoader />;
}

// A new report opens its draft (?draft=), or the copy kept on this phone; opening from a shift that already has a draft asks which to use
function DraftLoader({ manager }) {
  const { user } = useAuth();
  const base = manager ? `/${user.role}` : '/officer';
  const [sp, setSp] = useSearchParams();
  const urlDraft = sp.get('draft');
  const [draftId, setDraftId] = useState(urlDraft);
  const created = useRef(new Set());
  // A reminder link to another draft while the form is open
  useEffect(() => { if (urlDraft && urlDraft !== draftId && !created.current.has(urlDraft)) setDraftId(urlDraft); }, [urlDraft]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = useApi('incidents.draftGet', { id: draftId }, { skip: !draftId });
  const shiftParam = sp.get('shift');
  const others = useApi('incidents.drafts', {}, { skip: !!draftId || !shiftParam || manager });
  const same = !draftId && (others.data || []).find((d) => !d.manager && d.shift_id === shiftParam);
  const [fresh, setFresh] = useState(false);
  const onCreated = useCallback((nid) => {
    created.current.add(nid);
    setSp((cur) => { const n = new URLSearchParams(cur); n.set('draft', nid); return n; }, { replace: true });
  }, [setSp]);

  if (draftId && q.error) {
    return (
      <Page title="Report incident" back={{ to: `${base}/incidents`, label: 'Incidents' }}>
        <Empty icon={ShieldAlert} title="This draft is no longer here" body="It was sent as a report, deleted, or removed after 30 days without changes."
          action={<Button icon={Plus} onClick={() => { setSp(new URLSearchParams(), { replace: true }); setDraftId(null); }}>Start a new report</Button>} />
      </Page>
    );
  }
  // Officers start a report from the shift card; drafts (and this phone's copy of one) still open here
  if (!manager && !draftId && !shiftParam && !readLocal(null)?.snapshot?.data?.shift_id) {
    return (
      <Page title="Report incident" back={{ to: '/officer/incidents', label: 'Reports' }}>
        <Empty icon={ShieldAlert} title="Reports start from the shift" body="Open the shift the incident happened on and tap Report incident. On shift now? It's on your Home screen. For an earlier shift, find it under Shifts."
          action={<Button to="/officer/shifts?tab=mine">Open my shifts</Button>} />
      </Page>
    );
  }
  if ((draftId && !q.data) || (!draftId && shiftParam && !manager && others.loading)) return <Page title="Report incident"><Spinner className="py-16" /></Page>;
  // The server copy, unless this phone holds newer changes that never reached it
  let initial = null;
  if (draftId) {
    const local = readLocal(draftId);
    const d = q.data;
    initial = local && local.at > Date.parse(d.updated_at) ? { ...d, ...local.snapshot, unsynced: true } : d;
  } else if (!fresh) {
    const local = readLocal(null);
    const snapShift = local?.snapshot?.data?.shift_id || null;
    if (local && !!local.snapshot?.data?.manager === !!manager && (!shiftParam || snapShift === shiftParam)) initial = { ...local.snapshot, unsynced: true };
  }
  return (
    <>
      <Wizard key={draftId || 'new'} manager={manager} initial={initial} draftId={draftId} onCreated={onCreated} />
      <Sheet open={!!same && !fresh} onClose={() => setFresh(true)} title="You have a draft for this shift" size="sm"
        footer={<><Button variant="secondary" onClick={() => setFresh(true)}>Start a new report</Button><Button onClick={() => { setDraftId(same.id); setSp((cur) => { const n = new URLSearchParams(cur); n.set('draft', same.id); return n; }, { replace: true }); }}>Carry on with your draft</Button></>}>
        {same && (
          <p className="text-body">
            {typeLabel(same.type) || 'An untitled report'}{same.venue_name ? ` at ${same.venue_name}` : ''}, saved {relative(same.updated_at)}. {same.progress.done} of {same.progress.total} parts written.
          </p>
        )}
      </Sheet>
    </>
  );
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

function Wizard({ existing, manager, initial, draftId, onCreated }) {
  const nav = useNavigate();
  const { user } = useAuth();
  const base = manager ? `/${user.role}` : '/officer';
  const toast = useToast();
  const edit = !!existing;
  const d0 = initial?.data || {};
  const [step, setStep] = useState(() => Math.min(initial?.step || 0, STEPS.length - 1));
  const [seen, setSeen] = useState(() => new Set(Array.from({ length: (initial?.step || 0) + 1 }, (_, i) => i)));
  const [v, setV] = useState(() => (edit
    ? { ...BLANK, ...Object.fromEntries(Object.keys(BLANK).map((k) => [k, existing[k] ?? BLANK[k]])), occurred_at: toLocalInput(existing.occurred_at) }
    : { ...BLANK, occurred_at: toLocalInput(new Date()), ...Object.fromEntries(Object.keys(BLANK).filter((k) => d0[k] != null).map((k) => [k, d0[k]])) }));
  const [witnesses, setWitnesses] = useState(() => (existing?.witnesses || d0.witnesses || []).map(({ name, contact, statement }) => ({ name, contact: contact || '', statement: statement || '' })));
  const [saved, setSaved] = useState(existing?.attachments || []);
  // Files uploaded into the draft earlier: they join the report when it is sent
  const [draftFiles, setDraftFiles] = useState(() => initial?.attachments || []);
  const uploads = useUploads({ existingCount: saved.length + draftFiles.length, toast });
  const [notes, setNotes] = useState(d0.notes || '');
  const [aiAssisted, setAiAssisted] = useState(!!(existing?.ai_assisted || d0.ai_assisted));
  // From the shift page: ?shift= picks the shift, ?entry= links the report to a shift log entry and starts from its words
  const [sp] = useSearchParams();
  const entryId = edit ? null : sp.get('entry');
  const [shiftId, setShiftId] = useState(() => (edit ? null : d0.shift_id || sp.get('shift')));
  const fromLog = useApi('shifts.detail', { id: sp.get('shift') }, { skip: !entryId || !sp.get('shift') });
  useEffect(() => {
    const e = fromLog.data?.entries.find((x) => x.id === entryId);
    if (e?.body) setNotes((n) => n || e.body);
  }, [fromLog.data, entryId]);
  const [run, busy] = useAction();
  const top = useRef(null);
  const keyboard = useKeyboardOpen();

  // Shifts the officer could be reporting from: tonight's, or any they worked in the last 30 days
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
  useEffect(() => {
    if (shift && !recent.includes(shift)) { setWhen('earlier'); pickShift(shift); }
  }, [shift, recent]); // eslint-disable-line react-hooks/exhaustive-deps
  // Manager mode: venue, an optional shift that day and an optional officer
  const [m, setM] = useState(() => ({ venue_id: '', shift_id: '', officer_id: '', ...(d0.manager || {}) }));
  const venuesQ = useApi('venues.list', {}, { skip: !manager });
  const venueName = manager ? venuesQ.data?.find((x) => x.id === m.venue_id)?.name : shift?.venue_name || existing?.venue_name || initial?.venue_name;

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

  // Each problem points at the step that fixes it
  const problems = [
    [!v.type || !v.severity ? 'Choose what happened and how serious it was' : null, 1],
    [!v.description.trim() ? 'Describe what happened' : null, 1],
    [!at ? 'Add the time it happened' : future ? 'The time cannot be in the future' : null, 2],
    [!edit && !manager && !shift ? 'Choose the shift you were working' : null, 2],
    [manager && !m.venue_id ? 'Choose the venue' : null, 2],
    [outsideShift ? 'The time must be within 2 hours of your shift' : null, 2],
    [tooOld ? `Officers can report up to ${BACKDATE_DAYS} days back. Ask the office for anything older.` : null, 2],
    [v.force_used && !v.force_justification.trim() ? 'Explain why force was necessary' : null, 4],
    [uploads.uploading ? 'Wait for your files to finish uploading' : null, 0],
  ].filter(([t]) => t);

  const stepOk = [
    !uploads.uploading,
    v.type && v.severity && v.description.trim().length > 0,
    at && !future && (edit || (manager ? m.venue_id : shift && !outsideShift && !tooOld)),
    true,
    !v.force_used || v.force_justification.trim(),
    !problems.length,
  ].map(Boolean);
  const canNext = stepOk[step];

  // Drafts: new reports save as they are written, once there is something worth keeping
  const files = [...draftFiles.map(({ key, mime, name }) => ({ key, mime, name })), ...uploads.attachments];
  const meaningful = !!(v.type || v.description.trim() || v.location.trim() || v.people_involved.trim() || v.actions_taken.trim() || notes.trim() || witnesses.length || files.length);
  const draft = useIncidentDraft({ id: draftId, version: initial?.version, enabled: !edit, onCreated });
  const snapshot = {
    data: { ...v, witnesses, notes, ai_assisted: aiAssisted, when, ...(manager ? { manager: m } : { shift_id: shiftId || '' }) },
    attachments: files, step,
  };
  const snapKey = JSON.stringify(snapshot);
  const first = useRef(!initial?.unsynced);
  useEffect(() => {
    if (edit || !meaningful) return;
    // Opening a saved draft is not a change; a phone copy that never synced is sent straight away
    if (first.current) { first.current = false; if (initial) return; }
    draft.save(snapshot);
  }, [snapKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (n) => {
    setStep(n);
    setSeen((x) => new Set([...x, n]));
    draft.flush();
    top.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const close = async () => {
    if (!edit && meaningful) { await draft.flush(); toast('Draft saved. Finish it from Incidents.'); }
    nav(edit ? `/officer/incidents/${existing.id}` : `${base}/incidents`);
  };

  const submit = () => run(async () => {
    const attachments = files;
    const body = {
      ...v, occurred_at: at, ai_assisted: aiAssisted,
      force_justification: v.force_used ? v.force_justification : '', police_ref: v.police_called ? v.police_ref : '', ambulance_ref: v.ambulance_called ? v.ambulance_ref : '',
      witnesses: witnesses.filter((w) => w.name.trim()),
    };
    if (edit) {
      await api('incidents.update', { id: existing.id, ...body });
      if (uploads.attachments.length) await api('incidents.addAttachments', { id: existing.id, attachments: uploads.attachments });
      return existing;
    }
    // Any save still queued is dropped: the report replaces the draft
    await draft.flush();
    const draft_id = draft.id || undefined;
    const inc = manager
      ? await api('incidents.create', { ...body, venue_id: m.venue_id, shift_id: m.shift_id || undefined, officer_id: m.officer_id || undefined, attachments, draft_id })
      : await api('incidents.create', { ...body, shift_id: shift.id, venue_id: shift.venue_id, attachments, log_entry_id: entryId || undefined, draft_id });
    draft.stop();
    return inc;
  }, edit ? 'Report updated and resubmitted' : 'Incident reported').then((inc) => nav(`${base}/incidents/${inc.id}`, { replace: true })).catch(() => {});

  const back = edit ? { to: `/officer/incidents/${existing.id}`, label: existing.ref } : { to: `${base}/incidents`, label: 'Incidents' };
  const stepState = (i) => (i === step ? 'current' : !seen.has(i) ? '' : stepOk[i] ? 'done' : 'missing');

  return (
    <Page title={edit ? `Edit ${existing.ref}` : 'Report incident'} back={back} wide>
      <div ref={top} className="-mt-2 mb-4 lg:hidden">
        <StepChips step={step} state={stepState} onPick={go} />
        <Progress value={step + 1} max={STEPS.length} />
        {!edit && <SaveStatus draft={draft} meaningful={meaningful} onClose={close} />}
      </div>

      {draft.status === 'conflict' && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl bg-amber-soft px-4 py-3 text-amber">
          <AlertTriangle size={18} className="shrink-0" />
          <div className="min-w-0 flex-1 text-subhead font-semibold">This draft was updated on another device. Reload to carry on from the newest copy.</div>
          <Button size="sm" variant="secondary" onClick={() => window.location.reload()}>Reload</Button>
        </div>
      )}
      {edit && existing.review_comment && existing.status === 'changes_requested' && (
        <div className="mb-3 flex gap-2.5 rounded-2xl bg-amber-soft px-4 py-3 text-amber">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div><div className="text-subhead font-bold">{existing.reviewed_by_name || 'Your manager'} asked for changes</div><p className="whitespace-pre-line text-subhead">{existing.review_comment}</p></div>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[240px_minmax(0,1fr)] lg:items-start lg:gap-8">
        <aside className="sticky top-20 hidden lg:block">
          <nav aria-label="Report steps" className="space-y-1">
            {STEPS.map((t, i) => (
              <Pressable key={t} onClick={() => go(i)} aria-current={i === step ? 'step' : undefined}
                className={cx('flex min-h-11 items-center gap-3 rounded-xl px-3 text-body', i === step ? 'bg-blue-soft font-semibold text-blue' : 'text-ink')}>
                <StepMark n={i + 1} state={stepState(i)} />{t}
              </Pressable>
            ))}
          </nav>
          {!edit && <div className="mt-3 px-3"><SaveStatus draft={draft} meaningful={meaningful} onClose={close} /></div>}
        </aside>

        <div className="mx-auto w-full max-w-2xl lg:mx-0">
          <div key={step} className="space-y-5" style={{ animation: 'fade .2s' }}>
            {step === 0 && (
              <StepEvidence uploads={uploads} saved={saved} setSaved={setSaved} draftFiles={draftFiles} setDraftFiles={setDraftFiles} toast={toast} notes={notes} setNotes={setNotes}
                draft={{ v, setV, shiftId: manager ? m.shift_id || null : shiftId, at, incidentId: existing?.id, onAccept: () => setAiAssisted(true) }} />
            )}
            {step === 1 && <StepWhat v={v} setV={setV} set={set} />}
            {step === 2 && (manager
              ? <ManagerWhen v={v} set={set} m={m} setM={setM} at={at} future={future} venues={venuesQ} />
              : <StepWhen v={v} set={set} edit={edit} existing={existing} shifts={shifts} recent={recent} when={when} setWhen={setWhen} shift={shift}
                loading={shiftsQ.loading} shiftId={shiftId} pickShift={pickShift} future={future} outsideShift={outsideShift} tooOld={tooOld} locked={locked} />)}
            {step === 3 && <StepPeople v={v} set={set} witnesses={witnesses} setWitnesses={setWitnesses} />}
            {step === 4 && <StepActions v={v} set={set} setV={setV} />}
            {step === 5 && <StepReview v={v} at={at} venueName={venueName} existing={existing} witnesses={witnesses} files={uploads.done.length + draftFiles.length} saved={saved.length} aiAssisted={aiAssisted} problems={problems} goTo={go} />}
          </div>

          {/* The same two buttons on every step; they step aside while the keyboard is up */}
          <div className={cx('sticky bottom-[calc(var(--tabbar-h)+12px)] z-10 mt-6 flex gap-3 rounded-tile bg-bg/90 py-2 backdrop-blur lg:bottom-4', keyboard && 'hidden')}>
            {step > 0
              ? <Button size="lg" variant="secondary" className="flex-1" icon={ChevronLeft} onClick={() => go(step - 1)} disabled={busy}>Back</Button>
              : <Button size="lg" variant="secondary" className="flex-1" icon={edit || !meaningful ? X : Save} onClick={close} disabled={busy}>{edit || !meaningful ? 'Close' : 'Save and close'}</Button>}
            {step < STEPS.length - 1
              ? <Button size="lg" className="flex-1" disabled={!canNext} iconRight={ChevronRight} onClick={() => go(step + 1)}>Next</Button>
              : <Button size="lg" className="flex-1" busy={busy} disabled={!canNext} onClick={submit}>{edit ? 'Resubmit' : 'Submit report'}</Button>}
          </div>
        </div>
      </div>
    </Page>
  );
}

function StepMark({ n, state }) {
  if (state === 'done') return <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-green text-white"><Check size={14} aria-label="Done" /></span>;
  return (
    <span className={cx('relative grid h-6 w-6 shrink-0 place-items-center rounded-full text-caption font-bold', state === 'current' ? 'bg-blue text-white' : 'bg-fill text-muted')}>
      {n}{state === 'missing' && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-amber ring-2 ring-surface" aria-label="Something missing" />}
    </span>
  );
}

// Phones: the steps as a row of chips; tap any to jump there
function StepChips({ step, state, onPick }) {
  const row = useRef(null);
  useEffect(() => { row.current?.querySelector('[aria-current="step"]')?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }, [step]);
  return (
    <nav ref={row} aria-label="Report steps" className="no-scrollbar -mx-4 mb-2.5 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4">
      {STEPS.map((t, i) => (
        <Pressable press key={t} onClick={() => onPick(i)} aria-current={i === step ? 'step' : undefined}
          className={cx('flex h-11 shrink-0 snap-start items-center gap-2 rounded-full pl-1.5 pr-3.5 text-subhead font-semibold', i === step ? 'bg-blue-soft text-blue' : 'bg-surface text-ink')}>
          <StepMark n={i + 1} state={state(i)} />{t}
        </Pressable>
      ))}
    </nav>
  );
}

const SAVE_TEXT = { saving: 'Saving…', offline: 'Saved on this phone, will sync', error: 'Couldn’t save, trying again', conflict: 'Not saved' };
function SaveStatus({ draft, meaningful, onClose }) {
  const text = draft.status === 'saved' && draft.savedAt ? `Draft saved ${time(draft.savedAt)}` : SAVE_TEXT[draft.status] || (meaningful ? 'Saving as you go' : 'Your draft saves as you write');
  return (
    <div className="mt-2 flex items-center justify-between gap-3 text-footnote lg:flex-col lg:items-start lg:gap-1">
      <span aria-live="polite" className={cx('inline-flex items-center gap-1.5', draft.status === 'offline' || draft.status === 'error' ? 'text-amber' : 'text-muted')}>
        {draft.status === 'offline' ? <CloudOff size={14} aria-hidden /> : draft.status === 'saved' ? <CheckCircle2 size={14} aria-hidden /> : <Cloud size={14} aria-hidden />}{text}
      </span>
      {meaningful && <Button variant="link" onClick={onClose}>Save and close</Button>}
    </div>
  );
}

function Card({ title, hint, children }) {
  return (
    <section className="rounded-tile bg-surface p-5 shadow-tile">
      {title && <h2 className="text-title3 font-bold">{title}</h2>}
      {hint && <p className="mt-1 text-subhead text-muted">{hint}</p>}
      <div className={cx(title && 'mt-4')}>{children}</div>
    </section>
  );
}

function StepWhat({ v, setV, set }) {
  return (
    <>
      <Card title="What happened?">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {INCIDENT_TYPES.map((t) => {
            const I = TYPE_ICON[t.value];
            const on = v.type === t.value;
            return (
              <Pressable press key={t.value} onClick={() => setV((s) => ({ ...s, type: t.value }))} aria-pressed={on}
                className={cx('flex min-h-[92px] flex-col items-center justify-center gap-2 px-1 py-2.5 text-center text-footnote font-semibold leading-tight', pickCls(on))}>
                <I size={24} />{t.label}
              </Pressable>
            );
          })}
        </div>
      </Card>
      <Card title="How serious?">
        <div className="grid grid-cols-2 gap-2">
          {SEVERITIES.map((s) => {
            const on = v.severity === s.value;
            return (
              <Pressable press key={s.value} onClick={() => setV((x) => ({ ...x, severity: s.value }))} aria-pressed={on} className={cx('px-3.5 py-3', pickCls(on))}>
                <div className="flex items-center gap-2 text-callout font-bold"><span className={cx('h-2.5 w-2.5 rounded-full', SEV_DOT[s.value])} aria-hidden />{s.label}{on && <Check size={18} className="ml-auto" aria-hidden />}</div>
                <div className={cx('mt-0.5 text-caption', on ? 'opacity-85' : 'text-muted')}>{s.hint}</div>
              </Pressable>
            );
          })}
        </div>
        {(v.severity === 'high' || v.severity === 'critical') && (
          <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-amber-soft px-4 py-3 text-subhead font-semibold text-amber"><AlertTriangle size={18} className="shrink-0" aria-hidden />Managers and the venue are alerted straight away.</div>
        )}
      </Card>
      <Card title="Describe what happened" hint="Facts in order: what you saw, heard and did. Who, what, where.">
        <Textarea autoGrow minRows={8} value={v.description} onChange={set('description')} placeholder="At about 23:40 a male in a red jacket was refused service at the main bar…" />
      </Card>
    </>
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

function StepWhen({ v, set, edit, existing, shifts, recent, when, setWhen, shift, loading, shiftId, pickShift, future, outsideShift, tooOld, locked }) {
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
        <Input className="min-w-0 flex-1" type="datetime-local" value={v.occurred_at} min={lim.min} max={lim.max} onChange={set('occurred_at')} />
        {!earlier && <Button variant="secondary" onClick={() => set('occurred_at')(toLocalInput(new Date()))}>Now</Button>}
      </div>
      {future && <p className="mt-2 text-footnote font-semibold text-red">The time cannot be in the future.</p>}
      {outsideShift && <p className="mt-2 text-footnote font-semibold text-red">This is more than 2 hours outside the shift you picked.</p>}
      {tooOld && <p className="mt-2 text-footnote font-semibold text-red">You can report up to {BACKDATE_DAYS} days back. Ask the office to file anything older.</p>}
    </Card>
  );
  const shiftCard = (
    <Card key="shift" title={locked ? 'Shift' : earlier ? 'Which shift was it?' : 'Which shift?'} hint={edit || locked ? undefined : earlier ? `Shifts you worked in the last ${BACKDATE_DAYS} days.` : 'Incidents are filed against the venue you were working at.'}>
      {edit ? (
        <div className="rounded-2xl bg-bg px-4 py-3 text-body font-semibold">{existing.venue_name}</div>
      ) : locked && shift ? (
        <div className="rounded-2xl bg-bg px-4 py-3"><div className="truncate text-body font-semibold">{shift.venue_name}</div><div className="num text-footnote text-muted">{dayLabel(shift.starts_at)} · {range(shift.starts_at, shift.ends_at)}</div></div>
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
    <>
      {!edit && !locked && (
        <Segmented full value={when} onChange={choose} options={[{ value: 'now', label: 'Tonight / just now' }, { value: 'earlier', label: 'Earlier' }]} />
      )}
      {earlier ? [shiftCard, timeCard] : [timeCard, shiftCard]}
      <Card title="Where exactly?">
        <Input value={v.location} onChange={set('location')} placeholder="e.g. Main entrance, smoking area, upstairs bar" />
      </Card>
    </>
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
    <>
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
    </>
  );
}

function StepPeople({ v, set, witnesses, setWitnesses }) {
  const setW = (i, k) => (e) => setWitnesses((ws) => ws.map((w, j) => (j === i ? { ...w, [k]: e.target.value } : w)));
  return (
    <>
      <Card title="People involved" hint="Names if known, or descriptions: age, clothing, build.">
        <Textarea autoGrow minRows={4} value={v.people_involved} onChange={set('people_involved')} placeholder="White male, about 30, red jacket, dark jeans" />
      </Card>
      <Card title="Injuries" hint="Anyone hurt, including you. Leave blank if none.">
        <Textarea autoGrow minRows={3} value={v.injuries} onChange={set('injuries')} placeholder="Cut above left eye, treated by first aider" />
      </Card>
      <Card title="Witnesses">
        <div className="space-y-3">
          {witnesses.map((w, i) => (
            <div key={i} className="space-y-3 rounded-2xl bg-bg p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-subhead font-semibold text-muted">Witness {i + 1}</span>
                <Button variant="secondary" size="sm" onClick={() => setWitnesses((ws) => ws.filter((_, j) => j !== i))}>Remove</Button>
              </div>
              <Input label="Name" value={w.name} onChange={setW(i, 'name')} autoComplete="off" />
              <Input label="Phone or email" value={w.contact} onChange={setW(i, 'contact')} autoComplete="off" />
              <Textarea label="What they saw" autoGrow minRows={3} value={w.statement} onChange={setW(i, 'statement')} />
            </div>
          ))}
          <Button variant="secondary" size="lg" icon={Plus} className="w-full" onClick={() => setWitnesses((ws) => [...ws, { name: '', contact: '', statement: '' }])}>Add witness</Button>
        </div>
      </Card>
    </>
  );
}

function StepActions({ v, set, setV }) {
  const tog = (k) => (val) => setV((s) => ({ ...s, [k]: val }));
  const more = (on, node) => on && <div className="mt-4" style={{ animation: 'fade .2s' }}>{node}</div>;
  return (
    <>
      <Card title="What did you do?" hint="Your actions and anyone else's: staff, police, paramedics.">
        <Textarea autoGrow minRows={5} value={v.actions_taken} onChange={set('actions_taken')} placeholder="Asked him to leave, escorted him out through the main door, informed the duty manager" />
      </Card>
      <Card>
        <div className="space-y-6">
          <div>
            <YesNo label="Was force used?" hint="Any physical intervention or restraint" icon={Hand} value={v.force_used} onChange={tog('force_used')} danger />
            {more(v.force_used, <Textarea label="Why was force necessary?" autoGrow minRows={4} value={v.force_justification} onChange={set('force_justification')} placeholder="What the threat was, what you tried first, the technique used and for how long" />)}
          </div>
          <div>
            <YesNo label="Were the police called?" icon={Siren} value={v.police_called} onChange={tog('police_called')} />
            {more(v.police_called, <Input label="Police reference (CAD or crime number)" value={v.police_ref} onChange={set('police_ref')} />)}
          </div>
          <div>
            <YesNo label="Was an ambulance called?" icon={Ambulance} value={v.ambulance_called} onChange={tog('ambulance_called')} />
            {more(v.ambulance_called, <Input label="Ambulance reference" value={v.ambulance_ref} onChange={set('ambulance_ref')} />)}
          </div>
        </div>
      </Card>
    </>
  );
}

function StepEvidence({ uploads, saved, setSaved, draftFiles, setDraftFiles, toast, notes, setNotes, draft }) {
  const cam = useRef(null);
  const lib = useRef(null);
  const doc = useRef(null);
  const confirm = useConfirm();
  const [drafting, setDrafting] = useState(false);
  const [view, setView] = useState(null);
  const pick = (e) => { const files = [...(e.target.files || [])]; e.target.value = ''; if (files.length) uploads.add(files); };
  const removeSaved = async (a) => {
    if (!(await confirm({ title: `Remove ${a.name || 'this file'}?`, body: 'It is taken off the report. Managers can still see that it was removed.', confirm: 'Remove', danger: true }))) return;
    try {
      await api('incidents.removeAttachment', { id: a.id });
      setSaved((xs) => xs.filter((x) => x.id !== a.id));
    } catch (e) { toast(e.message, 'error'); }
  };
  const count = saved.length + draftFiles.length + uploads.items.filter((x) => x.status !== 'error').length;
  const canDraft = notes.trim().length > 0 || uploads.done.length > 0 || saved.length > 0 || draftFiles.length > 0;
  // Every photo opens full size, swiping between them
  const tiles = [
    ...saved.map((a) => ({ id: a.id, name: a.name, mime: a.mime, url: a.url, badge: 'Saved', onRemove: a.can_remove === false ? null : () => removeSaved(a) })),
    ...draftFiles.map((a) => ({ id: a.key, name: a.name, mime: a.mime, url: a.url, onRemove: () => setDraftFiles((xs) => xs.filter((x) => x.key !== a.key)) })),
    ...uploads.items.map((x) => ({ ...x, id: x.uid, onRemove: () => uploads.remove(x.uid) })),
  ];
  const photos = tiles.filter((t) => isImage(t.mime) && t.url);
  return (
    <>
      <Card title="Photos and files" hint="Damage, injuries (with consent), the scene, CCTV stills, statements. Never photograph children.">
        <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={pick} />
        <input ref={lib} type="file" accept="image/*" multiple className="hidden" onChange={pick} />
        <input ref={doc} type="file" accept={DOC_ACCEPT} multiple className="hidden" onChange={pick} />
        <div className="grid grid-cols-3 gap-2">
          <Button size="lg" className="px-2" variant={count ? 'secondary' : 'primary'} icon={Camera} onClick={() => cam.current?.click()} disabled={count >= MAX_FILES}>Camera</Button>
          <Button size="lg" className="px-2" variant="secondary" icon={ImagePlus} onClick={() => lib.current?.click()} disabled={count >= MAX_FILES}>Photos</Button>
          <Button size="lg" className="px-2" variant="secondary" icon={FilePlus} onClick={() => doc.current?.click()} disabled={count >= MAX_FILES}>File</Button>
        </div>
        {count > 0 && (
          <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {tiles.map(({ id, ...t }) => {
              const i = photos.findIndex((p) => p.id === id);
              return <FileTile key={id} {...t} onOpen={i >= 0 ? () => setView(i) : undefined} />;
            })}
          </div>
        )}
        <p className="mt-3 text-center text-footnote text-muted">{count ? `${count} of ${MAX_FILES} · up to 15 MB each` : 'Optional. Photos, PDF, Word or text files, up to 15 MB each.'}</p>
      </Card>
      <Card title="Rough notes" hint="Jot it down however it comes — times, what you saw, who did what. AI can turn it into the report.">
        <Textarea autoGrow minRows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="2340 red jacket male refused at bar, kicked off, pushed glass, cut on hand, first aid by Sam, escorted out main door…" />
        <Button size="lg" variant="secondary" icon={Sparkles} className="mt-3 w-full" disabled={!canDraft || uploads.uploading} onClick={() => setDrafting(true)}>
          {uploads.uploading ? 'Uploading…' : 'Draft the report with AI'}
        </Button>
        <p className="mt-2 text-center text-caption text-muted">You check every suggestion before it goes in. Or tap Next to write it yourself.</p>
      </Card>
      {drafting && <DraftSheet onClose={() => setDrafting(false)} notes={notes} keys={[...saved.map((a) => a.s3_key), ...draftFiles.map((a) => a.key), ...uploads.done.map((x) => x.key)].filter(Boolean)} {...draft} />}
      <Lightbox photos={photos.map((p) => ({ url: p.url, name: p.name }))} index={view} onClose={() => setView(null)} />
    </>
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
    <>
      {problems.length > 0 && (
        <section className="overflow-hidden rounded-tile bg-amber-soft text-amber" aria-label="Still to do">
          <div className="px-5 pb-1 pt-4 text-subhead font-bold">Still to do before you can send it</div>
          {problems.map(([p, n]) => (
            <Pressable key={p} onClick={() => goTo(n)} className="flex min-h-12 items-center gap-3 px-5 text-subhead font-semibold">
              <AlertTriangle size={16} className="shrink-0" aria-hidden /><span className="flex-1">{p}</span><ChevronRight size={18} className="shrink-0" aria-hidden />
            </Pressable>
          ))}
        </section>
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
    </>
  );
}

function ReviewCard({ title, action, children }) {
  return (
    <section className="rounded-tile bg-surface p-5 shadow-tile">
      <div className="mb-2 flex items-center justify-between"><h3 className="text-footnote font-semibold uppercase tracking-wide text-muted">{title}</h3>{action}</div>
      {children}
    </section>
  );
}
