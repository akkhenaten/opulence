import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpenCheck, Plus, Search, Sparkles } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Button, cx, date, Empty, Input, Load, Page, Pill, Segmented, Select, Sheet, Table, Textarea, useAction, useApi } from '../../ui/index.jsx';
import { CATEGORIES, category, searchCards } from '../learn/_parts.jsx';

// Ideas for the first cards, so a new company is not starting from a blank page
const IDEAS = {
  first_aid: ['Someone has collapsed and is not breathing (CPR and defibrillator)', 'Choking adult', 'Severe bleeding', 'Seizure', 'Suspected drink spiking', 'Recovery position', 'Head injury after a fall', 'Diabetic emergency'],
  situations: ['Intoxicated customer refusing to leave', 'Aggressive person — de-escalation', 'Found a weapon or drugs during a search', 'Lost or vulnerable child', 'Suspicious package or behaviour', 'Fire alarm and evacuation', 'Someone being filmed while you work'],
  law: ['Refusing entry and ejecting someone', 'Searching with consent', 'Citizen\'s arrest (PACE s24A)', 'Reasonable force', 'Licensing Act: serving drunk people', 'Data protection and body-worn video'],
  venue: [],
};

const status = (c) => {
  if (c.status === 'draft') return <Pill tone="blue">Draft</Pill>;
  if (c.review_by && c.review_by < new Date().toISOString().slice(0, 10)) return <Pill tone="amber">Review due</Pill>;
  return <Pill tone="green">Published</Pill>;
};

export default function ToolboxAdmin() {
  const { user } = useAuth();
  const co = user.role === 'company';
  const nav = useNavigate();
  const q = useApi('toolbox.list', { drafts: true });
  const [cat, setCat] = useState('all');
  const [text, setText] = useState('');
  const [add, setAdd] = useState(false);
  const base = `/${user.role}/team/toolbox`;
  return (
    <Page title="Toolbox" subtitle="Quick guides officers can open on shift, even offline" wide
      actions={co && <><Button variant="secondary" icon={Plus} to={`${base}/new`}>Blank card</Button><Button icon={Sparkles} onClick={() => setAdd(true)}>Draft with AI</Button></>}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-surface px-3.5 focus-within:border-blue sm:max-w-sm">
          <Search size={17} className="text-faint" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search cards" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none" />
        </div>
        <Segmented value={cat} onChange={setCat} options={[{ value: 'all', label: 'All' }, { value: 'draft', label: 'Drafts' }, ...CATEGORIES]} />
      </div>
      <Load q={q}>
        {({ cards }) => {
          const rows = searchCards(cat === 'all' ? cards : cat === 'draft' ? cards.filter((c) => c.status === 'draft') : cards.filter((c) => c.category === cat), text);
          if (!cards.length) {
            return <Empty icon={BookOpenCheck} title="No guides yet" body={co ? 'Draft your first cards with AI — you check and publish each one.' : 'Your company has not added any guides yet.'}
              action={co && <Button icon={Sparkles} onClick={() => setAdd(true)}>Draft with AI</Button>} />;
          }
          return (
            <Table rows={rows} onRow={(c) => nav(`${base}/${c.id}`)} empty="No cards match" columns={[
              { key: 'title', label: 'Card', render: (c) => { const k = category(c.category); return <div className="flex min-w-0 items-center gap-3"><span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-xl', k.tone)}><k.icon size={17} /></span><div className="min-w-0"><div className="font-semibold">{c.title}</div><div className="max-w-[640px] truncate text-[12px] text-muted">{c.summary}</div></div></div>; } },
              { key: 'category', label: 'Category', render: (c) => <span className="text-[13px]">{category(c.category).label}{c.venue_name ? ` · ${c.venue_name}` : ''}</span> },
              { key: 'status', label: 'Status', render: status },
              { key: 'updated', label: 'Updated', render: (c) => <span className="text-[13px] text-muted">{date(c.updated_at)}</span> },
            ]} />
          );
        }}
      </Load>
      <DraftSheet open={add} onClose={() => setAdd(false)} onCreated={(id) => nav(`${base}/${id}`)} />
    </Page>
  );
}

function DraftSheet({ open, onClose, onCreated }) {
  const [v, setV] = useState({ category: 'first_aid', topic: '', venue_id: '', notes: '' });
  const venues = useApi('venues.list', {}, { skip: !open || v.category !== 'venue' });
  const [run, busy] = useAction();
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const go = () => run(async () => { const c = await api('toolbox.draft', { ...v, venue_id: v.venue_id || null }); onCreated(c.id); }, 'Draft ready — check it before publishing').catch(() => {});
  return (
    <Sheet open={open} onClose={busy ? () => {} : onClose} title="Draft a card with AI"
      footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button><Button icon={Sparkles} busy={busy} disabled={!v.topic.trim() || (v.category === 'venue' && !v.venue_id)} onClick={go}>Draft</Button></>}>
      <div className="space-y-3">
        <Select label="Category" value={v.category} onChange={set('category')} options={CATEGORIES.map(({ value, label }) => ({ value, label }))} />
        {v.category === 'venue' && <Select label="Venue" value={v.venue_id} onChange={set('venue_id')} placeholder="Choose a venue" options={(venues.data || []).map((x) => ({ value: x.id, label: x.name }))} />}
        <Input label="What is it about?" value={v.topic} onChange={set('topic')} placeholder="e.g. Choking adult" />
        {IDEAS[v.category]?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {IDEAS[v.category].map((t) => <button key={t} type="button" onClick={() => setV((s) => ({ ...s, topic: t }))} className="rounded-full bg-bg px-3 py-1 text-[12px] font-medium hover:bg-blue-soft">{t}</button>)}
          </div>
        )}
        <Textarea label={v.category === 'venue' ? 'The venue\'s procedure (the AI tidies it into steps)' : 'Notes (optional)'} rows={4} value={v.notes} onChange={set('notes')} />
        <p className="text-[13px] text-muted">Drafts take about 20 seconds. Officers see nothing until you publish it.</p>
      </div>
    </Sheet>
  );
}
