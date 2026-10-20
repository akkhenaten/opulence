import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Phone, Sparkles } from 'lucide-react';
import { api } from '../../api.js';
import { Button, Sheet, Textarea, useAction } from '../../ui/index.jsx';
import { category } from './_parts.jsx';

const EXAMPLES = ['Someone has collapsed and isn\'t breathing', 'A customer won\'t leave and is getting aggressive', 'I think someone\'s drink has been spiked', 'I found a bag left on its own'];

/** "What should I do?": AI points to the right published cards; it never writes advice of its own. */
export default function Suggest({ open, onClose }) {
  const [text, setText] = useState('');
  const [res, setRes] = useState(null);
  const [run, busy] = useAction();
  const ask = (t = text) => t.trim() && run(async () => { setText(t); setRes(await api('toolbox.suggest', { text: t })); });
  const close = () => { onClose(); setRes(null); setText(''); };
  return (
    <Sheet open={open} onClose={close} title="What should I do?"
      footer={<Button icon={Sparkles} busy={busy} disabled={!text.trim()} onClick={() => ask()}>Find the right card</Button>}>
      <div className="mb-3 flex items-center gap-3 rounded-2xl bg-red-soft px-4 py-3 text-red">
        <Phone size={18} className="shrink-0" />
        <span className="text-[14px] font-semibold">If someone's life is at risk, call 999 first.</span>
        <a href="tel:999" className="ml-auto rounded-full bg-red px-3 py-1 text-[13px] font-bold text-white">Call 999</a>
      </div>
      <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Say what's happening, in your own words" />
      {!res && (
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAMPLES.map((e) => <button key={e} type="button" onClick={() => ask(e)} className="rounded-full border border-line px-3 py-1.5 text-[13px] font-semibold hover:border-blue hover:text-blue">{e}</button>)}
        </div>
      )}
      {res && (
        <div className="mt-4 space-y-2">
          {res.emergency && <div className="rounded-2xl bg-red px-4 py-3 text-[15px] font-bold text-white">This sounds like an emergency. Call 999 now, then follow the card.</div>}
          {res.matches.map(({ card, why }) => {
            const cat = category(card.category);
            return (
              <Link key={card.id} to={`/officer/learn/toolbox/${card.id}`} onClick={close} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-3 transition hover:border-blue">
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${cat.tone}`}><cat.icon size={19} /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold">{card.title}</span>
                  <span className="block text-[13px] text-muted">{why}</span>
                </span>
              </Link>
            );
          })}
          {res.note && <p className="rounded-2xl bg-bg px-4 py-3 text-[14px] text-muted">{res.note}</p>}
          <p className="pt-1 text-[12px] text-faint">Orb only points you to cards your company has approved. Follow your training and your supervisor.</p>
        </div>
      )}
    </Sheet>
  );
}
