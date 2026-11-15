import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Bug, ImagePlus, Lightbulb, MessageCircleWarning, X } from 'lucide-react';
import { api, upload } from '../api.js';
import { useAuth } from '../auth.jsx';
import { compressImage } from '../pages/officer/_parts.jsx';
import { ROLE_LABEL } from '../layouts/nav.js';
import { Button, cx, Empty, IconButton, Load, Pill, relative, Sheet, Textarea, useAction, useApi } from './index.jsx';
import { Lightbox } from './Lightbox.jsx';

// Problems and ideas about the app itself, for the platform admin. Temporary while the app settles in.
export const STATUS = {
  new: { label: 'New', tone: 'grey' },
  looking: { label: 'Looking at it', tone: 'blue' },
  planned: { label: 'Planned', tone: 'amber' },
  fixed: { label: 'Fixed', tone: 'green' },
  not_now: { label: 'Not now', tone: 'grey' },
};
export const KIND = {
  problem: { label: "Something's wrong", short: 'Problem', icon: Bug, tone: 'text-red bg-red-soft', ask: 'What happened? What did you expect?' },
  idea: { label: 'I have an idea', short: 'Idea', icon: Lightbulb, tone: 'text-amber bg-amber-soft', ask: 'What would make it better?' },
};
export const MAX = 2000;
// Stamped at build time, so a report says which release it came from
export const APP_BUILD = typeof __APP_BUILD__ === 'undefined' ? 'dev' : __APP_BUILD__;

/** Opens the Feedback sheet from anywhere (top bar, My account, Me). view: 'send' | 'mine' */
export const openFeedback = (view = 'send') => window.dispatchEvent(new CustomEvent('orb:feedback', { detail: view }));

export function deviceLine() {
  const ua = navigator.userAgent;
  const os = /iPhone|iPad/.test(ua) ? (/iPad/.test(ua) ? 'iPad' : 'iPhone') : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Other';
  const br = /Edg\//.test(ua) ? 'Edge' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const app = window.matchMedia('(display-mode: standalone)').matches ? ', installed app' : '';
  return `${os}, ${br}${app}, ${window.innerWidth}×${window.innerHeight}`;
}

/** The glowing chip in the top bar, next to the bell (the rainbow ring keeps it apart from the venue Feedback page) */
export function FeedbackChip() {
  return (
    <span className="hidden sm:block"><span className="fb-glow"><Button variant="secondary" size="sm" icon={MessageCircleWarning} onClick={() => openFeedback()}>App feedback</Button></span></span>
  );
}
/** Phones: just the icon, so the top bar stays tidy */
export function FeedbackIcon() {
  return <span className="sm:hidden"><span className="fb-glow"><IconButton icon={MessageCircleWarning} tone="solid" onClick={() => openFeedback()} label="Report an app problem or idea" /></span></span>;
}

/** Mounted once in the app frame; listens for openFeedback() and ?feedback=mine (from a reply notification) */
export function AppFeedbackSheet() {
  const [view, setView] = useState(null);
  const [sp, setSp] = useSearchParams();
  useEffect(() => {
    const h = (e) => setView(e.detail || 'send');
    window.addEventListener('orb:feedback', h);
    return () => window.removeEventListener('orb:feedback', h);
  }, []);
  useEffect(() => {
    if (sp.get('feedback') !== 'mine') return;
    setView('mine');
    const next = new URLSearchParams(sp);
    next.delete('feedback');
    setSp(next, { replace: true });
  }, [sp, setSp]);
  const close = () => setView(null);
  return (
    <Sheet open={!!view} onClose={close} title={view === 'mine' ? 'My feedback' : 'Report an app problem or idea'} size="sm">
      {view === 'mine' ? <Mine onSend={() => setView('send')} /> : view ? <SendForm onMine={() => setView('mine')} onClose={close} /> : null}
    </Sheet>
  );
}

