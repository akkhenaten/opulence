// Site packs: every venue's pack at a glance, company-wide procedures, and new documents (written or drafted by AI)
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, BookText, Building2, Globe, Layers, Plus, Sparkles } from 'lucide-react';
import { api } from '../../../api.js';
import { HOME, useAuth } from '../../../auth.jsx';
import {
  Button, date, Empty, Input, List, Load, Page, Pill, Row, SearchInput, Segmented, Select, Sheet, Textarea, Chips, useAction, useApi,
} from '../../../ui/index.jsx';
import { docKind } from '../../shared/PackPaper.jsx';

export function DocStatus({ d }) {
  if (d.status === 'archived') return <Pill tone="grey">Archived</Pill>;
  return (
    <span className="inline-flex flex-wrap justify-end gap-1">
      {d.current_version > 0 ? <Pill tone="green">v{d.current_version}</Pill> : <Pill tone="grey">Draft</Pill>}
      {d.current_version > 0 && d.has_draft && <Pill tone="amber">Changes</Pill>}
      {d.open_suggestions > 0 && <Pill tone="blue">{d.open_suggestions} suggested</Pill>}
    </span>
  );
}

const where = (d) => (d.scope === 'venue' ? d.venue_name : d.applies_all ? `Every venue${d.venue_count ? ` (${d.venue_count})` : ''}` : `${d.venue_count} chosen venue${d.venue_count === 1 ? '' : 's'}`);

