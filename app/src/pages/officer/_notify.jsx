import { useEffect, useState } from 'react';
import { BellRing, Smartphone, X } from 'lucide-react';
import { api } from '../../api.js';
import { Button, IconButton, Load, Sheet, Tile, Toggle, useAction, useApi, useToast } from '../../ui/index.jsx';
import { installCardShowing, isIOS, standalone } from '../../ui/pwa.jsx';

export const NOTIFY_KINDS = [
  { key: 'mention', label: 'Someone mentions me', hint: 'In an Everyday post or comment' },
  { key: 'comment', label: 'Comments on my posts' },
  { key: 'reaction', label: 'Reactions to my posts', hint: 'One summary a day' },
  { key: 'announcement', label: 'Announcements from managers' },
  { key: 'training', label: 'Training reminders', hint: 'New courses, due dates and certificates' },
  { key: 'shoutout', label: 'Shout-outs for me', hint: 'When a colleague thanks you on Everyday' },
  { key: 'tag', label: 'Someone tags me in a post' },
  { key: 'event', label: 'Team events', hint: 'Reminders for events you said you\'d go to, and changes' },
  { key: 'celebration', label: 'Celebrations about me', hint: 'Birthdays, anniversaries and qualifications' },
];

const b64 = (s) => {
  const raw = atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function currentSub() {
  if (!supported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/app/');
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Ask the browser, subscribe this device and save it: the new subscription */
async function enablePush() {
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are blocked — allow them for Orb in your phone or browser settings.');
  const reg = (await navigator.serviceWorker.getRegistration('/app/')) || (await navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' }));
  await navigator.serviceWorker.ready;
  const { key } = await api('push.publicKey');
  const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
  await api('push.subscribe', { subscription: s.toJSON() });
  return s;
}

const PUSH_LATER_KEY = 'orb-push-later';
const PUSH_LATER_DAYS = 7;

/** Home card on every side until this device gets phone notifications. "Not now" hides it for a week on this device.
 *  On iPhone, push needs the home-screen app: while the install card is up, that card covers it. */
export function PushCard({ className, later }) {
  const toast = useToast();
  const [run, busy] = useAction();
  const [state, setState] = useState('checking');
  const [hidden, setHidden] = useState(() => Date.now() - Number(localStorage.getItem(PUSH_LATER_KEY) || 0) < PUSH_LATER_DAYS * 864e5);
  useEffect(() => {
    if (hidden) return;
    const ios = isIOS() && !standalone();
    if (ios) { setState(installCardShowing() ? 'none' : 'ios'); return; }
    if (!supported()) { setState('none'); return; }
    currentSub().then((s) => setState(s ? 'none' : Notification.permission === 'denied' ? 'blocked' : 'ask')).catch(() => setState('none'));
  }, [hidden]);
  if (hidden || state === 'checking' || state === 'none') return null;
  const notNow = () => { localStorage.setItem(PUSH_LATER_KEY, String(Date.now())); setHidden(true); if (later) toast(`Hidden for a week. Turn them on any time from ${later} → Notifications.`, 'info'); };
  const turnOn = () => run(enablePush, 'Phone notifications are on').then(() => setState('none')).catch(() => { if (Notification.permission === 'denied') setState('blocked'); });
  return (
    <Tile title="Turn on notifications" icon={BellRing} className={className} action={<IconButton icon={X} label="Not now" onClick={notNow} />}>
      {state === 'ios' ? (
        <p className="text-subhead text-muted">On iPhone, notifications only work from the home-screen app. Tap <b>Share</b>, then <b>Add to Home Screen</b>, open Orb from the new icon and turn them on there.</p>
      ) : state === 'blocked' ? (
        <p className="text-subhead text-muted">Notifications are blocked for Orb on this device. Allow them in your phone or browser settings (Site settings → Notifications), then come back here.</p>
      ) : (
        <>
          <p className="mb-3 text-subhead text-muted">Get shift offers, changes and safety alerts on this device straight away, even when Orb is closed.</p>
          <Button icon={BellRing} busy={busy} onClick={turnOn}>Turn on notifications</Button>
        </>
      )}
    </Tile>
  );
}

/** Which notices to get, and phone (push) notifications for this device. Shift and safety alerts always come. */
export function NotificationsSheet({ open, onClose }) {
  const q = useApi('notifications.prefs.get', {}, { skip: !open });
  const toast = useToast();
  const [prefs, setPrefs] = useState(null);
  const [sub, setSub] = useState(null);
  const [run, busy] = useAction();
  useEffect(() => { if (q.data) setPrefs(q.data.prefs); }, [q.data]);
  useEffect(() => { if (open) currentSub().then(setSub).catch(() => setSub(null)); }, [open]);

  const flip = (k) => (v) => {
    setPrefs((p) => ({ ...p, [k]: v }));
    api('notifications.prefs.save', { prefs: { [k]: v } }).catch((e) => { setPrefs((p) => ({ ...p, [k]: !v })); toast(e.message, 'error'); });
  };
  const turnOn = () => run(async () => setSub(await enablePush()), 'Phone notifications are on').catch(() => {});
  const turnOff = () => run(async () => {
    if (sub) { await api('push.unsubscribe', { endpoint: sub.endpoint }); await sub.unsubscribe(); }
    setSub(null);
  }, 'Phone notifications are off on this device').catch(() => {});

  const needsHomeScreen = isIOS() && !standalone();
  return (
    <Sheet open={open} onClose={onClose} title="Notifications" size="sm">
      <div className="mb-5 rounded-2xl bg-bg p-4">
        <div className="mb-1 flex items-center gap-2 text-body font-semibold"><Smartphone size={18} /> Phone notifications</div>
        {needsHomeScreen ? (
          <p className="text-subhead text-muted">On iPhone, first add Orb to your home screen: tap Share, then “Add to Home Screen”. Open Orb from the new icon and turn this on.</p>
        ) : !supported() ? (
          <p className="text-subhead text-muted">This browser can't show phone notifications. You'll still see everything under the bell.</p>
        ) : sub ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-subhead text-muted">On for this device.</p>
            <Button size="sm" variant="secondary" busy={busy} onClick={turnOff}>Turn off</Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-subhead text-muted">Get notices on this device even when Orb is closed.</p>
            <Button size="sm" icon={BellRing} busy={busy} onClick={turnOn}>Turn on phone notifications</Button>
          </div>
        )}
      </div>
      <Load q={q} skeleton="rows">
        {() => prefs && (
          <div className="space-y-4">
            <div className="text-footnote font-semibold uppercase tracking-wide text-muted">Tell me about</div>
            {NOTIFY_KINDS.map((k) => <Toggle key={k.key} checked={prefs[k.key] !== false} onChange={flip(k.key)} label={k.label} hint={k.hint} />)}
            <p className="text-footnote text-muted">Shifts, cover, pay and safety alerts always come through.</p>
          </div>
        )}
      </Load>
      {open && <EverydayPrefs />}
    </Sheet>
  );
}

/** What Everyday may post about me */
function EverydayPrefs() {
  const q = useApi('everyday.prefs', {});
  const toast = useToast();
  const [p, setP] = useState(null);
  useEffect(() => { if (q.data) setP(q.data); }, [q.data]);
  if (!p) return null;
  const flip = (k) => (v) => {
    setP((x) => ({ ...x, [k]: v }));
    api('everyday.prefs', { set: { [k]: v } }).catch((e) => { setP((x) => ({ ...x, [k]: !v })); toast(e.message, 'error'); });
  };
  return (
    <div className="mt-6 space-y-4">
      <div className="text-footnote font-semibold uppercase tracking-wide text-muted">On Everyday</div>
      <Toggle checked={p.birthday} onChange={flip('birthday')} label="Celebrate my birthday on Everyday" hint="Only the day and month are shown, never your age" />
      <Toggle checked={p.welcome} onChange={flip('welcome')} label="Welcome post when I start" hint="A short hello to the team in your first two weeks" />
    </div>
  );
}
