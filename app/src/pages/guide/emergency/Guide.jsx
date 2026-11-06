import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Home } from 'lucide-react';
import { HOME, useAuth } from '../../../auth.jsx';
import { Spinner, useApi } from '../../../ui/index.jsx';
import { CARDS, SCREENS } from './journeys.js';
import Screen, { Art } from './Screen.jsx';

// The Emergency guide: the Knife attack journey from the pack, plus AI-drafted journeys for the other situations. Draft copy: shown only to whoever the platform admin allows.
// Controls on every screen that never move: I'm in danger, Back and Start (top), Call 999 and Police arriving (bottom).
const KEY = 'orb.eg';
const fresh = () => ({ interruptions: 0, firstCall: null, resume: null, venue: 'home', from: null });
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
  const loc = useLocation();
  const nav = useNavigate();
  const [st, setSt] = useState(load);
  const [overlay, setOverlay] = useState(null); // 'call' | 'danger' | 'notes' | null
  const id = screen === 'S00' || SCREENS[screen] ? screen : 'S00';
  const save = (fn) => setSt((x) => { const n = fn(x); try { sessionStorage.setItem(KEY, JSON.stringify(n)); } catch { /* private mode */ } return n; });
  // Where Leave guide and End return to, kept from the moment the guide opens
  useEffect(() => { const from = sp.get('from'); if (from) save((x) => ({ ...x, from })); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Each move inside the guide marks its history entry, so Back steps one screen and never leaves the guide by accident
  const go = (to) => { setOverlay(null); if (to !== id) nav(`/guide/emergency/${to}`, { state: { eg: true } }); };
  const back = () => (loc.state?.eg ? nav(-1) : nav('/guide/emergency/S00', { replace: true, state: null }));
  const leave = () => nav(st.from || HOME[user.role]);
  const act = (to) => {
    if (to === '@back') return back();
    if (to === '@end') { const from = st.from; save(fresh); return nav(from || HOME[user.role]); }
    if (to === '@resume') return setOverlay(null);
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
      <div className="eg-nav">
        {id === 'S00'
          ? <button type="button" className="eg-navbtn" onClick={leave}><ChevronLeft size={20} /> Leave guide</button>
          : <>
            <button type="button" className="eg-navbtn" onClick={back}><ChevronLeft size={20} /> Back</button>
            <button type="button" className="eg-navbtn" onClick={() => go('S00')}><Home size={18} /> Start</button>
          </>}
      </div>
      {id === 'S00'
        ? <Opening platform={user.platform} onPick={go} onNotes={() => setOverlay('notes')} />
        : <Screen key={id} s={SCREENS[id]} st={st} onAct={act} onVenue={(v) => save((x) => ({ ...x, venue: v }))} />}
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
              {c.aiDraft && <span className="eg-card-soon">AI draft, for review</span>}
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
  'Firearms, Vehicle, Explosion, Unattended item, Suspicious item, Multiple casualties and Help an injured person are AI drafts, not from the handover pack. Every line needs review; they link into the Knife screens for calling, casualties, police arriving and aftercare.',
  "AI drafts: I'm in danger still leads to the Knife K01 (Get yourself safe), and Police arriving to K10, from every journey.",
  'AI drafts: Unattended and Suspicious item say not to use a phone or radio close to the item. Confirm the distance wording with whoever owns the venue procedures.',
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
