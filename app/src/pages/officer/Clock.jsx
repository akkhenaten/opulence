import { useEffect, useId, useRef, useState } from 'react';
import {
  AlertTriangle, CameraOff, CheckCircle2, Coffee, Crosshair, Info, LocateFixed, LogIn, LogOut, MapPin, QrCode, RotateCcw, ScanLine,
} from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Button, cx, dayLabel, Empty, Load, Page, Pressable, range, Spinner, Textarea, time, titleCase, useApi, useConfirm, useToast,
} from '../../ui/index.jsx';
import { distanceM, NotLinked, until } from './_parts.jsx';

const EARLY_MIN = 30;
const STATE_LABEL = { not_started: 'Not clocked in', on_shift: 'On shift', on_break: 'On break', finished: 'Shift complete' };
const KIND_LABEL = { in: 'Clocked in', out: 'Clocked out', break_start: 'Break started', break_end: 'Break ended' };

function useNow(ms = 15000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('This device cannot share its location'));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      (e) => reject(new Error(e.code === 1 ? 'Location permission is blocked. Allow location for this site in your browser settings.' : e.code === 3 ? 'Timed out finding your location' : 'Your location is unavailable')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  });
}

export default function Clock() {
  const { user } = useAuth();
  const q = useApi('clock.status', {}, { poll: 30000, skip: !user.officer_id });
  if (!user.officer_id) return <Page title="Clock"><NotLinked /></Page>;
  return (
    <Page title="Clock">
      <Load q={q}>{(d) => <ClockScreen data={d} reload={q.reload} />}</Load>
    </Page>
  );
}

