import { useEffect, useRef, useState } from 'react';

// One screen of the Emergency guide: art on top, the wording, then the actions pinned above the bottom bar.
// The wording is shown exactly as written in the pack; only "- " lines become a list.
const VENUES = { home: 'Home', office: 'Office', nightclub: 'Nightclub', hotel: 'Hotel', restaurant: 'Restaurant', station: 'Station', mall: 'Shopping centre' };
const size = (n) => (n <= 160 ? 'eg-t22' : n <= 260 ? 'eg-t19' : 'eg-t17');
const hero = (n) => (n <= 160 ? 'eg-h42' : n <= 260 ? 'eg-h26' : 'eg-h19');
const hhmm = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export function Art({ file, className }) {
  if (!file) return null;
  const src = `${import.meta.env.BASE_URL}emergency/${file}`;
  if (file.endsWith('.svg')) return <img src={src} alt="" className={className} />;
  return (
    <picture>
      <source srcSet={src.replace(/\.png$/, '.webp')} type="image/webp" />
      <img src={src} alt="" className={className} />
    </picture>
  );
}

function Wording({ text }) {
  const blocks = [];
  for (const line of text.split('\n').filter((l) => l.trim())) {
    if (line.startsWith('- ')) {
      const last = blocks.at(-1);
      if (Array.isArray(last)) last.push(line.slice(2)); else blocks.push([line.slice(2)]);
    } else blocks.push(line);
  }
  return blocks.map((b, i) => (Array.isArray(b)
    ? <ul key={i}>{b.map((li) => <li key={li}>{li}</li>)}</ul>
    : <p key={i}>{b}</p>));
}

export default function Screen({ s, st, onAct, onVenue }) {
  const [note, setNote] = useState('');
  const tap = (to) => (to === '@unwritten' ? setNote("This part of the guide hasn't been written yet.") : onAct(to));
  const scroll = useRef(null);
  const end = useRef(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = scroll.current;
    if (!el || !end.current) return undefined;
    const io = new IntersectionObserver(([e]) => setMore(!e.isIntersecting && el.scrollHeight - el.clientHeight > 24), { root: el });
    io.observe(end.current);
    return () => io.disconnect();
  }, [s.id]);

  const venue = VENUES[st.venue] ? st.venue : 'home';
  const art = s.id === 'X06' ? `x06-${venue}.svg` : s.art;
  const n = s.text.length;
  const picker = s.id === 'M03';
  const showLog = (s.id === 'K11' || s.id === 'M05') && (st.interruptions || st.firstCall);

  return (
    <>
      {(s.scopeUndecided || picker) && <div className="eg-red">Scope not decided — this injury may not stay in the guide. Shown for review.</div>}
      {s.unwritten && !picker && <div className="eg-red">Not written yet — this screen has no wording.</div>}
      <div className="eg-scroll" ref={scroll}>
        {art && <div className={`eg-hero ${hero(n)}`}><Art file={art} className="eg-hero-img" /></div>}
        <div className="eg-body">
          <div className="eg-title">{s.title}</div>
          {s.id === 'X06' && (
            <div className="eg-chips">
              {Object.entries(VENUES).map(([k, label]) => (
                <button key={k} type="button" className={`eg-chip ${k === venue ? 'eg-chip-on' : ''}`} onClick={() => onVenue(k)}>{label}</button>
              ))}
            </div>
          )}
          {picker
            ? <p className="eg-text eg-t19">Choose the injury.</p>
            : <div className={`eg-text ${size(n)}`}><Wording text={s.text} /></div>}
          {showLog && (
            <div className="eg-log">
              {[st.interruptions ? `Danger taps: ${st.interruptions}` : null, st.firstCall ? `First call ${hhmm(st.firstCall)}` : null].filter(Boolean).join(' · ')}
            </div>
          )}
          {note && <div className="eg-red eg-note" role="alert">{note}</div>}
          <div ref={end} className="h-px" />
        </div>
      </div>
      {more && <div className="eg-more">More steps below</div>}
      <div className="eg-actions">
        {s.buttons.map((b, i) => (
          <button key={b.label} type="button" className={`eg-btn ${i ? 'eg-outline' : 'eg-primary'}`} onClick={() => tap(b.to)}>{b.label}</button>
        ))}
      </div>
    </>
  );
}
