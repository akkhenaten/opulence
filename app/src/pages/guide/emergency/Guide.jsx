import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { HOME, useAuth } from '../../../auth.jsx';
import { Spinner, useApi } from '../../../ui/index.jsx';
import { CARDS, SCREENS } from './screens.js';
import Screen, { Art } from './Screen.jsx';

// The Emergency guide (Knife attack journey). Draft clinical copy: shown only to whoever the platform admin allows.
// Three controls sit on every screen and never move: I'm in danger (top), Call 999 and Police arriving (bottom).
const KEY = 'orb.eg';
const fresh = () => ({ path: [], interruptions: 0, firstCall: null, resume: null, venue: 'home', from: null });
const load = () => { try { return { ...fresh(), ...JSON.parse(sessionStorage.getItem(KEY) || '{}') }; } catch { return fresh(); } };

export default function Guide() {
  const { user, ready } = useAuth();
  const s = useApi('settings.get', {}, { skip: !user });
  if (!ready || (user && !s.data && !s.error)) return <Spinner className="min-h-dvh" />;
  if (!user) return <Navigate to="/login" replace />;
  if (!s.data?.emergency_visible) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="space-y-2">
          <div className="text-headline font-bold">Not available yet</div>
          <p className="text-subhead text-muted">The Emergency guide is still being reviewed.</p>
          <Link to={HOME[user.role]} className="text-subhead font-semibold text-blue">Back to the app</Link>
        </div>
      </div>
    );
  }
  return <Journey user={user} />;
}

function Journey({ user }) {
  const { screen = 'S00' } = useParams();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [st, setSt] = useState(() => { const x = load(); if (sp.get('from')) x.from = sp.get('from'); return x; });
  const [overlay, setOverlay] = useState(null); // 'call' | 'danger' | 'notes' | null
  const [note, setNote] = useState('');
  const prev = useRef(null);
  const id = screen === 'S00' || SCREENS[screen] ? screen : 'S00';
  const save = (fn) => setSt((x) => { const n = fn(x); try { sessionStorage.setItem(KEY, JSON.stringify(n)); } catch { /* private mode */ } return n; });

  // Keep our own path of screens, so "Back" works and the browser back button agrees with it
  useEffect(() => {
    const p = prev.current;
    prev.current = id;
    setNote('');
    if (!p || p === id) return;
    save((x) => (x.path.at(-1) === id ? { ...x, path: x.path.slice(0, -1) } : { ...x, path: [...x.path, p].slice(-50) }));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (to) => { setOverlay(null); if (to !== id) nav(`/guide/emergency/${to}`); };
  const act = (to) => {
    if (to === '@back') return st.path.length ? nav(-1) : go('S00');
    if (to === '@end') { save(fresh); return nav(st.from || HOME[user.role]); }
    if (to === '@resume') return setOverlay(null);
    if (to === '@unwritten') return setNote("This part of the guide hasn't been written yet.");
    if (to === '@dial') {
      save((x) => ({ ...x, firstCall: x.firstCall || new Date().toISOString() }));
      // Only ever from this explicit tap: nothing in the guide dials by itself
      window.location.href = ['tel', '999'].join(':');
      return undefined;
    }
    return go(to);
  };
  const danger = () => { save((x) => ({ ...x, resume: id, interruptions: x.interruptions + 1 })); setOverlay('danger'); };

  return (
    <div className="eg">
      <button type="button" className="eg-danger" onClick={danger}>I'm in danger</button>
      <div className="eg-draft">Draft — not clinically approved. Do not use in a real emergency.</div>
      {id === 'S00'
        ? <Opening platform={user.platform} onPick={go} onNotes={() => setOverlay('notes')} />
        : <Screen key={id} s={SCREENS[id]} st={st} note={note} onAct={act} onVenue={(v) => save((x) => ({ ...x, venue: v }))} />}
      <div className="eg-bottom">
        <button type="button" className="eg-btn eg-outline" onClick={() => setOverlay('call')}>Call 999</button>
        <button type="button" className="eg-btn eg-outline" onClick={() => go('K10')}>Police arriving</button>
      </div>
      {overlay === 'call' && <Overlay s={SCREENS['G-CALL']} title="Call 999" big="999" onAct={act} onClose={() => setOverlay(null)} />}
      {overlay === 'danger' && <Overlay s={SCREENS['G-DANGER']} title={SCREENS['G-DANGER'].title} big={SCREENS['G-DANGER'].text} onAct={act} onClose={() => setOverlay(null)} />}
      {overlay === 'notes' && <ReviewNotes onClose={() => setOverlay(null)} />}
    </div>
  );
}

function Opening({ platform, onPick, onNotes }) {
  return (
    <div className="eg-scroll">
      <div className="eg-body">
        <div className="eg-title">Emergency guide</div>
        <p className="eg-text eg-t19">Choose the situation.</p>
        <div className="eg-cards">
          {CARDS.map((c) => (
            <button key={c.key} type="button" className="eg-card" disabled={!c.to} onClick={() => c.to && onPick(c.to)}>
              <Art file={c.art} className="eg-card-art" />
              <span className="eg-card-label">{c.title}</span>
              {!c.to && <span className="eg-card-soon">Not written yet</span>}
            </button>
          ))}
        </div>
        {platform && <button type="button" className="eg-link" onClick={onNotes}>Review notes (platform admin)</button>}
      </div>
    </div>
  );
}

/** G-CALL and G-DANGER are drawn over the journey, never added to the history, so closing them keeps the screen */
function Overlay({ s, title, big, onAct, onClose }) {
  return (
    <div className="eg-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="eg-overlay-panel">
        <div className="eg-title">{title}</div>
        <div className="eg-big">{big}</div>
        <div className="eg-actions">
          {s.buttons.map((b, i) => <button key={b.label} type="button" className={`eg-btn ${i ? 'eg-outline' : 'eg-primary'}`} onClick={() => onAct(b.to)}>{b.label}</button>)}
          {!s.buttons.some((b) => b.to === '@resume') && <button type="button" className="eg-btn eg-outline" onClick={onClose}>Close</button>}
        </div>
      </div>
    </div>
  );
}

// For the reviewer: open items from the handover pack's own review, so nobody mistakes the draft for finished copy
const NOTES = [
  'All wording is draft clinical copy. Ten illustrations need clinical review (bleeding, unresponsive, handover, the four injury types).',
  'K12 says you do not need to stay, then asks you to stay. It needs one sentence from whoever owns duty of care.',
  'K05 is a long run of seven things to remember. Should it be a list or a checklist?',
  'K07: the heading counts people hurt, the wording counts people who need help.',
  'X05 has four buttons right after a 999 call; "Tell police" repeats the Call button.',
  'K10 links back into helping (Before you help) while armed police arrive. Clinical call.',
  'M03: scope not decided. All four drafted injuries are shown for review; "outside what this guide covers" has no destination yet.',
  'M02 is long and scrolls (accepted, with the "More steps below" hint).',
  'C03 is 7 taps from K01 and only leads back to C02.',
  'The call follow-ups G-CALL → X05 and X05 → X06 were added without clinical input.',
];
function ReviewNotes({ onClose }) {
  return (
    <div className="eg-overlay" role="dialog" aria-modal="true" aria-label="Review notes">
      <div className="eg-overlay-panel eg-notes">
        <div className="eg-title">Review notes</div>
        <ul>{NOTES.map((n) => <li key={n}>{n}</li>)}</ul>
        <div className="eg-actions"><button type="button" className="eg-btn eg-primary" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}
