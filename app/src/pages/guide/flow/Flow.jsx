import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Map as MapIcon, RotateCcw } from 'lucide-react';
import { HOME, useAuth } from '../../../auth.jsx';
import { Spinner, useApi } from '../../../ui/index.jsx';
import { FLOW, SITUATIONS, START, pathTo } from './flow.js';
import { SOURCES } from './sources.js';

// The Emergency flowchart: text-only cards quoting ProtectUK (citizenAID for first aid) word for word, beside the illustrated guide
// so the owner can compare. Each answer stays on screen as a trail step; tapping a step goes back to it.
// Live for everyone on every shift card unless the platform admin takes it offline (settings flow_visible). Nothing here ever dials.
const KEY = 'orb.flow';
const fresh = () => ({ trail: [], at: START, interruptions: 0, firstCall: null, from: null });
const load = () => { try { return { ...fresh(), ...JSON.parse(sessionStorage.getItem(KEY) || '{}') }; } catch { return fresh(); } };

export default function Flow() {
  const { user, ready } = useAuth();
  const s = useApi('settings.get', {}, { skip: !user });
  if (!ready || (user && !s.data && !s.error)) return <Spinner className="min-h-dvh" />;
  if (!user) return <Navigate to="/login" replace />;
  if (!s.data?.flow_visible) return <NotYet home={HOME[user.role]} />;
  return <Chart user={user} />;
}

export function NotYet({ home }) {
  return (
    <div className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="space-y-2">
        <div className="text-headline font-bold">Not available yet</div>
        <p className="text-subhead text-muted">The Emergency flowchart is still being reviewed.</p>
        <Link to={home} className="text-subhead font-semibold text-blue">Back to the app</Link>
      </div>
    </div>
  );
}