function SendForm({ onMine, onClose }) {
  const { user } = useAuth();
  const { pathname, search } = useLocation();
  const [kind, setKind] = useState(null);
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState([]);
  const [sent, setSent] = useState(false);
  const [run, busy] = useAction();
  const file = useRef(null);
  const page = pathname + search.replace(/[?&]feedback=mine/, '');
  const device = deviceLine();
  const add = (e) => {
    const list = [...(e.target.files || [])].filter((f) => f.type.startsWith('image/')).slice(0, 3 - photos.length);
    e.target.value = '';
    setPhotos((p) => [...p, ...list.map((f) => ({ file: f, url: URL.createObjectURL(f) }))]);
  };
  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps
  const send = () => run(async () => {
    const keys = await Promise.all(photos.map(async (p) => {
      const small = await compressImage(p.file, 1600, 0.82);
      return { key: await upload(small, 'feedback'), name: small.name, mime: small.type };
    }));
    await api('appFeedback.send', { kind, body, page, device, app_version: APP_BUILD, photos: keys });
    setSent(true);
  }).catch(() => {});

  if (sent) {
    return (
      <div className="space-y-4 py-4 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-green-soft text-green"><MessageCircleWarning size={24} /></div>
        <div>
          <div className="text-headline font-bold">Thanks — it's gone to the Orb team.</div>
          <div className="mt-1 text-subhead text-muted">You'll see the reply and when it's fixed in My feedback.</div>
        </div>
        <div className="flex justify-center gap-2">
          <Button variant="secondary" onClick={onMine}>My feedback</Button>
          <Button onClick={() => { setSent(false); setKind(null); setBody(''); setPhotos([]); }}>Send another</Button>
        </div>
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(KIND).map(([k, d]) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
            className={cx('pressable flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-2xl border-2 p-3 text-center text-subhead font-semibold',
              kind === k ? 'border-blue bg-blue-soft text-ink' : 'border-hairline bg-surface text-ink')}>
            <span className={cx('grid h-9 w-9 place-items-center rounded-full', d.tone)}><d.icon size={20} /></span>{d.label}
          </button>
        ))}
      </div>
      {kind && (
        <>
          <Textarea label={KIND[kind].ask} value={body} onChange={(e) => setBody(e.target.value.slice(0, MAX))} autoGrow minRows={4} autoFocus
            hint={`${body.length.toLocaleString()} / ${MAX.toLocaleString()}`} />
          <div className="flex flex-wrap items-center gap-2">
            {photos.map((p, i) => (
              <span key={p.url} className="relative">
                <img src={p.url} alt={`Photo ${i + 1}`} className="h-16 w-16 rounded-xl object-cover ring-1 ring-hairline" />
                <button type="button" aria-label="Remove photo" onClick={() => setPhotos((x) => x.filter((_, j) => j !== i))}
                  className="pressable absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-ink text-white before:absolute before:-inset-2.5"><X size={14} /></button>
              </span>
            ))}
            {photos.length < 3 && <Button variant="secondary" size="sm" icon={ImagePlus} onClick={() => file.current?.click()}>{photos.length ? 'Add another' : 'Add screenshot or photo'}</Button>}
            <input ref={file} type="file" accept="image/*" multiple className="hidden" onChange={add} />
          </div>
          <div className="rounded-xl bg-fill px-3 py-2 text-caption text-muted">
            Sent with: {page} · {device} · {APP_BUILD} · {user.name} ({ROLE_LABEL[user.role]})
          </div>
          <div className="flex items-center justify-between gap-2">
            <Button variant="link" size="sm" onClick={onMine}>My feedback</Button>
            <Button busy={busy} disabled={!body.trim()} onClick={send}>Send</Button>
          </div>
        </>
      )}
      {!kind && <div className="text-center"><Button variant="link" size="sm" onClick={onMine}>See what I've sent</Button></div>}
    </div>
  );
}

function Mine({ onSend }) {
  const q = useApi('appFeedback.mine', {});
  const [shown, setShown] = useState(null);
  return (
    <Load q={q} n={3}>
      {(d) => !d.items.length ? (
        <Empty icon={MessageCircleWarning} title="Nothing sent yet" body="Tell us about anything that's wrong or could be better." action={d.on && <Button onClick={onSend}>Report a problem or idea</Button>} />
      ) : (
        <div className="space-y-3">
          {d.on && <Button variant="secondary" className="w-full" icon={MessageCircleWarning} onClick={onSend}>Send more feedback</Button>}
          {d.items.map((f) => {
            const K = KIND[f.kind];
            return (
              <div key={f.id} className="rounded-2xl border border-hairline bg-surface p-3">
                <div className="flex items-center gap-2">
                  <span className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-full', K.tone)}><K.icon size={14} /></span>
                  <span className="flex-1 text-footnote text-muted">{K.short} · {relative(f.created_at)}</span>
                  <Pill tone={STATUS[f.status].tone}>{STATUS[f.status].label}</Pill>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-subhead">{f.body}</p>
                {f.photos.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    {f.photos.map((p, i) => (
                      <button key={p.url} type="button" aria-label={`Open photo ${i + 1}`} onClick={() => setShown({ photos: f.photos, i })} className="pressable rounded-xl">
                        <img src={p.url} alt="" className="h-14 w-14 rounded-xl object-cover ring-1 ring-hairline" />
                      </button>
                    ))}
                  </div>
                )}
                {f.reply && (
                  <div className="mt-3 rounded-xl bg-blue-soft px-3 py-2">
                    <div className="text-caption font-semibold text-blue">Reply from the Orb team · {relative(f.replied_at)}</div>
                    <p className="mt-0.5 whitespace-pre-wrap text-subhead">{f.reply}</p>
                  </div>
                )}
              </div>
            );
          })}
          <Lightbox photos={shown?.photos || []} index={shown ? shown.i : null} onClose={() => setShown(null)} />
        </div>
      )}
    </Load>
  );
}

/** For the platform admin's notification and email links: /app/my-feedback opens My feedback in their own portal */
export function MyFeedbackLink({ home }) {
  const nav = useNavigate();
  useEffect(() => { nav(`${home}?feedback=mine`, { replace: true }); }, [home, nav]);
  return null;
}
