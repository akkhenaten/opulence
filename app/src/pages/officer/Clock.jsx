import { useEffect, useId, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle, BookOpen, CalendarDays, Camera, CameraOff, Check, CheckCircle2, Coffee, Crosshair, History, Home, Info, LocateFixed, LogIn, LogOut, MapPin, Nfc, RotateCcw, ScanFace, ScanLine, Smartphone,
} from 'lucide-react';
import { api, upload } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { getPasskey } from '../../lib/passkey.js';
import {
  Button, cx, dayLabel, Empty, Load, Page, Pressable, range, Section, Sheet, Spinner, Textarea, time, titleCase, useApi, useConfirm, useToast,
} from '../../ui/index.jsx';
import { CLOCK_EARLY_MIN, distanceM, NotLinked, until, useNow } from './_parts.jsx';
import { RegisterStep } from './_phone.jsx';

const STATE_LABEL = { not_started: 'Not clocked in', on_shift: 'On shift', on_break: 'On break', finished: 'Shift complete' };
const NEED = { any_one: 1, two_of_three: 2, all_three: 3 };
const FLAG_NOTE = {
  phone_not_verified: 'Your phone was not checked',
  new_phone: 'Your new phone is waiting for a manager to approve it',
  rule_not_met: 'Not enough clock-in checks',
  face_check: 'Your selfie will be checked by a manager',
};
const KIND_LABEL = { in: 'Clocked in', out: 'Clocked out', break_start: 'Break started', break_end: 'Break ended' };

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

const ME = { to: '/officer/me', label: 'Me' };

export default function Clock() {
  const { user } = useAuth();
  const q = useApi('clock.status', {}, { poll: 30000, skip: !user.officer_id });
  if (!user.officer_id) return <Page title="Clock" back={ME}><NotLinked /></Page>;
  return (
    <Page title="Clock" back={ME}>
      <Load q={q}>{(d) => <ClockScreen data={d} reload={q.reload} />}</Load>
    </Page>
  );
}

