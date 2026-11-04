// Start a contract: who it is with, which pack, which part of the UK, and when it takes effect
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Check, HelpCircle, Plus, UserRound } from 'lucide-react';
import { api } from '../../../api.js';
import { Button, cx, Input, List, Load, Row, SearchInput, Segmented, Select, Sheet, Textarea, useAction, useApi } from '../../../ui/index.jsx';
import { JURISDICTIONS } from './_shared.jsx';

export const ORG_KINDS = [
  { value: 'labour_provider', label: 'Labour provider' }, { value: 'subcontractor', label: 'Security subcontractor' },
  { value: 'agency', label: 'Employment agency' }, { value: 'psc', label: 'Personal service company' }, { value: 'other', label: 'Other business' },
];

// "Not sure?" — three questions that point at a pack. The manager still decides.
const HELPER = [
  { id: 'who', label: 'Who is the agreement with?', options: [{ value: 'person', label: 'A person' }, { value: 'business', label: 'A business' }] },
  { id: 'hours', when: { who: 'person' }, label: 'Do you guarantee them hours?', options: [{ value: 'yes', label: 'Yes, set hours' }, { value: 'no', label: 'No, as and when' }, { value: 'own', label: 'They run their own business' }] },
  { id: 'end', when: { who: 'person', hours: 'yes' }, label: 'Is there a set end date or end event?', options: [{ value: 'no', label: 'No end date' }, { value: 'yes', label: 'Yes' }] },
  { id: 'own', when: { who: 'person', hours: 'own' }, label: 'How are they paid?', options: [{ value: 'self', label: 'As a sole trader' }, { value: 'psc', label: 'Through their own limited company' }] },
  { id: 'biz', when: { who: 'business' }, label: 'What does the business do for you?', options: [
    { value: 'labour', label: 'Supplies officers who work under your control' }, { value: 'sub', label: 'Delivers a security service under its own control' }, { value: 'agency', label: 'Supplies agency workers' },
  ] },
];
function suggest(a) {
  if (a.who === 'person') {
    if (a.hours === 'yes') return a.end === 'yes' ? 'fixed_term' : a.end === 'no' ? 'permanent' : null;
    if (a.hours === 'no') return 'casual';
    if (a.hours === 'own') return a.own === 'psc' ? 'psc' : a.own === 'self' ? 'self_employed' : null;
  }
  if (a.who === 'business') return { labour: 'labour_provider', sub: 'subcontract', agency: 'agency' }[a.biz] || null;
  return null;
}

