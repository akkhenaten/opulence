import { Fragment, useLayoutEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ChevronLeft, Printer } from 'lucide-react';
import { HOME, useAuth } from '../../../auth.jsx';
import { Spinner, useApi } from '../../../ui/index.jsx';
import { BANDS, FLOW, START, bandOf } from './flow.js';
import { SOURCES } from './sources.js';
import { Extract, NotYet } from './Flow.jsx';

// The whole Emergency flowchart on one page for reviewers: one band per situation, cards laid out left to right by
// how many answers it takes to reach them, arrows labelled with the answer. Answers into another band are listed under the card.
// Clicking a card opens the guide there. Print switches to the outline, which fits A3 or PDF for the reviewer and the licence requests.

// How many answers from the first card (shortest), which sets each card's column within its band
const DEPTH = (() => {
  const d = { [START]: 0 };
  for (const queue = [START]; queue.length;) {
    const id = queue.shift();
    for (const a of FLOW[id].answers) if (FLOW[a.to] && !(a.to in d)) { d[a.to] = d[id] + 1; queue.push(a.to); }
  }
  return d;
})();
const LAYOUT = BANDS.map((b) => {
  const ids = Object.keys(FLOW).filter((id) => bandOf(id) === b);
  const min = Math.min(...ids.map((id) => DEPTH[id]));
  const cols = [];
  for (const id of ids) (cols[DEPTH[id] - min] ||= []).push(id);
  return { ...b, ids, cols: cols.filter(Boolean) };
});
const flags = (c) => [c.thin && 'Thin source', c.note && 'Orb note', c.clinical && 'Needs clinical review'].filter(Boolean);

export default function FlowMap() {
  const { user, ready } = useAuth();
  const s = useApi('settings.get', {}, { skip: !user });
  if (!ready || (user && !s.data && !s.error)) return <Spinner className="min-h-dvh" />;
  if (!user) return <Navigate to="/login" replace />;
  if (!s.data?.flow_visible || !user.platform) return <NotYet home={HOME[user.role]} />;
  return <MapPage />;
}

function MapPage() {
  const [outline, setOutline] = useState(false);
  const pages = [...new Map(Object.values(SOURCES).map((x) => [x.url, x])).values()];
  return (
    <div className="fm">
      <div className="fm-head">
        <Link to="/guide/flow" className="fm-back"><ChevronLeft size={18} /> Flowchart</Link>
        <h1 className="fm-h1">Emergency flowchart — the whole map</h1>
        <p className="fm-lede">Draft for review. Every quoted line is word for word from ProtectUK (citizenAID for first aid), copied on 6 Nov 2026; Orb&apos;s own lines are marked Orb note. {Object.keys(FLOW).length} cards. Click a card to open the guide there.</p>
        <div className="fm-tools">
          <button type="button" className={`fm-tab ${outline ? '' : 'fm-tab-on'}`} onClick={() => setOutline(false)}>Boxes</button>
          <button type="button" className={`fm-tab ${outline ? 'fm-tab-on' : ''}`} onClick={() => setOutline(true)}>Outline</button>
          <button type="button" className="fm-tab" onClick={() => { setOutline(true); setTimeout(() => window.print(), 100); }}><Printer size={15} /> Print</button>
        </div>
      </div>
      {LAYOUT.map((b) => (outline ? <Outline key={b.prefix} band={b} /> : <Band key={b.prefix} band={b} />))}
      <section className="fm-band">
        <h2 className="fm-h2">Sources</h2>
        <ul className="fm-sources">
          {pages.map((p) => <li key={p.url}>{p.org} · {p.page} · <a href={p.url} target="_blank" rel="noreferrer">{p.url}</a> · copied {p.copied}</li>)}
        </ul>
      </section>
    </div>
  );
}