function ClockScreen({ data, reload }) {
  const now = useNow();
  const toast = useToast();
  const confirm = useConfirm();
  const [sp, setSp] = useSearchParams();
  const [selId, setSelId] = useState(null);
  // { kind, step: register|locate|code|selfie|phone|exception|done, pos, inside, qr, tap, selfie, codeSkipped, selfieSkipped, skipPhone, problems, missing, result }
  const [flow, setFlow] = useState(null);
  const [busy, setBusy] = useState(false);
  const [consent, setConsent] = useState(data.face_consent);
  const [packBlock, setPackBlock] = useState(null); // venue id, when a clock-in came back asking for the site pack
  const list = data.today || [];
  const a = list.find((x) => x.assignment_id === selId) || data.current;
  const need = NEED[a?.proof_rule] || 2;

  // Opened from an NFC tag tap: start clocking in with the tag already counted
  const tapId = sp.get('tap');
  useEffect(() => {
    if (!tapId) return;
    setSp({}, { replace: true });
    if (a?.state === 'not_started') startIn({ tap: tapId });
  }, [tapId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!a) {
    return (
      <Empty icon={ScanLine} title="No shift to clock in to" body="Clocking opens 15 minutes before a shift you're booked on. Check your shifts for what's coming up."
        action={<Button to="/officer/shifts">My shifts</Button>} />
    );
  }

  const state = a.state;
  const packVenue = state === 'not_started' && (packBlock === a.venue_id || (data.pack && !data.pack.ok && data.pack.venue_id === a.venue_id)) ? a.venue_id : null;
  const opensAt = new Date(a.starts_at).getTime() - CLOCK_EARLY_MIN * 60000;
  const tooEarly = state === 'not_started' && now < opensAt;
  const valid = (a.events || []).filter((e) => e.status !== 'rejected');
  const since = valid.at(-1)?.ts;
  const firstIn = valid.find((e) => e.kind === 'in')?.ts;

  const punch = async (kind, f = {}) => {
    setBusy(true);
    try {
      // The phone check comes last so its one-time code is fresh
      let passkey = null;
      if ((kind === 'in' || kind === 'out') && !f.skipPhone) {
        try {
          const o = await api('clock.passkeyOptions');
          if (o.register) { setFlow({ ...f, kind, step: 'register', after: 'submit' }); return; }
          passkey = await getPasskey(o.options);
        } catch (e) {
          setFlow({ ...f, kind, step: 'phone', phoneErr: e.message });
          return;
        }
      }
      const pos = f.pos || {};
      const r = await api('clock.punch', {
        assignment_id: a.assignment_id, kind, lat: pos.lat ?? null, lng: pos.lng ?? null, accuracy: pos.accuracy ?? null,
        qr: f.qr || null, tap_id: f.tap || null, selfie_key: f.selfie || null, passkey,
        ...(f.exception_reason ? { exception_reason: f.exception_reason } : {}),
      });
      setFlow({ kind, step: 'done', result: r });
      if (navigator.vibrate) navigator.vibrate(60);
    } catch (e) {
      if (e.status === 423 && e.data?.code === 'venue_pack') { setFlow(null); setPackBlock(e.data.venue_id); reload(); }
      else if (e.status === 422 && e.data?.can_request_exception) setFlow({ ...f, kind, step: 'exception', problems: e.data.problems || [e.message], missing: e.data.missing || [] });
      else { toast(e.message, 'error'); if (kind === 'in' || kind === 'out') setFlow(null); reload(); }
    } finally {
      setBusy(false);
    }
  };

  // What comes next on clock-in (steps 1-3): location, venue code, then a selfie if the rule still needs one, then submit
  const next = (f) => {
    const have = (f.inside ? 1 : 0) + (f.qr || f.tap ? 1 : 0) + (f.selfie ? 1 : 0);
    if (f.kind === 'in' && !f.qr && !f.tap && !f.codeSkipped) return setFlow({ ...f, step: 'code' });
    if (f.kind === 'in' && !f.selfie && !f.selfieSkipped && (have < need || need === 3)) return setFlow({ ...f, step: 'selfie' });
    setFlow({ ...f, step: 'submit' });
    return punch(f.kind, f);
  };

  const start = async (f) => {
    // Register the phone first if this officer has none yet
    try {
      const o = await api('clock.passkeyOptions');
      setFlow({ ...f, pendingPhone: !!o.pending, step: o.register ? 'register' : 'locate' });
    } catch {
      setFlow({ ...f, step: 'locate' });
    }
  };
  const startIn = (extra = {}) => start({ kind: 'in', ...extra });
  const startOut = async () => {
    const early = new Date(a.ends_at) - Date.now() > 15 * 60000;
    if (await confirm({ title: 'Clock out now?', body: early ? `Your shift is booked until ${time(a.ends_at)}. Leaving early will be flagged on your timesheet.` : `Your shift ends at ${time(a.ends_at)}.`, confirm: 'Clock out', danger: early })) {
      start({ kind: 'out' });
    }
  };
  const close = () => { setFlow(null); reload(); };

  if (flow) {
    const cancel = () => setFlow(null);
    return (
      <div className="space-y-3">
        <VenueStrip a={a} />
        {flow.kind === 'in' && !['done', 'register'].includes(flow.step) && <ProofList f={flow} need={need} />}
        {flow.step === 'register' && (
          <RegisterStep onCancel={cancel}
            onDone={(status) => { const f = { ...flow, pendingPhone: status === 'pending' }; if (flow.after === 'submit') next(f); else setFlow({ ...f, step: 'locate' }); }}
            onSkip={() => { const f = { ...flow, skipPhone: true }; if (flow.after === 'submit') next(f); else setFlow({ ...f, step: 'locate' }); }} />
        )}
        {flow.step === 'locate' && (
          <LocateStep a={a} kind={flow.kind} busy={busy} onCancel={cancel}
            onNext={(pos, note, inside) => (flow.kind === 'in' ? next({ ...flow, pos, inside }) : punch('out', { ...flow, pos, exception_reason: note }))} />
        )}
        {flow.step === 'code' && (
          <ScanStep busy={busy} onCancel={cancel}
            onResult={(qr) => next({ ...flow, qr })}
            onCantScan={() => next({ ...flow, codeSkipped: true })} />
        )}
        {flow.step === 'selfie' && (
          <SelfieStep busy={busy} consent={consent} faceOn={data.face_match_enabled} onConsent={setConsent} onCancel={cancel}
            optional={need < 3 && (flow.inside ? 1 : 0) + (flow.qr || flow.tap ? 1 : 0) >= need}
            onDone={(key) => next({ ...flow, selfie: key })} onSkip={() => next({ ...flow, selfieSkipped: true })} />
        )}
        {flow.step === 'submit' && (
          <section className="flex flex-col items-center rounded-tile bg-surface px-5 py-12 shadow-tile"><Spinner className="py-0" /><div className="mt-3 font-semibold">{flow.kind === 'in' ? 'Clocking you in…' : 'Clocking you out…'}</div></section>
        )}
        {flow.step === 'phone' && (
          <PhoneFailStep error={flow.phoneErr} busy={busy} onCancel={cancel}
            onRetry={() => punch(flow.kind, flow)} onSkip={() => punch(flow.kind, { ...flow, skipPhone: true })}
            onNewPhone={() => setFlow({ ...flow, step: 'register', after: 'submit' })} />
        )}
        {flow.step === 'exception' && (
          <ExceptionStep problems={flow.problems} missing={flow.missing} busy={busy} onCancel={cancel} onRetry={() => setFlow({ kind: flow.kind, tap: flow.tap, step: 'locate' })}
            onAdd={(what) => setFlow({ ...flow, step: { selfie: 'selfie', venue_code: 'code', location: 'locate' }[what], selfieSkipped: false, codeSkipped: false })}
            onSubmit={(reason) => punch(flow.kind, { ...flow, exception_reason: reason })} />
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
        {packVenue && <PackCard venueId={packVenue} venue={a.venue_name} pack={data.pack?.venue_id === packVenue ? data.pack : null} />}
        {state === 'not_started' && !packVenue && (
          <>
            <Button size="lg" icon={LogIn} className="h-16 w-full text-headline" disabled={tooEarly} onClick={() => startIn()}>Clock in</Button>
            <p className="text-center text-footnote text-muted">{tooEarly ? `You can clock in from ${time(opensAt)}.` : `Your phone, plus ${need === 3 ? 'all 3' : need === 1 ? 'any 1' : '2 of 3'}: location, venue code (QR or NFC tag), selfie.`}</p>
          </>
        )}
        {a.cancelled && state !== 'finished' && (
          <div className="flex gap-2.5 rounded-2xl bg-amber-soft px-4 py-3 text-subhead text-ink"><AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber" /><p className="min-w-0">This shift was cancelled by the office. Clock out when you leave.</p></div>
        )}
        {state === 'on_shift' && (
          <>
            <Button size="lg" variant="dark" icon={LogOut} className="h-16 w-full text-headline" onClick={startOut}>Clock out</Button>
            {!a.cancelled && <Button size="lg" variant="secondary" icon={Coffee} className="w-full" busy={busy} onClick={() => punch('break_start')}>Start break</Button>}
          </>
        )}
        {state === 'on_break' && (
          <Button size="lg" icon={Coffee} className="h-16 w-full text-headline" busy={busy} onClick={() => punch('break_end')}>End break</Button>
        )}
        {(state === 'on_shift' || state === 'on_break') && (
          <Button size="lg" variant="plain" icon={Home} className="w-full" to="/officer">You're on shift · open your shift card</Button>
        )}
        {state === 'finished' && <Button size="lg" variant="secondary" className="w-full" to="/officer">Back to home</Button>}
      </div>

      {valid.length > 0 && (
        <div className="mt-2 rounded-tile bg-surface p-4 shadow-tile">
          <Section title="Today's punches" icon={History} count={valid.length} className="!mt-0">
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
          </Section>
        </div>
      )}

      {list.length > 1 && (
        <Section title="Your shifts around now" icon={CalendarDays} className="!mt-0 pt-2">
          <div className="space-y-2">
            {list.map((x) => (
              <Pressable card key={x.assignment_id} onClick={() => setSelId(x.assignment_id)} aria-pressed={x.assignment_id === a.assignment_id}
                className={cx('flex w-full items-center justify-between gap-3 rounded-2xl border bg-surface px-4 py-3 shadow-tile', x.assignment_id === a.assignment_id ? 'border-blue ring-2 ring-blue/15' : 'border-transparent')}>
                <span className="min-w-0"><span className="block truncate font-semibold">{x.venue_name}</span><span className="num text-footnote text-muted">{dayLabel(x.starts_at)} · {range(x.starts_at, x.ends_at)}</span></span>
                <span className="shrink-0 text-footnote font-semibold text-muted">{STATE_LABEL[x.state]}</span>
              </Pressable>
            ))}
          </div>
        </Section>
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
    if (kind === 'in' && st.pos && inside) { const t = setTimeout(() => onNext(st.pos, '', true), 700); return () => clearTimeout(t); }
  }, [st.pos, inside]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="rounded-tile bg-surface p-5 shadow-tile">
      <StepHead n={kind === 'in' ? 1 : undefined} of={3} title="Checking your location" body={kind === 'in' ? 'Stand at the venue. Your location is only taken when you clock.' : 'Your location is recorded with your clock-out.'} />
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
        {kind === 'in' && st.pos && inside !== false && <Button size="lg" onClick={() => onNext(st.pos, '', inside)}>Continue</Button>}
        {kind === 'in' && (st.error || inside === false) && (
          <>
            <Button size="lg" icon={RotateCcw} onClick={locate}>Try again</Button>
            <Button size="lg" variant="secondary" onClick={() => onNext(st.pos || null, '', false)}>Continue without location</Button>
          </>
        )}
        {kind === 'out' && (st.pos || st.error) && (
          <>
            {(st.error || inside === false) && <Button size="lg" variant="secondary" icon={RotateCcw} onClick={locate}>Try again</Button>}
            <Button size="lg" variant="dark" icon={LogOut} busy={busy} onClick={() => onNext(st.pos || null, note.trim(), inside)}>{st.error || inside === false ? 'Clock out anyway' : 'Clock out'}</Button>
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
        {ready && <span className="absolute inset-x-3 top-1/2 h-0.5 animate-pulse rounded-full bg-blue shadow-[0_0_12px_2px_color-mix(in_srgb,var(--accent-fill,var(--color-blue))_80%,transparent)]" />}
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
      <StepHead n={2} of={3} title="Venue code" body="Point your camera at the Orb Security QR poster at the venue entrance." />
      {busy || scanned ? (
        <div className="flex flex-col items-center py-12"><Spinner className="py-0" /><div className="mt-3 font-semibold">Checking…</div></div>
      ) : err ? (
        <div className="flex flex-col items-center py-8 text-center">
          <div className="grid h-20 w-20 place-items-center rounded-full bg-red-soft text-red"><CameraOff size={34} /></div>
          <div className="mt-4 max-w-xs text-body font-semibold">{err}</div>
          <Button size="lg" variant="secondary" icon={RotateCcw} className="mt-4" onClick={() => { setErr(null); setKey((k) => k + 1); }}>Try again</Button>
        </div>
      ) : (
        <QrScanner key={key} onResult={(t) => { setScanned(true); onResult(t); }} onFail={(e) => setErr(failMsg(e))} />
      )}
      <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-blue-soft px-4 py-3 text-subhead text-ink">
        <Nfc size={20} className="shrink-0 text-blue" />
        <span>Venue has an NFC tag? Hold the top of your phone against it instead.</span>
      </div>
      <div className="mt-4 grid gap-2">
        <Button size="lg" variant="secondary" disabled={busy} onClick={onCantScan}>I can't scan the code</Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
      </div>
    </section>
  );
}

const ADD = { venue_code: ['Scan the venue code', ScanLine], selfie: ['Take a selfie', Camera], location: ['Check my location again', LocateFixed] };

function ExceptionStep({ problems, missing, busy, onSubmit, onAdd, onRetry, onCancel }) {
  const [reason, setReason] = useState('');
  const adds = (missing || []).filter((m) => ADD[m]);
  return (
    <section className="rounded-tile bg-surface p-5 shadow-tile">
      <div className="flex items-start gap-3 rounded-2xl bg-amber-soft p-4 text-amber">
        <AlertTriangle size={24} className="mt-0.5 shrink-0" />
        <div>
          <div className="text-callout font-bold">We couldn't confirm you're on site</div>
          <ul className="mt-1 space-y-0.5 text-subhead font-medium">{(problems || []).map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      </div>
      {adds.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-subhead font-semibold">Add another check</div>
          <div className="grid gap-2">
            {adds.map((m) => { const [label, Icon] = ADD[m]; return <Button key={m} size="lg" variant="secondary" icon={Icon} disabled={busy} onClick={() => onAdd(m)}>{label}</Button>; })}
          </div>
        </div>
      )}
      <p className="mt-4 text-subhead text-muted">{adds.length ? 'Or clock in anyway' : 'You can still clock in'}. It will be sent to your supervisor to approve, so explain what happened.</p>
      <Textarea className="mt-3" label="Reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. QR poster is missing from the door; I'm at the staff entrance" />
      <div className="mt-4 grid gap-2">
        <Button size="lg" busy={busy} disabled={reason.trim().length < 5} onClick={() => onSubmit(reason.trim())}>Submit as exception</Button>
        <Button size="lg" variant="ghost" icon={RotateCcw} disabled={busy} onClick={onRetry}>Start again</Button>
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
      {(result?.flags || []).filter((f) => FLAG_NOTE[f] && f !== 'rule_not_met').map((f) => <p key={f} className="mt-1 max-w-xs text-footnote text-muted">{FLAG_NOTE[f]}.</p>)}
      <Button size="lg" className="mt-6 w-full max-w-xs" onClick={onDone}>Done</Button>
    </section>
  );
}

// The four clock-in checks: the phone always, plus the venue's rule for the other three
function ProofList({ f, need }) {
  const have = { location: !!f.inside, venue_code: !!(f.qr || f.tap), selfie: !!f.selfie };
  const count = Object.values(have).filter(Boolean).length;
  const left = Math.max(0, need - count);
  const item = (label, ok, Icon, note) => (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-footnote font-semibold', ok ? 'bg-green-soft text-green' : 'bg-fill text-muted')}>
      {ok ? <Check size={14} strokeWidth={3} /> : <Icon size={14} />}{label}{note && <span className="font-medium opacity-80"> · {note}</span>}
    </span>
  );
  return (
    <div className="rounded-tile bg-surface px-4 py-3 shadow-tile">
      <div className="flex flex-wrap gap-1.5">
        {item('Phone', false, Smartphone, f.skipPhone ? 'skipped' : f.pendingPhone ? 'awaiting approval' : 'at the end')}
        {item('Location', have.location, LocateFixed)}
        {item(f.tap ? 'NFC tag' : 'Venue code', have.venue_code, f.tap ? Nfc : ScanLine)}
        {item('Selfie', have.selfie, Camera)}
      </div>
      <div className="mt-2 text-footnote text-muted">
        {left ? `${left} more ${left === 1 ? 'check' : 'checks'} needed (${need === 3 ? 'all 3' : `${need} of 3`} for this venue)` : 'Enough checks. Your phone confirms it at the end.'}
      </div>
    </div>
  );
}

// New phone: register it here (a manager approves it) instead of skipping the check
function PhoneFailStep({ error, busy, onRetry, onSkip, onNewPhone, onCancel }) {
  return (
    <section className="rounded-tile bg-surface p-5 shadow-tile">
      <StepHead title="Confirm it's your phone" />
      <div className="flex flex-col items-center py-4 text-center">
        <div className="grid h-24 w-24 place-items-center rounded-full bg-amber-soft text-amber"><Smartphone size={42} /></div>
        <div className="mt-4 max-w-xs text-body font-semibold">{error}</div>
      </div>
      <div className="grid gap-2">
        <Button size="lg" icon={RotateCcw} busy={busy} onClick={onRetry}>Try again</Button>
        <Button size="lg" variant="secondary" icon={Smartphone} disabled={busy} onClick={onNewPhone}>Use this phone instead</Button>
        <Button size="lg" variant="secondary" disabled={busy} onClick={onSkip}>Continue without phone check</Button>
        <Button variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
      </div>
      <p className="mt-2 text-center text-caption text-muted">New phone? Use it instead and a manager approves it. Without the phone check, it goes to your supervisor to approve.</p>
    </section>
  );
}

function SelfieStep({ busy, optional, consent, faceOn, onConsent, onDone, onSkip, onCancel }) {
  const toast = useToast();
  const [ask, setAsk] = useState(faceOn && !consent);
  const [saving, setSaving] = useState(null);
  const decide = async (yes) => {
    setSaving(yes ? 'yes' : 'no');
    try {
      const r = await api('officers.faceConsent', { consent: yes });
      onConsent(r.face_consent);
      setAsk(false);
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setSaving(null);
    }
  };
  return (
    <section className="rounded-tile bg-surface p-5 shadow-tile">
      <StepHead n={3} of={3} title="Take a selfie" body={optional ? 'Optional. You already have enough checks, but a selfie helps if anything is queried.' : 'A quick photo of you at the venue.'} />
      <SelfieCamera busy={busy} onDone={onDone} />
      <div className="mt-4 grid gap-2">
        {onSkip && <Button size="lg" variant="secondary" disabled={busy} onClick={onSkip}>{optional ? 'Skip' : "I can't take a selfie"}</Button>}
        <Button variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
      </div>
      <Sheet open={ask} onClose={() => setAsk(false)} title="Face check"
        footer={(
          <div className="grid w-full gap-2">
            <Button size="lg" busy={saving === 'yes'} disabled={!!saving} onClick={() => decide(true)}>Allow face check</Button>
            <Button size="lg" variant="secondary" busy={saving === 'no'} disabled={!!saving} onClick={() => decide(false)}>No thanks</Button>
          </div>
        )}>
        <div className="space-y-3 text-body">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-blue-soft text-blue"><ScanFace size={30} /></div>
          <p>Your company can compare your clock-in selfie with your profile photo, to stop anyone clocking in for you.</p>
          <ul className="list-disc space-y-1 pl-5 text-subhead text-muted">
            <li>It only flags a selfie for a manager to look at. It never stops you clocking in.</li>
            <li>Selfies are deleted after 90 days.</li>
            <li>If you say no, your selfie is still kept for your manager but not compared. You can change this in your profile.</li>
          </ul>
        </div>
      </Sheet>
    </section>
  );
}

// Front camera with an oval guide. Takes a ~720px JPEG and uploads it; no file picker, so it must be taken now.
function SelfieCamera({ busy, onDone }) {
  const video = useRef(null);
  const stream = useRef(null);
  const [st, setSt] = useState({ starting: true });
  const [shot, setShot] = useState(null); // { blob, url }
  const [uploading, setUploading] = useState(false);

  const stop = () => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  const startCam = async () => {
    setSt({ starting: true });
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('NotSupported');
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
      stream.current = s;
      if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
      setSt({ ready: true });
    } catch (e) {
      const n = String(e?.name || e?.message || '');
      setSt({ error: /NotAllowed|Permission/i.test(n) ? 'Camera access is blocked. Allow the camera for this site in your browser settings.' : /NotFound/i.test(n) ? 'No front camera found on this device.' : 'The camera could not start.' });
    }
  };
  useEffect(() => { startCam(); return stop; }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => shot && URL.revokeObjectURL(shot.url), [shot]);

  const take = () => {
    const v = video.current;
    if (!v?.videoWidth) return;
    const side = Math.min(v.videoWidth, v.videoHeight);
    const size = Math.min(720, side);
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    // Mirror like the preview, so the officer sees the photo they framed
    g.translate(size, 0); g.scale(-1, 1);
    g.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, size, size);
    c.toBlob((blob) => { if (blob) { setShot({ blob, url: URL.createObjectURL(blob) }); stop(); } }, 'image/jpeg', 0.85);
  };
  const retake = () => { setShot(null); startCam(); };
  const use = async () => {
    setUploading(true);
    try {
      const file = new File([shot.blob], 'selfie.jpg', { type: 'image/jpeg' });
      onDone(await upload(file, 'selfie'));
    } catch (e) {
      setSt({ ...st, upErr: e.message });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <div className="relative mx-auto aspect-square w-full max-w-[340px] overflow-hidden rounded-sheet bg-ink">
        {shot ? <img src={shot.url} alt="Your selfie" className="absolute inset-0 h-full w-full object-cover" />
          : <video ref={video} playsInline muted className="absolute inset-0 h-full w-full -scale-x-100 object-cover" />}
        {st.starting && !shot && <div className="absolute inset-0 grid place-items-center text-white/70"><Spinner className="py-0" /></div>}
        {st.error && !shot && (
          <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center text-white">
            <CameraOff size={34} />
            <div className="mt-3 text-body font-semibold">{st.error}</div>
          </div>
        )}
        {!shot && st.ready && <div className="pointer-events-none absolute inset-[16%_20%] rounded-[50%] border-4 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,0.35)]" />}
      </div>
      {st.upErr && <p className="mt-2 text-center text-footnote font-semibold text-red">{st.upErr}</p>}
      <div className="mt-4 grid gap-2">
        {shot ? (
          <>
            <Button size="lg" icon={Check} busy={uploading || busy} onClick={use}>Use this photo</Button>
            <Button size="lg" variant="secondary" icon={RotateCcw} disabled={uploading || busy} onClick={retake}>Retake</Button>
          </>
        ) : st.error ? (
          <Button size="lg" variant="secondary" icon={RotateCcw} onClick={startCam}>Try again</Button>
        ) : (
          <Button size="lg" icon={Camera} disabled={!st.ready} onClick={take}>Take selfie</Button>
        )}
      </div>
    </div>
  );
}

/** Clock-in waits until the site pack for this venue is read and signed */
function PackCard({ venueId, venue, pack }) {
  const why = pack?.status === 'resign' ? 'Something has changed in the instructions or procedures since you signed.'
    : pack?.status === 'refresher' ? 'You have not worked here for over six months, so the pack needs reading again.'
      : `Before your first shift at ${venue || 'this venue'}, read the instructions and procedures and sign them.`;
  return (
    <section className="rounded-tile bg-amber-soft p-5 shadow-tile">
      <div className="flex items-start gap-3">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-amber text-white"><BookOpen size={22} /></div>
        <div className="min-w-0">
          <h2 className="text-headline font-bold">Sign the site pack to clock in</h2>
          <p className="mt-0.5 text-subhead text-ink/80">{why}{pack?.to_read ? ` ${pack.to_read} document${pack.to_read === 1 ? '' : 's'} to read.` : ''}</p>
        </div>
      </div>
      <Button size="lg" icon={BookOpen} className="mt-4 h-14 w-full text-headline" to={`/officer/venue-pack/${venueId}?then=clock`}>Read and sign</Button>
      <p className="mt-2 text-center text-footnote text-muted">Takes a few minutes. You come straight back here afterwards.</p>
    </section>
  );
}
