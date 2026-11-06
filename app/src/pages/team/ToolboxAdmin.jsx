import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpenCheck, Plus, Sparkles } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Button, cx, date, Empty, Input, Load, Page, Pill, Pressable, SearchInput, Segmented, Select, Sheet, Table, Textarea, Toggle, useAction, useApi } from '../../ui/index.jsx';
import { CATEGORIES, category, searchCards } from '../learn/_parts.jsx';
import EmergencyEntry from '../guide/emergency/Entry.jsx';
import FlowEntry from '../guide/flow/Entry.jsx';

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
      <EmergencyEntry from={base} />
      <FlowEntry from={base} />
      {user.platform && <GuideLevel />}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <SearchInput className="min-w-0 flex-1 sm:max-w-sm" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search cards" />
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
              { key: 'title', mobile: 'title', label: 'Card', render: (c) => { const k = category(c.category); return <div className="flex min-w-0 items-center gap-3"><span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-xl', k.tone)}><k.icon size={18} /></span><div className="min-w-0"><div className="font-semibold">{c.title}</div><div className="max-w-[640px] truncate text-caption text-muted">{c.summary}</div></div></div>; } },
              { key: 'category', mobile: 'sub', label: 'Category', render: (c) => <span className="text-footnote">{category(c.category).label}{c.venue_name ? ` · ${c.venue_name}` : ''}</span> },
              { key: 'status', mobile: 'value', label: 'Status', render: status },
              { key: 'updated', mobile: 'sub', label: 'Updated', render: (c) => <span className="text-footnote text-muted">{date(c.updated_at)}</span> },
            ]} />
          );
        }}
      </Load>
      <DraftSheet open={add} onClose={() => setAdd(false)} onCreated={(id) => nav(`${base}/${id}`)} />
    </Page>
  );
}

// Platform admin only: who can open the Emergency guide while its wording is still a draft
const LEVELS = [{ value: 'platform', label: 'Only me' }, { value: 'managers', label: 'Managers' }, { value: 'everyone', label: 'Everyone' }];
function GuideLevel() {
  const s = useApi('settings.get', {});
  const [run, busy] = useAction();
  const level = s.data?.emergency_guide || 'platform';
  const set = (v) => run(async () => { await api('toolbox.setEmergencyGuide', { level: v }); s.setData((d) => ({ ...d, emergency_guide: v })); }, 'Saved').catch(() => {});
  const setLicensed = (v) => run(async () => { await api('toolbox.setFlowLicensed', { licensed: v }); s.setData((d) => ({ ...d, flow_licensed: v })); }, 'Saved').catch(() => {});
  const setLive = (v) => run(async () => { await api('toolbox.setFlowLive', { live: v }); s.setData((d) => ({ ...d, flow_live: v })); }, 'Saved').catch(() => {});
  return (
    <div className="mb-4 rounded-2xl border border-line bg-surface p-4">
      <div className="font-semibold">Emergency guide — who can see it</div>
      <p className="mb-3 text-footnote text-muted">The wording is not clinically approved yet. Everyone means officers and venue users too.</p>
      <Segmented value={level} onChange={(v) => !busy && v !== level && set(v)} options={LEVELS} />
      <div className="mt-3 space-y-3 border-t border-line pt-3">
        <Toggle checked={s.data?.flow_live !== false} onChange={(v) => !busy && setLive(v)} label="Emergency flowchart live"
          hint="On: everyone sees it on every shift card and in the Toolbox. Off: only you can open it. Separate from the guide setting above." />
        <Toggle checked={!!s.data?.flow_licensed} onChange={(v) => !busy && setLicensed(v)} label="ProtectUK and citizenAID permission received"
          hint="A record only: the flowchart quotes both word for word and went live before their written permission arrived." />
      </div>
    </div>
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
            {IDEAS[v.category].map((t) => <Pressable press key={t} onClick={() => setV((s) => ({ ...s, topic: t }))} className="rounded-full bg-bg px-3 py-1 text-caption font-medium hover:bg-blue-soft">{t}</Pressable>)}
          </div>
        )}
        <Textarea label={v.category === 'venue' ? 'The venue\'s procedure (the AI tidies it into steps)' : 'Notes (optional)'} rows={4} value={v.notes} onChange={set('notes')} />
        <p className="text-footnote text-muted">Drafts take about 20 seconds. Officers see nothing until you publish it.</p>
      </div>
    </Sheet>
  );
}