function ClockScreen({ data, reload }) {
  const now = useNow();
  const toast = useToast();
  const confirm = useConfirm();
  const [selId, setSelId] = useState(null);
  const [flow, setFlow] = useState(null); // { kind, step: locate|scan|exception|done, pos, posError, qr, problems, result }
  const [busy, setBusy] = useState(false);
  const list = data.today || [];
  const a = list.find((x) => x.assignment_id === selId) || data.current;

  if (!a) {
    return (
      <Empty icon={ScanLine} title="No shift to clock in to" body="Clocking opens 30 minutes before a shift you're booked on. Check your shifts for what's coming up."
        action={<Button to="/officer/shifts">My shifts</Button>} />
    );
  }

  const state = a.state;
  const opensAt = new Date(a.starts_at).getTime() - EARLY_MIN * 60000;
  const tooEarly = state === 'not_started' && now < opensAt;
  const valid = (a.events || []).filter((e) => e.status !== 'rejected');
  const since = valid.at(-1)?.ts;
  const firstIn = valid.find((e) => e.kind === 'in')?.ts;

  const punch = async (kind, extra = {}) => {
    setBusy(true);
    try {
      const pos = extra.pos || {};
      const r = await api('clock.punch', {
        assignment_id: a.assignment_id, kind, lat: pos.lat ?? null, lng: pos.lng ?? null, accuracy: pos.accuracy ?? null, qr: extra.qr || null,
        ...(extra.exception_reason ? { exception_reason: extra.exception_reason } : {}),
      });
      setFlow({ kind, step: 'done', result: r });
      if (navigator.vibrate) navigator.vibrate(60);
    } catch (e) {
      if (e.status === 422 && e.data?.can_request_exception) setFlow((f) => ({ ...f, kind, step: 'exception', pos: extra.pos, qr: extra.qr, problems: e.data.problems || [e.message] }));
      else { toast(e.message, 'error'); if (kind === 'in' || kind === 'out') setFlow(null); reload(); }
    } finally {
      setBusy(false);
    }
  };

  const startIn = () => setFlow({ kind: 'in', step: 'locate' });
  const startOut = async () => {
    const early = new Date(a.ends_at) - Date.now() > 15 * 60000;
    if (await confirm({ title: 'Clock out now?', body: early ? `Your shift is booked until ${time(a.ends_at)}. Leaving early will be flagged on your timesheet.` : `Your shift ends at ${time(a.ends_at)}.`, confirm: 'Clock out', danger: early })) {
      setFlow({ kind: 'out', step: 'locate' });
    }
  };
  const close = () => { setFlow(null); reload(); };

  if (flow) {
    return (
      <div className="space-y-3">
        <VenueStrip a={a} />
        {flow.step === 'locate' && (
          <LocateStep a={a} kind={flow.kind} busy={busy} onCancel={() => setFlow(null)}
            onNext={(pos, note) => (flow.kind === 'in' ? setFlow({ ...flow, step: 'scan', pos }) : punch('out', { pos, exception_reason: note }))} />
        )}
        {flow.step === 'scan' && (
          <ScanStep busy={busy} onCancel={() => setFlow(null)}
            onResult={(qr) => { setFlow({ ...flow, qr }); punch('in', { pos: flow.pos, qr }); }}
            onCantScan={(why) => setFlow({ ...flow, step: 'exception', qr: null, problems: [why || 'QR code not scanned', ...(flow.pos ? [] : ['Location unavailable'])] })} />
        )}
        {flow.step === 'exception' && (
          <ExceptionStep problems={flow.problems} busy={busy} onCancel={() => setFlow(null)} onRetry={() => setFlow({ kind: flow.kind, step: 'locate' })}
            onSubmit={(reason) => punch(flow.kind, { pos: flow.pos, qr: flow.qr, exception_reason: reason })} />
        )}
        {flow.step === 'done' && <DoneStep kind={flow.kind} result={flow.result} a={a} onDone={close} />}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <section className={cx('rounded-tile p-6 shadow-tile', state === 'on_shift' ? 'bg-green text-white' : state === 'on_break' ? 'bg-amber text-white' : state === 'finished' ? 'bg-surface' : 'bg-ink text-white')}>
        <div className="flex items-center gap-2 text-footnote font-semibold uppercase tracking-wide opacity-80">
          {state === 'on_shift' && <span className="h-2.5 w-2.5 rounded-full bg-white live-dot" />}
          {STATE_LABEL[state]}
        </div>
        <div className="display mt-2 text-large font-bold leading-none">
          {state === 'on_shift' ? `Since ${time(firstIn)}` : state === 'on_break' ? `Break since ${time(since)}` : state === 'finished' ? `Out at ${time(since)}` : tooEarly ? `Opens ${time(opensAt)}` : 'Ready'}
        </div>
        <div className="mt-2 text-body opacity-80">
          {state === 'not_started' ? `Shift ${new Date(a.starts_at) > now ? 'starts' : 'started'} ${until(a.starts_at)}` : state === 'finished' ? 'Thanks. Your timesheet is with the office.' : `Shift ends at ${time(a.ends_at)}`}
        </div>
      </section>

      <VenueStrip a={a} />

      {a.instructions && (
        <div className="flex gap-2.5 rounded-2xl bg-blue-soft px-4 py-3 text-subhead text-ink"><Info size={18} className="mt-0.5 shrink-0 text-blue" /><p className="min-w-0 whitespace-pre-line">{a.instructions}</p></div>
      )}

      <div className="space-y-2.5 pt-1">
        {state === 'not_started' && (
          <>
            <Button size="lg" icon={LogIn} className="h-16 w-full text-headline" disabled={tooEarly} onClick={startIn}>Clock in</Button>
            <p className="text-center text-footnote text-muted">{tooEarly ? `You can clock in from ${time(opensAt)}.` : "We'll check your location, then you scan the venue's QR code."}</p>
          </>
        )}
        {state === 'on_shift' && (
          <>
            <Button size="lg" variant="dark" icon={LogOut} className="h-16 w-full text-headline" onClick={startOut}>Clock out</Button>
            <Button size="lg" variant="secondary" icon={Coffee} className="w-full" busy={busy} onClick={() => punch('break_start')}>Start break</Button>
          </>
        )}
        {state === 'on_break' && (
          <Button size="lg" icon={Coffee} className="h-16 w-full text-headline" busy={busy} onClick={() => punch('break_end')}>End break</Button>
        )}
        {state === 'finished' && <Button size="lg" variant="secondary" className="w-full" to="/officer">Back to home</Button>}
      </div>

      {valid.length > 0 && (
        <div className="mt-2 rounded-tile bg-surface p-4 shadow-tile">
          <div className="mb-2 text-footnote font-semibold uppercase tracking-wide text-muted">Today's punches</div>
          <div className="divide-y divide-line">
            {valid.map((e) => (
              <div key={e.id} className="flex items-center justify-between py-2 text-body">
                <span className="font-semibold">{KIND_LABEL[e.kind]}</span>
                <span className="flex items-center gap-2">
                  {e.status === 'exception' && <span className="text-caption font-semibold text-amber">Awaiting approval</span>}
                  {e.status === 'approved' && <span className="text-caption font-semibold text-green">Approved</span>}
                  <span className="num font-semibold">{time(e.ts)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {list.length > 1 && (
        <div className="pt-2">
          <div className="mb-2 px-1 text-footnote font-semibold uppercase tracking-wide text-muted">Your shifts around now</div>
          <div className="space-y-2">
            {list.map((x) => (
              <Pressable card key={x.assignment_id} onClick={() => setSelId(x.assignment_id)} aria-pressed={x.assignment_id === a.assignment_id}
                className={cx('flex w-full items-center justify-between gap-3 rounded-2xl border bg-surface px-4 py-3 shadow-tile', x.assignment_id === a.assignment_id ? 'border-blue ring-2 ring-blue/15' : 'border-transparent')}>
                <span className="min-w-0"><span className="block truncate font-semibold">{x.venue_name}</span><span className="num text-footnote text-muted">{dayLabel(x.starts_at)} · {range(x.starts_at, x.ends_at)}</span></span>
                <span className="shrink-0 text-footnote font-semibold text-muted">{STATE_LABEL[x.state]}</span>
              </Pressable>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VenueStrip({ a }) {
  return (
    <div className="flex items-center gap-3 rounded-tile bg-surface p-4 shadow-tile">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-soft text-blue"><MapPin size={20} /></div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-headline font-bold">{a.venue_name}</div>
        <div className="truncate text-footnote text-muted">{[a.address, a.postcode].filter(Boolean).join(', ')}</div>
      </div>
      <div className="shrink-0 text-right">
        <div className="num text-body font-bold">{range(a.starts_at, a.ends_at)}</div>
        <div className="text-caption text-muted">{a.role_name}</div>
      </div>
    </div>
  );
}

function StepHead({ n, of, title, body }) {
  return (
    <div className="mb-4">
      {n && <div className="text-caption font-semibold uppercase tracking-wide text-blue">Step {n} of {of}</div>}
      <h2 className="display mt-0.5 text-title2 font-bold">{title}</h2>
      {body && <p className="mt-1 text-subhead text-muted">{body}</p>}
    </div>
  );
}

function LocateStep({ a, kind, busy, onNext, onCancel }) {
  const [st, setSt] = useState({ loading: true });
  const [note, setNote] = useState('');
  const attempt = useRef(0);
  const locate = () => {
    const n = ++attempt.current;
    setSt({ loading: true });
    getPosition().then((pos) => n === attempt.current && setSt({ pos })).catch((e) => n === attempt.current && setSt({ error: e.message }));
  };
  useEffect(() => { locate(); return () => { attempt.current++; }; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const dist = st.pos ? distanceM(st.pos.lat, st.pos.lng, a.lat, a.lng) : null;
  const slack = Math.min(st.pos?.accuracy || 0, 50);
  const inside = dist != null && a.radius_m != null ? dist <= a.radius_m + slack : null;

  // Inside the fence on clock-in: go straight on to the scan
  useEffect(() => {
    if (kind === 'in' && st.pos && inside) { const t = setTimeout(() => onNext(st.pos), 700); return () => clearTimeout(t); }
  }, [st.pos, inside]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="rounded-tile bg-surface p-5 shadow-tile">
      <StepHead n={kind === 'in' ? 1 : null} of={2} title="Checking your location" body={kind === 'in' ? 'Stand at the venue. Your location is only taken when you clock.' : 'Your location is recorded with your clock-out.'} />
      <div className="flex flex-col items-center py-4 text-center">
        <div className={cx('grid h-24 w-24 place-items-center rounded-full', st.error ? 'bg-red-soft text-red' : inside === false ? 'bg-amber-soft text-amber' : st.pos ? 'bg-green-soft text-green' : 'bg-blue-soft text-blue')}>
          {st.loading ? <Crosshair size={40} className="animate-pulse" /> : st.error ? <AlertTriangle size={40} /> : <LocateFixed size={40} />}
        </div>
        {st.loading && <div className="mt-4 text-headline font-semibold">Finding you…</div>}
        {st.error && <div className="mt-4 max-w-xs text-body font-semibold text-red">{st.error}</div>}
        {st.pos && (
          <>
            <div className="mt-4 text-headline font-bold">
              {inside === true ? "You're at the venue" : inside === false ? `About ${dist >= 1000 ? `${(dist / 1000).toFixed(1)} km` : `${dist} m`} from the venue` : 'Location found'}
            </div>
            <div className="mt-1 text-subhead text-muted">
              Accuracy ±{st.pos.accuracy} m{a.radius_m ? ` · limit ${a.radius_m} m` : ''}
            </div>
            {st.pos.accuracy > 100 && <div className="mt-2 max-w-xs text-footnote text-amber">Signal is weak. Step outside or near a window and try again.</div>}
          </>
        )}
      </div>

      {kind === 'out' && (st.error || inside === false) && (
        <Textarea label="Note for your supervisor (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Escorting a customer to the taxi rank" className="mb-3" />
      )}

      <div className="grid gap-2">
        {kind === 'in' && st.pos && inside !== false && <Button size="lg" icon={QrCode} onClick={() => onNext(st.pos)}>Scan QR code</Button>}
        {kind === 'in' && (st.error || inside === false) && (
          <>
            <Button size="lg" icon={RotateCcw} onClick={locate}>Try again</Button>
            <Button size="lg" variant="secondary" onClick={() => onNext(st.pos || null)}>Continue anyway</Button>
          </>
        )}
        {kind === 'out' && (st.pos || st.error) && (
          <>
            {(st.error || inside === false) && <Button size="lg" variant="secondary" icon={RotateCcw} onClick={locate}>Try again</Button>}
            <Button size="lg" variant="dark" icon={LogOut} busy={busy} onClick={() => onNext(st.pos || null, note.trim())}>{st.error || inside === false ? 'Clock out anyway' : 'Clock out'}</Button>
          </>
        )}
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
      {kind === 'out' && (st.error || inside === false) && <p className="mt-2 text-center text-caption text-muted">A clock-out away from the venue is flagged for your supervisor to check.</p>}
    </section>
  );
}

// Venue QR scanner. The camera is stopped after a scan and when leaving the screen.
function QrScanner({ onResult, onFail }) {
  const id = `qr-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const cb = useRef({ onResult, onFail });
  cb.current = { onResult, onFail };
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let scanner = null;
    let starting = null;
    let cancelled = false;
    let done = false;
    const stop = () => scanner && scanner.stop().then(() => scanner.clear()).catch(() => {});
    (async () => {
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        if (cancelled) return;
        scanner = new Html5Qrcode(id, { verbose: false });
        starting = scanner.start({ facingMode: 'environment' }, { fps: 12, aspectRatio: 1 }, (text) => {
          if (done) return;
          done = true;
          stop();
          cb.current.onResult(text);
        }, () => {});
        await starting;
        if (cancelled) { stop(); return; }
        setReady(true);
      } catch (e) {
        if (!cancelled) cb.current.onFail(e);
      }
    })();
    return () => {
      cancelled = true;
      if (!done && starting) starting.then(stop, () => {});
    };
  }, [id]);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[340px] overflow-hidden rounded-sheet bg-ink">
      <div id={id} className="absolute inset-0 [&_video]:!h-full [&_video]:!w-full [&_video]:object-cover" />
      {!ready && <div className="absolute inset-0 grid place-items-center text-white/70"><Spinner className="py-0" /></div>}
      <div className="pointer-events-none absolute inset-[14%]">
        {['left-0 top-0 border-l-4 border-t-4 rounded-tl-3xl', 'right-0 top-0 border-r-4 border-t-4 rounded-tr-3xl', 'left-0 bottom-0 border-l-4 border-b-4 rounded-bl-3xl', 'right-0 bottom-0 border-r-4 border-b-4 rounded-br-3xl']
          .map((c) => <span key={c} className={cx('absolute h-12 w-12 border-white', c)} />)}
        {ready && <span className="absolute inset-x-3 top-1/2 h-0.5 animate-pulse rounded-full bg-blue shadow-[0_0_12px_2px_rgba(10,108,255,.8)]" />}
      </div>
    </div>
  );
}

function ScanStep({ busy, onResult, onCantScan, onCancel }) {
  const [err, setErr] = useState(null);
  const [key, setKey] = useState(0);
  const [scanned, setScanned] = useState(false);
  const failMsg = (e) => {
    const s = String(e?.name || e?.message || e || '');
    if (/NotAllowed|Permission/i.test(s)) return 'Camera access is blocked. Allow the camera for this site in your browser settings.';
    if (/NotFound|no camera|Requested device not found/i.test(s)) return 'No camera found on this device.';
    return 'The camera could not start.';
  };
  return (
    <section className="rounded-tile bg-surface p-5 shadow-tile">
      <StepHead n={2} of={2} title="Scan the venue QR code" body="Point your camera at the Orb Security QR poster at the venue entrance." />
      {busy || scanned ? (
        <div className="flex flex-col items-center py-12"><Spinner className="py-0" /><div className="mt-3 font-semibold">Clocking you in…</div></div>
      ) : err ? (
        <div className="flex flex-col items-center py-8 text-center">
          <div className="grid h-20 w-20 place-items-center rounded-full bg-red-soft text-red"><CameraOff size={34} /></div>
          <div className="mt-4 max-w-xs text-body font-semibold">{err}</div>
          <Button size="lg" variant="secondary" icon={RotateCcw} className="mt-4" onClick={() => { setErr(null); setKey((k) => k + 1); }}>Try again</Button>
        </div>
      ) : (
        <QrScanner key={key} onResult={(t) => { setScanned(true); onResult(t); }} onFail={(e) => setErr(failMsg(e))} />
      )}
      <div className="mt-4 grid gap-2">
        <Button size="lg" variant="secondary" disabled={busy} onClick={() => onCantScan(err ? 'Camera unavailable: QR code not scanned' : 'QR code not scanned')}>I can't scan the code</Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
      </div>
    </section>
  );
}

function ExceptionStep({ problems, busy, onSubmit, onRetry, onCancel }) {
  const [reason, setReason] = useState('');
  return (
    <section className="rounded-tile bg-surface p-5 shadow-tile">
      <div className="flex items-start gap-3 rounded-2xl bg-amber-soft p-4 text-amber">
        <AlertTriangle size={24} className="mt-0.5 shrink-0" />
        <div>
          <div className="text-callout font-bold">We couldn't confirm you're on site</div>
          <ul className="mt-1 space-y-0.5 text-subhead font-medium">{(problems || []).map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      </div>
      <p className="mt-4 text-subhead text-muted">You can still clock in. It will be sent to your supervisor to approve, so explain what happened.</p>
      <Textarea className="mt-3" label="Reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. QR poster is missing from the door; I'm at the staff entrance" />
      <div className="mt-4 grid gap-2">
        <Button size="lg" busy={busy} disabled={reason.trim().length < 5} onClick={() => onSubmit(reason.trim())}>Submit as exception</Button>
        <Button size="lg" variant="secondary" icon={RotateCcw} disabled={busy} onClick={onRetry}>Try again</Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
      </div>
    </section>
  );
}

function DoneStep({ kind, result, a, onDone }) {
  const ev = result?.event;
  const flagged = ev?.status === 'exception';
  const msg = {
    in: flagged ? 'Sent to your supervisor for approval. You are clocked in.' : `Have a good shift. It ends at ${time(a.ends_at)}.`,
    out: flagged ? 'Recorded and flagged for your supervisor to check.' : 'Thanks. Your hours have been sent for approval.',
    break_start: 'Enjoy your break. Remember to end it when you are back.',
    break_end: 'Welcome back.',
  }[kind];
  return (
    <section className="flex flex-col items-center rounded-tile bg-surface px-5 py-10 text-center shadow-tile" style={{ animation: 'fade .3s' }}>
      <div className={cx('grid h-28 w-28 place-items-center rounded-full', flagged ? 'bg-amber-soft text-amber' : 'bg-green-soft text-green')}>
        {flagged ? <AlertTriangle size={56} /> : <CheckCircle2 size={60} />}
      </div>
      <div className="mt-5 text-body font-semibold text-muted">{KIND_LABEL[kind]}{flagged ? ' (exception)' : ''}</div>
      <div className="display num mt-1 text-[56px] font-bold leading-none">{time(ev?.ts || new Date())}</div>
      <div className="mt-2 text-body font-semibold">{a.venue_name}</div>
      <p className="mt-3 max-w-xs text-subhead text-muted">{msg}</p>
      {result?.problems?.length > 0 && <p className="mt-2 max-w-xs text-footnote text-amber">{result.problems.map(titleCase).join(' · ')}</p>}
      <Button size="lg" className="mt-6 w-full max-w-xs" onClick={onDone}>Done</Button>
    </section>
  );
}
