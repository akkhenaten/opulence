import { useEffect, useState, useSyncExternalStore } from 'react';
import { Download, Share, SquarePlus, WifiOff, X } from 'lucide-react';
import { Button, IconButton, Sheet, Tile, useToast } from './index.jsx';

// Installing the app on a phone or computer (PWA), offline state and "new version" prompt.
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
export const standalone = () => window.matchMedia('(display-mode: standalone)').matches || !!navigator.standalone;

// Chrome / Edge / Android fire this early, often before React mounts: keep it at module level
let deferred = null;
const subs = new Set();
const emit = () => subs.forEach((f) => f());
if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; emit(); });
  window.addEventListener('appinstalled', () => { deferred = null; emit(); });
}
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };

export function usePwa() {
  const prompt = useSyncExternalStore(subscribe, () => deferred);
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);
  const install = async () => {
    if (!deferred) return false;
    const e = deferred;
    deferred = null;
    emit();
    await e.prompt();
    return (await e.userChoice)?.outcome === 'accepted';
  };
  // canInstall: one-tap install (Android / desktop Chrome); ios: show the Share steps instead
  return { installed: standalone(), canInstall: !!prompt, ios: isIOS(), online, install };
}

const DISMISS_KEY = 'orb-install-dismissed';
const DISMISS_DAYS = 30;
const dismissedRecently = () => Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < DISMISS_DAYS * 864e5;

function IosSteps() {
  return (
    <ol className="space-y-2 text-subhead">
      <li className="flex items-center gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-soft text-caption font-bold text-blue">1</span>Open this page in <b>Safari</b></li>
      <li className="flex items-center gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-soft text-caption font-bold text-blue">2</span>Tap <Share size={16} className="text-blue" aria-label="Share" /> <b>Share</b> at the bottom of the screen</li>
      <li className="flex items-center gap-2"><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-blue-soft text-caption font-bold text-blue">3</span>Choose <SquarePlus size={16} className="text-blue" aria-hidden /> <b>Add to Home Screen</b>, then <b>Add</b></li>
    </ol>
  );
}

// What the install card and sheet say for this device
function InstallBody({ pwa, onInstalled }) {
  const toast = useToast();
  if (pwa.installed) return <p className="text-subhead text-muted">The app is installed on this device. Open it from your home screen.</p>;
  if (pwa.ios) return <><p className="mb-3 text-subhead text-muted">Add Orb to your home screen to open it full screen and get phone notifications.</p><IosSteps /></>;
  if (pwa.canInstall) {
    return (
      <>
        <p className="mb-3 text-subhead text-muted">Install Orb to open it from your home screen or desktop, full screen, like any other app.</p>
        <Button icon={Download} onClick={async () => { if (await pwa.install()) { toast('Orb is installed'); onInstalled?.(); } }}>Install the app</Button>
      </>
    );
  }
  return <p className="text-subhead text-muted">Open this page in Chrome or Edge (Android, Windows, Mac) or Safari (iPhone, iPad), then use the browser menu: <b>Install app</b> or <b>Add to Home Screen</b>.</p>;
}

/** Dashboard card: shown only in a browser tab, where installing is possible, until dismissed for 30 days */
export function InstallCard({ className }) {
  const pwa = usePwa();
  const [hidden, setHidden] = useState(dismissedRecently);
  if (pwa.installed || hidden || !(pwa.canInstall || pwa.ios)) return null;
  const dismiss = () => { localStorage.setItem(DISMISS_KEY, String(Date.now())); setHidden(true); };
  return (
    <Tile title="Get the Orb app" icon={Download} className={className} action={<IconButton icon={X} label="Not now" onClick={dismiss} />}>
      <InstallBody pwa={pwa} onInstalled={dismiss} />
    </Tile>
  );
}

/** Same help on demand, from the account menu or the officer's Me page */
export function InstallSheet({ open, onClose }) {
  const pwa = usePwa();
  return (
    <Sheet open={open} onClose={onClose} title="Install the app" size="sm">
      <InstallBody pwa={pwa} onInstalled={onClose} />
    </Sheet>
  );
}

/** Banner under the top bar while the device has no connection */
export function OfflineBanner() {
  const { online } = usePwa();
  if (online) return null;
  return (
    <div role="status" className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 flex items-center justify-center gap-2 bg-amber py-2 text-center text-footnote font-semibold text-white [--px:1rem] safe-x">
      <WifiOff size={16} /> You're offline — changes will not be saved until you're back online
    </div>
  );
}

/** "New version available" toast after a release, when a new service worker takes over an open app */
export function useUpdateToast() {
  const toast = useToast();
  useEffect(() => {
    const show = () => toast('A new version of Orb is available', 'info', { action: { label: 'Refresh', onClick: () => window.location.reload() }, duration: 60000 });
    window.addEventListener('orb:update', show);
    return () => window.removeEventListener('orb:update', show);
  }, [toast]);
}
