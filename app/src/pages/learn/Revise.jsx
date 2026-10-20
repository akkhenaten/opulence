import { useMemo, useState } from 'react';
import { Check, Layers, RotateCcw } from 'lucide-react';
import { Button, cx, Empty, Page, Segmented, Spinner } from '../../ui/index.jsx';
import { Progress } from '../officer/_parts.jsx';
import { CATEGORIES, category, useToolbox } from './_parts.jsx';

const KEY = 'orb.revise';

// Flip-card practice from the Toolbox. "Got it" / "Again" is remembered on this phone only.
export default function Revise() {
  const tb = useToolbox();
  const [cat, setCat] = useState('all');
  const [known, setKnown] = useState(() => JSON.parse(localStorage.getItem(KEY) || '{}'));
  const [flip, setFlip] = useState(false);
  const [round, setRound] = useState(0);
  const deck = useMemo(() => {
    const cards = (tb.cards || []).filter((c) => cat === 'all' || c.category === cat);
    // Cards still to learn first, then the rest
    return [...cards.filter((c) => !known[c.id]), ...cards.filter((c) => known[c.id])];
  }, [tb.cards, cat, round]); // eslint-disable-line react-hooks/exhaustive-deps
  const [i, setI] = useState(0);
  const c = deck[i];
  const mark = (ok) => {
    const next = { ...known, [c.id]: ok };
    setKnown(next); localStorage.setItem(KEY, JSON.stringify(next));
    setFlip(false); setI(i + 1);
  };
  const restart = () => { setI(0); setFlip(false); setRound((r) => r + 1); };
  const back = { to: '/officer/learn', label: 'Learn' };

  if (tb.loading && !tb.cards) return <Page title="Revise" back={back}><Spinner /></Page>;
  const learnt = deck.filter((x) => known[x.id]).length;
  return (
    <Page title="Revise" subtitle={`${learnt} of ${deck.length} known`} back={back}>
      <div className="no-scrollbar -mx-4 mb-3 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <Segmented value={cat} onChange={(v) => { setCat(v); setI(0); setFlip(false); }} options={[{ value: 'all', label: 'All' }, ...CATEGORIES.filter((x) => x.value !== 'venue')]} />
      </div>
      {!deck.length ? <Empty icon={Layers} title="No guides to revise yet" /> : !c ? (
        <div className="rounded-tile bg-surface p-8 text-center shadow-tile">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-green text-white"><Check size={28} /></div>
          <div className="text-headline font-bold">Round done</div>
          <p className="mt-1 text-body text-muted">You know {learnt} of {deck.length}.</p>
          <Button className="mt-4" icon={RotateCcw} onClick={restart}>Go again</Button>
        </div>
      ) : (
        <>
          <Progress value={i} max={deck.length} className="mb-3" />
          <button type="button" onClick={() => setFlip(!flip)}
            className={cx('block min-h-[320px] w-full rounded-tile p-6 text-left shadow-tile transition active:scale-[0.99]', flip ? 'bg-surface' : 'bg-blue text-white')}>
            {!flip ? (
              <div className="flex min-h-[270px] flex-col justify-between">
                <div className="text-caption font-semibold uppercase tracking-wide opacity-80">{category(c.category).label}</div>
                <div className="display text-title2 font-bold leading-tight">{c.title}</div>
                <div className="text-subhead opacity-80">What would you do? Tap to check.</div>
              </div>
            ) : (
              <div>
                <div className="text-callout font-bold">{c.summary}</div>
                <ol className="mt-3 space-y-2">
                  {(c.steps || []).map((s, n) => <li key={n} className="flex gap-2 text-body"><span className="num w-5 shrink-0 font-bold text-blue">{n + 1}.</span>{s}</li>)}
                </ol>
              </div>
            )}
          </button>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <Button variant="secondary" size="lg" icon={RotateCcw} onClick={() => mark(false)}>Again</Button>
            <Button size="lg" icon={Check} onClick={() => mark(true)}>Got it</Button>
          </div>
        </>
      )}
    </Page>
  );
}