function Chart({ user }) {
  const [sp, setSp] = useSearchParams();
  const nav = useNavigate();
  const [st, setSt] = useState(load);
  const [calling, setCalling] = useState(false);
  const cardRef = useRef(null);
  const save = (fn) => setSt((x) => { const n = fn(x); try { sessionStorage.setItem(KEY, JSON.stringify(n)); } catch { /* private mode */ } return n; });

  // ?from= is where Leave returns to; ?card= (from the map) opens a card with the trail rebuilt along the shortest path
  useEffect(() => {
    const from = sp.get('from');
    const card = sp.get('card');
    const trail = card && FLOW[card] ? pathTo(card) : null;
    if (from || trail) save((x) => ({ ...x, ...(from && { from }), ...(trail && { trail, at: card }) }));
    if (from || card) setSp({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const at = FLOW[st.at] ? st.at : START;
  const card = FLOW[at];
  // The situation is the first answer given; I'm in danger goes to its safety card
  const sit = SITUATIONS.find((x) => x.start === st.trail[0]?.to) || SITUATIONS[0];
  // Keep the current card at the top of the scroll, with the trail above it
  useLayoutEffect(() => { cardRef.current?.scrollIntoView({ block: 'start' }); }, [at, st.trail.length]);

  const leave = () => nav(st.from || HOME[user.role]);
  const answer = (a) => {
    if (a.to === '@leave') { const from = st.from; save(fresh); return nav(from || HOME[user.role]); }
    if (a.to === '@start') return save((x) => ({ ...x, trail: [], at: START }));
    return save((x) => ({ ...x, trail: [...x.trail, { id: at, label: a.label, to: a.to }], at: a.to }));
  };
  const rewind = (i) => save((x) => ({ ...x, trail: x.trail.slice(0, i), at: x.trail[i].id }));
  const danger = () => save((x) => ({ ...x, interruptions: x.interruptions + 1, trail: [...x.trail, { id: at, label: "I'm in danger", to: sit.safety, danger: true }], at: sit.safety }));
  const called = () => { save((x) => ({ ...x, firstCall: x.firstCall || new Date().toISOString() })); setCalling(false); };

  return (
    <div className="eg">
      <button type="button" className="eg-danger" onClick={danger}>I'm in danger</button>
      <div className="eg-draft">Draft — not approved. Do not use in a real emergency.</div>
      <div className="eg-nav">
        {at === START && !st.trail.length
          ? <button type="button" className="eg-navbtn" onClick={leave}><ChevronLeft size={20} /> Leave</button>
          : <button type="button" className="eg-navbtn" onClick={() => answer({ to: '@start' })}><RotateCcw size={17} /> Start again</button>}
        {user.platform && <Link to="/guide/flow/map" className="eg-navbtn"><MapIcon size={17} /> Map</Link>}
      </div>
      <div className="eg-scroll">
        {st.trail.length > 0 && (
          <ol className="fl-trail" aria-label="Your answers so far">
            {st.trail.map((t, i) => (
              <li key={i}>
                <button type="button" className={`fl-step ${t.danger ? 'fl-step-danger' : ''}`} onClick={() => rewind(i)} title="Go back to this step">
                  <span className="fl-step-q">{FLOW[t.id]?.title}</span>
                  <span className="fl-step-a">{t.label}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
        <div ref={cardRef} className="fl-card">
          <Card card={card} />
          {at === START && (
            <div className="fl-pick">
              {card.answers.map((a) => <button key={a.to} type="button" className="eg-btn eg-outline fl-pick-btn" onClick={() => answer(a)}>{a.label}</button>)}
            </div>
          )}
        </div>
      </div>
      {at !== START && (
        <div className="eg-actions">
          {card.answers.map((a, i) => <button key={a.label} type="button" className={`eg-btn ${i ? 'eg-outline' : 'eg-primary'}`} onClick={() => answer(a)}>{a.label}</button>)}
        </div>
      )}
      <div className="eg-bottom fl-bottom">
        <button type="button" className="eg-btn eg-outline" onClick={() => setCalling(true)}>Call 999</button>
      </div>
      {calling && (
        <div className="eg-overlay" role="dialog" aria-modal="true" aria-label="Call 999">
          <div className="eg-overlay-panel">
            <div className="eg-title">Call 999</div>
            <div className="eg-big">999</div>
            <p className="fl-call-text">Dial 999 on your phone. This guide never calls for you.</p>
            <div className="eg-actions">
              <button type="button" className="eg-btn eg-primary" onClick={called}>I've called 999</button>
              <button type="button" className="eg-btn eg-outline" onClick={() => setCalling(false)}>Back to the card</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** A card: title, each quoted extract (its own lists kept as lists), Orb's note apart, then where the words come from */
export function Card({ card, small }) {
  const from = [...new Set(card.extract.map((x) => `${SOURCES[x].org} · ${SOURCES[x].page}`))];
  return (
    <div className={small ? 'fl-body fl-small' : 'fl-body'}>
      <div className="fl-title">{card.title}</div>
      {card.extract.map((x) => <Extract key={x} text={SOURCES[x].text} />)}
      {card.note && <div className="fl-note"><span className="fl-note-label">Orb note</span>{card.note.replace(/^Orb: /, '')}</div>}
      {from.length > 0 && <div className="fl-source">{from.join('; ')}</div>}
    </div>
  );
}

// Lines starting '- ' are the source's own list items; consecutive ones make one list
export function Extract({ text }) {
  const blocks = [];
  for (const line of text.split('\n')) {
    if (line.startsWith('- ')) {
      const last = blocks[blocks.length - 1];
      if (Array.isArray(last)) last.push(line.slice(2)); else blocks.push([line.slice(2)]);
    } else blocks.push(line);
  }
  return (
    <div className="fl-extract">
      {blocks.map((b, i) => (Array.isArray(b) ? <ul key={i}>{b.map((li) => <li key={li}>{li}</li>)}</ul> : <p key={i}>{b}</p>))}
    </div>
  );
}
