import { useState } from 'react';
import { CheckCircle2, Smartphone } from 'lucide-react';
import { api } from '../../api.js';
import { createPasskey, passkeySupported } from '../../lib/passkey.js';
import { Button, cx, Load, Sheet, Tile, useApi } from '../../ui/index.jsx';
import { isIOS } from '../../ui/pwa.jsx';

// The officer's clock-in phone: registering it (a passkey unlocked by face, fingerprint or PIN), from clock-in, Home or Profile

// One wording everywhere a phone waits for a manager, and one line on what the phone is for
export const PHONE_PENDING = 'Waiting for approval';
export const PHONE_NOTE = "Your clock-in phone only proves where you clocked in. It doesn't affect whether you can work.";

/** A phone or tablet: a laptop must not become the clock-in device */
export const isPhone = () => isIOS() || /android|iphone|ipod|mobile/i.test(navigator.userAgent) || !!navigator.userAgentData?.mobile;

function Head({ title, body }) {
  return (
    <div className="mb-4">
      <h2 className="display text-title2 font-bold">{title}</h2>
      {body && <p className="mt-1 text-subhead text-muted">{body}</p>}
    </div>
  );
}

/** The register screen. onSkip (clock-in only) offers to carry on without the phone check when registering fails. */
export function RegisterStep({ onDone, onSkip, onCancel, bare }) {
  const [st, setSt] = useState({});
  const ok = passkeySupported();
  const go = async () => {
    setSt({ busy: true });
    try {
      const o = await api('device.registerOptions');
      const credential = await createPasskey(o);
      const d = await api('device.register', { credential });
      if (d.status === 'pending') setSt({ pending: true });
      else onDone(d.status);
    } catch (e) {
      setSt({ error: e.message });
    }
  };
  const skip = onSkip && !st.pending && (st.error || !ok);
  return (
    <section className={cx(!bare && 'rounded-tile bg-surface p-5 shadow-tile')}>
      {!bare && <Head title="Register this phone" body="Your clock-ins are tied to your own phone, so nobody else can clock in for you. Your phone asks for your fingerprint, face or PIN. Orb Security never sees it." />}
      <div className="flex flex-col items-center py-4 text-center">
        <div className={cx('grid h-24 w-24 place-items-center rounded-full', st.error ? 'bg-red-soft text-red' : st.pending ? 'bg-amber-soft text-amber' : 'bg-blue-soft text-blue')}><Smartphone size={42} /></div>
        {!ok && <div className="mt-4 max-w-xs text-body font-semibold text-red">This browser can't register your phone. Use Safari on iPhone or Chrome on Android.</div>}
        {st.error && <div className="mt-4 max-w-xs text-body font-semibold text-red">{st.error}</div>}
        {st.pending && <div className="mt-4 max-w-xs text-body font-semibold">Registered. Because you've used another phone before, a manager must approve this one. Until then your clock-ins are flagged for checking.</div>}
      </div>
      <div className="grid gap-2">
        {st.pending ? <Button size="lg" onClick={() => onDone('pending')}>Continue</Button> : ok && <Button size="lg" icon={Smartphone} busy={st.busy} onClick={go}>{st.error ? 'Try again' : 'Register this phone'}</Button>}
        {skip && <Button size="lg" variant="secondary" disabled={st.busy} onClick={onSkip}>Continue without phone check</Button>}
        {onCancel && <Button variant="ghost" disabled={st.busy} onClick={onCancel}>Cancel</Button>}
      </div>
      {skip && <p className="mt-2 text-center text-caption text-muted">Without the phone check, your clock-in goes to your supervisor to approve.</p>}
    </section>
  );
}

/** On a laptop: a code to open the same screen on the phone */
function OnYourPhone() {
  const q = useApi('device.registerLink', {});
  return (
    <div className="flex flex-col items-center text-center">
      <p className="text-subhead text-muted">Register the phone you clock in with, not this computer. Scan this with your phone's camera, sign in, and tap <b>Register this phone</b>.</p>
      <Load q={q}>{(d) => <img src={d.qr} alt="Code to open phone registration on your phone" className="mt-4 h-48 w-48 rounded-xl border border-line bg-white p-2" />}</Load>
      <p className="mt-3 text-caption text-muted">Or open Orb on your phone and go to Me → Profile → Clock-in phone.</p>
    </div>
  );
}

/** Register from Home or Profile, without clocking in */
export function RegisterPhoneSheet({ open, onClose, onDone }) {
  const [done, setDone] = useState(null);
  const close = () => { onClose(); if (done) { onDone?.(); setTimeout(() => setDone(null), 300); } };
  return (
    <Sheet open={open} onClose={close} title="Register your phone" size="sm"
      footer={done ? <Button onClick={close}>Done</Button> : null}>
      {done ? (
        <div className="flex flex-col items-center py-4 text-center">
          <div className="grid h-24 w-24 place-items-center rounded-full bg-green-soft text-green"><CheckCircle2 size={42} /></div>
          <p className="mt-4 max-w-xs text-body font-semibold">{done === 'pending' ? 'Sent to a manager to approve. You can still clock in meanwhile.' : "Done. You'll use your face, fingerprint or PIN to clock in."}</p>
        </div>
      ) : !isPhone() ? <OnYourPhone /> : (
        <>
          <p className="text-subhead text-muted">It takes a few seconds and you only do it once. Your clock-ins are then tied to this phone, so nobody else can clock in for you. Your phone asks for your face, fingerprint or PIN. Orb never sees it.</p>
          <RegisterStep bare onDone={setDone} />
        </>
      )}
    </Sheet>
  );
}

/** Home: until the officer has a clock-in phone. Amber when a shift starts within 24 hours. */
export function PhoneCard({ soon, className }) {
  const q = useApi('device.mine', {});
  const [open, setOpen] = useState(false);
  if (!q.data) return null;
  const list = q.data.devices;
  // Registered but not approved yet: say so, and that clock-in still works; gone once a manager approves it
  if (list.length && !list.some((d) => d.status === 'active')) {
    return (
      <Tile to="/officer/profile#phone" className={cx(className, 'border-amber/25 !bg-amber-soft')}>
        <div className="flex gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber text-white"><Smartphone size={20} /></span>
          <div className="min-w-0">
            <div className="text-headline font-bold">Clock-in phone {PHONE_PENDING.toLowerCase()}</div>
            <div className="text-subhead text-muted">The office approves it. You can still clock in meanwhile.</div>
          </div>
        </div>
      </Tile>
    );
  }
  if (list.length) return null;
  return (
    <>
      <Tile className={cx(className, soon && 'border-amber/25 !bg-amber-soft')}>
        <div className="flex gap-3">
          <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white', soon ? 'bg-amber' : 'bg-blue')}><Smartphone size={20} /></span>
          <div className="min-w-0">
            <div className="text-headline font-bold">Register your phone for clocking in</div>
            <div className="text-subhead text-muted">{soon ? 'You have a shift soon. Do it now so clocking in at the door is quick.' : 'A one-off that takes a few seconds, with your face, fingerprint or PIN.'}</div>
            <Button size="sm" className="mt-3" icon={Smartphone} onClick={() => setOpen(true)}>Register now</Button>
          </div>
        </div>
      </Tile>
      <RegisterPhoneSheet open={open} onClose={() => setOpen(false)} onDone={q.reload} />
    </>
  );
}