function Band({ band }) {
  const nav = useNavigate();
  const wrap = useRef(null);
  const [lines, setLines] = useState({ w: 0, h: 0, edges: [] });
  // Arrows between cards in this band, measured once the boxes are laid out
  useLayoutEffect(() => {
    const draw = () => {
      const el = wrap.current;
      if (!el) return;
      const o = el.getBoundingClientRect();
      const box = (id) => { const r = el.querySelector(`[data-card="${id}"]`)?.getBoundingClientRect(); return r && { l: r.left - o.left, r: r.right - o.left, t: r.top - o.top, b: r.bottom - o.top }; };
      const edges = [];
      for (const id of band.ids) {
        for (const a of FLOW[id].answers) {
          if (bandOf(a.to)?.prefix !== band.prefix || a.to === id) continue;
          const f = box(id); const t = box(a.to);
          if (!f || !t) continue;
          if (t.l > f.r) {
            const y1 = f.t + 26; const y2 = t.t + 26;
            const mx = (f.r + t.l) / 2;
            edges.push({ key: `${id}>${a.to}`, d: `M${f.r},${y1} C${mx},${y1} ${mx},${y2} ${t.l - 6},${y2}`, x: mx, y: (y1 + y2) / 2, label: a.label });
          } else if (t.l === f.l) {
            // Same column: round the right-hand side
            const y1 = f.t + 26; const y2 = t.t + 26; const x = f.r + 44;
            edges.push({ key: `${id}>${a.to}`, d: `M${f.r},${y1} C${x},${y1} ${x},${y2} ${t.r + 6},${y2}`, x: x - 10, y: (y1 + y2) / 2, label: a.label, back: true });
          } else {
            // Back or same column: a loop below the cards
            const x1 = (f.l + f.r) / 2; const x2 = (t.l + t.r) / 2 + 12; const y = Math.max(f.b, t.b) + 28;
            edges.push({ key: `${id}>${a.to}`, d: `M${x1},${f.b} C${x1},${y} ${x2},${y} ${x2},${t.b + 6}`, x: (x1 + x2) / 2, y: y - 6, label: a.label, back: true });
          }
        }
      }
      setLines({ w: el.scrollWidth, h: el.scrollHeight, edges });
    };
    draw();
    window.addEventListener('resize', draw);
    return () => window.removeEventListener('resize', draw);
  }, [band]);

  return (
    <section className="fm-band">
      <h2 className="fm-h2">{band.label}</h2>
      <div className="fm-scroll">
        <div ref={wrap} className="fm-grid">
          <svg className="fm-svg" width={lines.w} height={lines.h} aria-hidden="true">
            <defs><marker id={`fm-a-${band.prefix}`} viewBox="0 0 10 10" refX="4" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#1B5FD1" /></marker></defs>
            {lines.edges.map((e) => (
              <Fragment key={e.key}>
                <path d={e.d} fill="none" stroke={e.back ? '#98A2B3' : '#1B5FD1'} strokeWidth="1.6" strokeDasharray={e.back ? '5 4' : undefined} markerEnd={`url(#fm-a-${band.prefix})`} />
                <text x={e.x} y={e.y} className="fm-edge">{e.label}</text>
              </Fragment>
            ))}
          </svg>
          {band.cols.map((col, i) => (
            <div key={i} className="fm-col">
              {col.map((id) => <Box key={id} id={id} onOpen={() => nav(`/guide/flow?card=${id}`)} />)}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Box({ id, onOpen }) {
  const c = FLOW[id];
  const out = c.answers.filter((a) => FLOW[a.to] && bandOf(a.to) !== bandOf(id));
  return (
    <div role="button" tabIndex={0} data-card={id} className={`fm-box fm-${c.kind}`} onClick={onOpen} onKeyDown={(e) => e.key === 'Enter' && onOpen()}>
      <span className="fm-id">{id}{c.kind === 'end' ? ' · ending' : ''}</span>
      <span className="fm-title">{c.title}</span>
      {flags(c).length > 0 && <span className="fm-flags">{flags(c).map((f) => <span key={f} className={`fm-flag ${f === 'Orb note' ? '' : 'fm-flag-warn'}`}>{f}</span>)}</span>}
      {c.extract.map((x) => <Extract key={x} text={SOURCES[x].text} />)}
      {c.note && <span className="fm-note">{c.note}</span>}
      {c.extract.length > 0 && <span className="fm-src">{[...new Set(c.extract.map((x) => SOURCES[x].page))].join('; ')}</span>}
      {out.length > 0 && <span className="fm-out">{out.map((a) => <span key={a.label}>{a.label} → {FLOW[a.to].title} <em>({bandOf(a.to).label})</em></span>)}</span>}
      {c.kind === 'end' && <span className="fm-out"><span>Start again · Leave</span></span>}
    </div>
  );
}

// The same band as an indented list: each card, then every answer and where it leads
function Outline({ band }) {
  return (
    <section className="fm-band">
      <h2 className="fm-h2">{band.label}</h2>
      <ol className="fm-outline">
        {band.cols.flat().map((id) => {
          const c = FLOW[id];
          return (
            <li key={id}>
              <Link to={`/guide/flow?card=${id}`} className="fm-ol-title">{id} · {c.title}</Link>
              {flags(c).length > 0 && <span className="fm-ol-flags"> ({flags(c).join(', ')})</span>}
              {c.extract.map((x) => <div key={x} className="fm-ol-x"><Extract text={SOURCES[x].text} /><div className="fm-src">{SOURCES[x].org} · {SOURCES[x].page}</div></div>)}
              {c.note && <div className="fm-note">{c.note}</div>}
              <ul className="fm-ol-ans">
                {c.answers.map((a) => <li key={a.label}>{a.label} → {FLOW[a.to] ? `${a.to} · ${FLOW[a.to].title}` : a.to === '@start' ? 'start again' : 'leave the guide'}</li>)}
              </ul>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
