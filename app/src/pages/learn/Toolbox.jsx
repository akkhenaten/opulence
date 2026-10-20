import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookOpenCheck, Search, Sparkles, Star, WifiOff } from 'lucide-react';
import { Button, cx, Empty, ErrorBox, List, Page, Row, Segmented, Spinner } from '../../ui/index.jsx';
import { CATEGORIES, category, searchCards, useToolbox } from './_parts.jsx';
import Suggest from './Suggest.jsx';

export default function Toolbox() {
  const [sp, setSp] = useSearchParams();
  const tb = useToolbox();
  const [text, setText] = useState(sp.get('q') || '');
  const [ask, setAsk] = useState(false);
  const cat = sp.get('cat') || 'all';
  const setCat = (v) => setSp(v === 'all' ? {} : { cat: v }, { replace: true });

  const all = tb.cards || [];
  const shown = searchCards(cat === 'all' ? all : cat === 'saved' ? all.filter((c) => c.favourite) : all.filter((c) => c.category === cat), text);
  const opts = [{ value: 'all', label: 'All' }, { value: 'saved', label: 'Saved' }, ...CATEGORIES.filter((c) => c.value !== 'venue' || all.some((x) => x.category === 'venue'))];

  return (
    <Page title="Toolbox" subtitle="Quick guides for first aid and common situations" back={{ to: '/officer/learn', label: 'Learn' }}
      actions={<Button variant="soft" icon={Sparkles} onClick={() => setAsk(true)}>What should I do?</Button>}>
      <div className="flex items-center gap-2 rounded-2xl border border-line bg-surface px-4 shadow-tile focus-within:border-blue">
        <Search size={18} className="text-faint" />
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search guides" className="h-12 min-w-0 flex-1 bg-transparent text-callout outline-none" />
      </div>
      {tb.offline && <div className="mt-2 flex items-center gap-2 px-1 text-footnote font-semibold text-amber"><WifiOff size={14} /> Offline — showing your saved copy</div>}
      <div className="no-scrollbar -mx-4 my-3 overflow-x-auto px-4 sm:mx-0 sm:px-0"><Segmented value={cat} onChange={setCat} options={opts} /></div>
      {tb.loading && !tb.cards ? <Spinner /> : tb.error && !tb.cards ? <ErrorBox error={tb.error} retry={tb.reload} /> : shown.length ? (
        <List>
          {shown.map((c) => {
            const k = category(c.category);
            return (
              <Row key={c.id} to={`/officer/learn/toolbox/${c.id}`}
                left={<span className={cx('grid h-10 w-10 place-items-center rounded-xl', k.tone)}><k.icon size={20} /></span>}
                title={c.title} subtitle={c.venue_name ? `${c.venue_name} · ${c.summary}` : c.summary}
                right={c.favourite ? <Star size={16} className="fill-amber text-amber" /> : null} />
            );
          })}
        </List>
      ) : <Empty icon={BookOpenCheck} title={text ? 'No guides match that' : 'No guides here yet'} body={text ? 'Try other words, or use "What should I do?".' : 'Your company is still preparing these guides.'} />}
      <Suggest open={ask} onClose={() => setAsk(false)} />
    </Page>
  );
}