export default function Procedures() {
  const { user } = useAuth();
  const base = HOME[user.role];
  const [tab, setTab] = useState('venues');
  const [term, setTerm] = useState('');
  const [sheet, setSheet] = useState(null); // 'new' | 'ai'
  const overview = useApi('venuePacks.overview', {}, { skip: tab !== 'venues' });
  const body = useMemo(() => (tab === 'general' ? { scope: 'general' } : tab === 'archived' ? { status: 'archived' } : {}), [tab]);
  const docs = useApi('procedures.list', body, { skip: tab === 'venues' });
  const company = user.role === 'company';
  return (
    <Page title="Site packs" subtitle="Assignment instructions and procedures officers read and sign before working at a venue"
      actions={<>
        <Button variant="secondary" icon={Plus} iconOnly="phone" onClick={() => setSheet('new')}>New</Button>
        <Button icon={Sparkles} onClick={() => setSheet('ai')}>Draft with AI</Button>
      </>}
      tools={<>
        <Segmented value={tab} onChange={setTab} options={[
          { value: 'venues', label: 'Venues', icon: Building2 }, { value: 'general', label: 'Company-wide', icon: Globe }, { value: 'all', label: 'All documents', icon: Layers },
          { value: 'archived', label: 'Archived', icon: Archive },
        ]} />
        {tab !== 'venues' && <SearchInput className="min-w-0 flex-1 sm:w-56 sm:flex-none" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search documents" />}
      </>}>
      {tab === 'venues' ? (
        <Load q={overview} skeleton="rows">
          {({ venues }) => (venues.length ? (
            <List>
              {venues.map((v) => (
                <Row key={v.id} to={`${base}/venues/${v.id}?tab=pack`} left={<Building2 size={20} className="text-muted" />} title={v.name}
                  subtitle={[
                    v.documents ? `${v.documents} document${v.documents === 1 ? '' : 's'} published` : 'Nothing published yet',
                    !v.has_instructions && 'no assignment instructions', v.drafts > 0 && `${v.drafts} draft${v.drafts === 1 ? '' : 's'}`,
                  ].filter(Boolean).join(' · ')}
                  right={v.booked ? (v.action ? <Pill tone="red">{v.action} of {v.booked} to sign</Pill> : <Pill tone="green">All {v.booked} signed</Pill>) : <span className="text-footnote text-faint">No one booked</span>} />
              ))}
            </List>
          ) : <Empty icon={Building2} title="No venues yet" body="Add a venue first, then write its assignment instructions here." />)}
        </Load>
      ) : (
        <Load q={docs} skeleton="rows">
          {({ procedures }) => {
            const t = term.trim().toLowerCase();
            const rows = procedures.filter((d) => !t || `${d.title} ${d.venue_name || ''}`.toLowerCase().includes(t));
            if (!rows.length) {
              return <Empty icon={BookText} title={tab === 'archived' ? 'Nothing archived' : 'No documents yet'}
                body={tab === 'general' ? 'Company-wide procedures go into every venue pack (or the venues you choose), so officers sign them once per venue.' : 'Draft assignment instructions for a venue, or a procedure, and publish it when it is right.'}
                action={tab !== 'archived' && <Button icon={Sparkles} onClick={() => setSheet('ai')}>Draft with AI</Button>} />;
            }
            return (
              <List>
                {rows.map((d) => (
                  <Row key={d.id} to={`${base}/people/procedures/${d.id}`} title={d.title}
                    subtitle={`${docKind(d)} · ${where(d)}${d.published_at ? ` · published ${date(d.published_at)}` : ''}`}
                    right={<DocStatus d={d} />} />
                ))}
              </List>
            );
          }}
        </Load>
      )}
      {sheet && <NewSheet ai={sheet === 'ai'} company={company} onClose={() => setSheet(null)} />}
    </Page>
  );
}

/** A new procedure: company-wide (all or chosen venues) or for one venue; written by hand or drafted by AI */
export function NewSheet({ ai, company, venueId, siteFacts, initial, onClose, onCreated }) {
  const nav = useNavigate();
  const { user } = useAuth();
  const venues = useApi('venues.list', {});
  const [f, setF] = useState({ title: initial?.title || '', why: initial?.why || '', notes: '', where: venueId || !company ? 'venue' : 'all', venue_id: venueId || '', venue_ids: [] });
  const [run, busy] = useAction();
  const [mode, setMode] = useState(ai ? 'ai' : 'blank');
  ai = mode === 'ai';
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const list = (venues.data || []).filter((v) => v.active);
  const ok = f.title.trim() && (f.where !== 'venue' || f.venue_id) && (f.where !== 'chosen' || f.venue_ids.length);
  const create = () => run(async () => {
    const venue_id = f.where === 'venue' ? f.venue_id : undefined;
    let p = ai
      ? await api('procedures.ai.draft', { title: f.title, why: f.why, notes: f.notes, venue_id, site_facts: venueId ? siteFacts : undefined })
      : await api('procedures.save', { title: f.title, kind: 'procedure', venue_id, applies_all: f.where !== 'chosen', venue_ids: f.where === 'chosen' ? f.venue_ids : undefined });
    if (ai && f.where === 'chosen') p = await api('procedures.save', { id: p.id, applies_all: false, venue_ids: f.venue_ids });
    return p;
  }, ai ? 'Draft ready. Check it before publishing.' : 'Created').then((p) => {
    if (onCreated) onCreated(p); else nav(`${HOME[user.role]}/people/procedures/${p.id}`);
  }).catch(() => {});
  return (
    <Sheet open onClose={busy ? () => {} : onClose} title={venueId ? 'New procedure for this venue' : ai ? 'Draft a procedure with AI' : 'New procedure'}
      footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button icon={ai ? Sparkles : Plus} busy={busy} disabled={!ok} onClick={create}>{ai ? (busy ? 'Drafting… about a minute' : 'Draft it') : 'Create'}</Button></>}>
      <div className="space-y-4">
        {venueId && <Segmented full value={mode} onChange={setMode} options={[{ value: 'ai', label: 'Draft with AI' }, { value: 'blank', label: 'Write it myself' }]} />}
        <Input label="Title" placeholder="e.g. Fire alarm and evacuation" value={f.title} onChange={set('title')} maxLength={160} autoFocus />
        {!venueId && (
          <Segmented full value={f.where} onChange={(w) => setF((x) => ({ ...x, where: w }))} options={[
            ...(company ? [{ value: 'all', label: 'Every venue' }, { value: 'chosen', label: 'Chosen venues' }] : []), { value: 'venue', label: 'One venue only' },
          ]} />
        )}
        {f.where === 'venue' && !venueId && <Select label="Venue" placeholder="Choose a venue" value={f.venue_id} onChange={set('venue_id')} options={list.map((v) => ({ value: v.id, label: v.name }))} />}
        {f.where === 'chosen' && <Chips label="Venues" options={list.map((v) => ({ value: v.id, label: v.name }))} value={f.venue_ids} onChange={(ids) => setF((x) => ({ ...x, venue_ids: ids }))} />}
        {f.where === 'all' && <p className="text-footnote text-muted">Goes into every venue's pack, including venues added later. You can switch it off at a single venue from that venue's page.</p>}
        {ai && <>
          <Input label="Why it is needed (optional)" placeholder="e.g. The client has had two false alarms this month" value={f.why} onChange={set('why')} maxLength={400} />
          <Textarea label="Your notes (optional)" hint="Anything the procedure must say. Do not type alarm or door codes." rows={4} value={f.notes} onChange={set('notes')} maxLength={3000} />
          <p className="flex gap-2 rounded-2xl bg-bg p-3 text-caption text-muted"><Sparkles size={15} className="mt-0.5 shrink-0 text-blue" />
            The AI writes from UK good practice{f.where === 'venue' ? ' and what the app knows about the venue' : ''}. Details it cannot know are marked [To confirm]. Nothing reaches officers until you publish.</p>
        </>}
      </div>
    </Sheet>
  );
}
