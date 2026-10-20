import { useEffect, useState } from 'react';
import { BellRing, Smartphone } from 'lucide-react';
import { api } from '../../api.js';
import { Button, Load, Sheet, Toggle, useAction, useApi, useToast } from '../../ui/index.jsx';

const KINDS = [
  { key: 'mention', label: 'Someone mentions me', hint: 'In an Everyday post or comment' },
  { key: 'comment', label: 'Comments on my posts' },
  { key: 'reaction', label: 'Reactions to my posts', hint: 'One summary a day' },
  { key: 'announcement', label: 'Announcements from managers' },
  { key: 'training', label: 'Training reminders', hint: 'New courses, due dates and certificates' },
];

const b64 = (s) => {
  const raw = atob((s + '='.repeat((4 - (s.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

async function currentSub() {
  if (!supported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/app/');
  return reg ? reg.pushManager.getSubscription() : null;
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
  const turnOn = () => run(async () => {
    if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications are blocked — allow them for Orb in your phone or browser settings.');
    const reg = (await navigator.serviceWorker.getRegistration('/app/')) || (await navigator.serviceWorker.register('/app/sw.js', { scope: '/app/' }));
    await navigator.serviceWorker.ready;
    const { key } = await api('push.publicKey');
    const s = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(key) });
    await api('push.subscribe', { subscription: s.toJSON() });
    setSub(s);
  }, 'Phone notifications are on').catch(() => {});
  const turnOff = () => run(async () => {
    if (sub) { await api('push.unsubscribe', { endpoint: sub.endpoint }); await sub.unsubscribe(); }
    setSub(null);
  }, 'Phone notifications are off on this device').catch(() => {});

  const needsHomeScreen = isIOS() && !standalone();
  return (
    <Sheet open={open} onClose={onClose} title="Notifications" size="sm">
      <div className="mb-5 rounded-2xl bg-bg p-4">
        <div className="mb-1 flex items-center gap-2 text-[15px] font-semibold"><Smartphone size={18} /> Phone notifications</div>
        {needsHomeScreen ? (
          <p className="text-[14px] text-muted">On iPhone, first add Orb to your home screen: tap Share, then “Add to Home Screen”. Open Orb from the new icon and turn this on.</p>
        ) : !supported() ? (
          <p className="text-[14px] text-muted">This browser can't show phone notifications. You'll still see everything under the bell.</p>
        ) : sub ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-[14px] text-muted">On for this device.</p>
            <Button size="sm" variant="secondary" busy={busy} onClick={turnOff}>Turn off</Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[14px] text-muted">Get notices on this device even when Orb is closed.</p>
            <Button size="sm" icon={BellRing} busy={busy} onClick={turnOn}>Turn on phone notifications</Button>
          </div>
        )}
      </div>
      <Load q={q}>
        {() => prefs && (
          <div className="space-y-4">
            <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">Tell me about</div>
            {KINDS.map((k) => <Toggle key={k.key} checked={prefs[k.key] !== false} onChange={flip(k.key)} label={k.label} hint={k.hint} />)}
            <p className="text-[13px] text-muted">Shifts, cover, pay and safety alerts always come through.</p>
          </div>
        )}
      </Load>
    </Sheet>
  );
}