function Helper({ packs, onPick }) {
  const [a, setA] = useState({});
  const shown = HELPER.filter((h) => !h.when || Object.entries(h.when).every(([k, v]) => a[k] === v));
  const pick = suggest(a);
  const pack = packs.find((p) => p.id === pick);
  const set = (id, value) => {
    const next = { ...a, [id]: value };
    // Clear answers further down that no longer apply
    for (const h of HELPER) if (h.when && !Object.entries(h.when).every(([k, v]) => next[k] === v)) delete next[h.id];
    setA(next);
  };
  return (
    <div className="space-y-3 rounded-2xl bg-bg p-4">
      {shown.map((h) => (
        <div key={h.id}>
          <div className="mb-1.5 text-footnote font-semibold">{h.label}</div>
          <div className="flex flex-wrap gap-2">
            {h.options.map((o) => (
              <button key={o.value} type="button" aria-pressed={a[h.id] === o.value} onClick={() => set(h.id, o.value)}
                className={cx('pressable min-h-9 rounded-full border px-3.5 py-1.5 text-left text-footnote font-semibold', a[h.id] === o.value ? 'border-blue bg-blue text-white' : 'border-line bg-surface')}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      {pick && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface px-3 py-2.5 text-footnote">
          <span className="min-w-0 flex-1">
            {pack ? <>This points to <b>{pack.title}</b>. It is a starting point: the questions inside check how the work really happens.</> : 'That pack is not in your library yet.'}
          </span>
          {pack && <Button size="sm" onClick={() => onPick(pack.id)}>Use it</Button>}
        </div>
      )}
    </div>
  );
}

function OrgForm({ kind, onSaved, onCancel }) {
  const [f, setF] = useState({ kind: kind || 'other', name: '', company_number: '', address: '', signatory_name: '', signatory_title: '', signatory_email: '' });
  const [run, busy] = useAction();
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="space-y-3 rounded-2xl bg-bg p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Business name" value={f.name} onChange={set('name')} maxLength={200} autoFocus />
        <Select label="Type" value={f.kind} onChange={set('kind')} options={ORG_KINDS} />
        <Input label="Company number" hint="Optional" value={f.company_number} onChange={set('company_number')} maxLength={40} />
        <Input label="Who signs for them" value={f.signatory_name} onChange={set('signatory_name')} maxLength={120} />
        <Input label="Their job title" value={f.signatory_title} onChange={set('signatory_title')} maxLength={120} />
        <Input label="Their email" type="email" value={f.signatory_email} onChange={set('signatory_email')} maxLength={200} hint="The signing link goes here" />
      </div>
      <Textarea label="Registered address" rows={2} value={f.address} onChange={set('address')} maxLength={500} />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button size="sm" busy={busy} disabled={!f.name.trim()} onClick={() => run(() => api('contracts.saveOrganisation', f), 'Business added').then(onSaved).catch(() => {})}>Add business</Button>
      </div>
    </div>
  );
}

export function PartyPicker({ pack, value, onChange }) {
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  useEffect(() => { const t = setTimeout(() => setSearch(text.trim()), 250); return () => clearTimeout(t); }, [text]);
  const org = pack.party === 'organisation';
  const people = useApi('officers.list', { q: search || undefined }, { skip: org });
  const orgs = useApi('contracts.organisations', {}, { skip: !org });
  if (value) {
    return (
      <List>
        <Row left={org ? <Building2 size={18} className="text-blue" /> : <UserRound size={18} className="text-blue" />} title={value.name} subtitle={value.sub}
          right={<Button size="sm" variant="ghost" onClick={() => onChange(null)}>Change</Button>} />
      </List>
    );
  }
  if (org) {
    return adding
      ? <OrgForm onCancel={() => setAdding(false)} onSaved={(o) => { orgs.reload(); setAdding(false); onChange({ id: o.id, name: o.name, sub: ORG_KINDS.find((k) => k.value === o.kind)?.label }); }} />
      : (
        <Load q={orgs} skeleton="rows">
          {(rows) => (
            <List>
              {rows.map((o) => <Row key={o.id} left={<Building2 size={18} className="text-muted" />} title={o.name} subtitle={ORG_KINDS.find((k) => k.value === o.kind)?.label} chevron
                onClick={() => onChange({ id: o.id, name: o.name, sub: ORG_KINDS.find((k) => k.value === o.kind)?.label })} />)}
              <Row left={<Plus size={18} className="text-blue" />} title={<span className="text-blue">Add a business</span>} onClick={() => setAdding(true)} />
            </List>
          )}
        </Load>
      );
  }
  return (
    <div className="space-y-2">
      <SearchInput value={text} onChange={(e) => setText(e.target.value)} placeholder="Search staff and applicants" />
      <Load q={people} skeleton="rows">
        {(rows) => (
          <List className="max-h-72 overflow-y-auto">
            {rows.slice(0, 50).map((o) => (
              <Row key={o.id} left={<UserRound size={18} className="text-muted" />} title={o.name} subtitle={o.status === 'active' ? o.email : `${o.status} · ${o.email || 'no email'}`} chevron
                onClick={() => onChange({ id: o.id, name: o.name, sub: o.email })} />
            ))}
            {!rows.length && <Row title="Nobody matches" subtitle="Add the person in Staff first" />}
          </List>
        )}
      </Load>
    </div>
  );
}

/** `amends`: a signed contract built outside the workspace, replaced by a new pack contract for the same party */
export default function StartSheet({ onClose, officer, amends }) {
  const nav = useNavigate();
  const q = useApi('contracts.packs');
  const [packId, setPackId] = useState('');
  const [jur, setJur] = useState('');
  const [party, setParty] = useState(officer || (amends ? { id: amends.id } : null));
  const [helper, setHelper] = useState(false);
  const [title, setTitle] = useState('');
  const [effective, setEffective] = useState('');
  const [run, busy] = useAction();
  const data = q.data;
  const packs = (data?.packs || []).filter((p) => !amends || p.party === amends.party);
  const pack = packs.find((p) => p.id === packId);
  const j = jur || data?.jurisdiction || 'ew';
  const pickPack = (id) => {
    const next = packs.find((p) => p.id === id);
    if (!amends && pack && next && pack.party !== next.party) setParty(null);
    setPackId(id); setHelper(false);
  };
  const create = () => run(() => (amends ? api('contracts.amend', {
    id: amends.id, kind: 'replacement', pack_id: packId, jurisdiction: j, effective_date: effective || undefined,
  }) : api('contracts.draft.create', {
    pack_id: packId, jurisdiction: j, officer_id: pack.party === 'organisation' ? undefined : party.id, organisation_id: pack.party === 'organisation' ? party.id : undefined,
    title: title.trim() || undefined, effective_date: effective || undefined,
  }))).then((d) => nav(`/company/people/contracts/draft/${d.draft.id}`)).catch(() => {});

  return (
    <Sheet open onClose={onClose} title={amends ? `Replace ${amends.reference || 'contract'}` : 'Create a contract'} size="lg"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button busy={busy} disabled={!pack || !party || !pack.jurisdictions?.[j]} onClick={create}>Start drafting</Button>
      </>}>
      <Load q={q}>
        {() => (
          <div className="space-y-5">
            {amends && <p className="rounded-2xl bg-blue-soft p-3.5 text-footnote">The new contract replaces "{amends.title}". Once it is signed, the old one is marked Replaced and stays on record.</p>}
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-headline font-bold">What kind of agreement?</h3>
                <Button size="sm" variant="ghost" icon={HelpCircle} onClick={() => setHelper((h) => !h)}>Not sure?</Button>
              </div>
              {helper && <div className="mb-3"><Helper packs={packs} onPick={pickPack} /></div>}
              <div className="grid gap-2 sm:grid-cols-2">
                {packs.map((p) => {
                  const counts = p.jurisdictions?.[j];
                  const on = p.id === packId;
                  return (
                    <button key={p.id} type="button" aria-pressed={on} onClick={() => pickPack(p.id)} disabled={!counts}
                      className={cx('pressable rounded-2xl border p-3.5 text-left disabled:opacity-50', on ? 'border-blue bg-blue/5 ring-2 ring-blue/20' : 'border-line bg-surface')}>
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1 text-subhead font-semibold">{p.title}</div>
                        {on && <Check size={18} className="shrink-0 text-blue" />}
                      </div>
                      <p className="mt-0.5 text-footnote text-muted">{p.summary}</p>
                      {p.decision?.hint && <p className="mt-1 text-caption text-faint">{p.decision.hint}</p>}
                      <p className="mt-1.5 text-caption text-muted">
                        {counts ? `${counts.legal ? `${counts.legal} legally reviewed · ` : ''}${counts.company ? `${counts.company} company-approved · ` : ''}${counts.draft} research-based draft` : `Not available for ${JURISDICTIONS[j]}`}
                      </p>
                    </button>
                  );
                })}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-headline font-bold">Where is the work done?</h3>
              <Segmented value={j} onChange={setJur} options={Object.entries(JURISDICTIONS).map(([value, label]) => ({ value, label }))} />
              {!jur && <p className="mt-1.5 text-caption text-faint">Suggested from your company address. Employment law differs in Scotland and Northern Ireland.</p>}
            </section>

            {pack && !amends && (
              <section>
                <h3 className="mb-2 text-headline font-bold">{pack.party === 'organisation' ? 'Which business?' : 'Who is it for?'}</h3>
                <PartyPicker pack={pack} value={party} onChange={setParty} />
              </section>
            )}

            {pack && (
              <section className="grid gap-3 sm:grid-cols-2">
                {!amends && <Input label="Title" hint="Optional" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder={`${pack.doc_title}${party ? ` - ${party.name}` : ''}`} />}
                <Input label="Takes effect" hint="Optional, used to check law coming into force later" type="date" value={effective} onChange={(e) => setEffective(e.target.value)} />
              </section>
            )}
          </div>
        )}
      </Load>
    </Sheet>
  );
}
