// Settings → Contract library: what state each pack's wording is in, approvals, company wording, recorded legal reviews and the law watch
import { useMemo, useState } from 'react';
import { BadgeCheck, ExternalLink, FilePen, FileUp, Gavel, Landmark, Layers, MapPin, Mountain, Plus, RefreshCw } from 'lucide-react';
import { api, upload } from '../../../api.js';
import {
  Button, cx, date, Empty, Input, List, Load, Pill, Row, SearchInput, Section, Segmented, Sheet, Textarea, useAction, useApi, useConfirm,
} from '../../../ui/index.jsx';
import { JURISDICTIONS, JUR_SHORT, STATE, StatePill } from './_shared.jsx';

const JUR_ICON = { all: Layers, ew: Landmark, sc: Mountain, ni: MapPin };

const LAW_STATUS = { in_force: ['In force', 'green'], announced: ['Announced', 'amber'], not_commenced: ['Not in force yet', 'amber'] };
const soon = (d) => d && new Date(d) > new Date() && new Date(d) - new Date() < 90 * 864e5;

/** Every pack in every jurisdiction, with how much of its wording is a draft, company-approved or legally reviewed */
function PackGrid({ q }) {
  const confirm = useConfirm();
  const [run] = useAction();
  const approve = async (p, j) => {
    const n = p.jurisdictions[j].draft;
    if (!(await confirm({
      title: `Approve ${p.title} for ${JURISDICTIONS[j]}?`,
      body: `${n} research-based draft clause${n === 1 ? '' : 's'} become Company-approved, recorded in your name. This is not a legal review: only a solicitor's review, recorded below, marks wording as Legally reviewed.`,
      confirm: 'Approve',
    }))) return;
    await run(() => api('contracts.clause.approve', { pack_id: p.id, jurisdiction: j }), 'Approved').catch(() => {});
    q.reload();
  };
  return (
    <Load q={q} skeleton="rows">
      {({ packs }) => (
        <div className="overflow-x-auto rounded-tile border border-hairline bg-surface shadow-tile">
          <table className="w-full min-w-[640px] text-left text-footnote">
            <thead><tr className="border-b border-line text-caption uppercase tracking-wide text-faint">
              <th className="px-4 py-2.5 font-semibold">Pack</th>
              {Object.keys(JURISDICTIONS).map((j) => <th key={j} className="px-4 py-2.5 font-semibold">{JUR_SHORT[j]}</th>)}
            </tr></thead>
            <tbody className="divide-y divide-line">
              {packs.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3"><div className="text-subhead font-semibold">{p.title}</div><div className="text-caption text-muted">{p.party === 'organisation' ? 'With a business' : 'With a person'}</div></td>
                  {Object.keys(JURISDICTIONS).map((j) => {
                    const c = p.jurisdictions[j];
                    if (!c) return <td key={j} className="px-4 py-3 text-faint">—</td>;
                    return (
                      <td key={j} className="px-4 py-3 align-top">
                        <div className="flex flex-wrap gap-1">
                          {['legal', 'company', 'draft'].map((s) => c[s] > 0 && <Pill key={s} tone={STATE[s].tone}><span className="num">{c[s]}</span> {s === 'draft' ? 'draft' : s === 'company' ? 'approved' : 'reviewed'}</Pill>)}
                        </div>
                        {c.draft > 0 && <button type="button" className="mt-1.5 text-caption font-semibold text-blue" onClick={() => approve(p, j)}>Approve drafts</button>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Load>
  );
}

/** One clause: wording per jurisdiction, its versions and sources, and what the company can do with it */
function ClauseSheet({ clause, onClose, onDone }) {
  const js = Object.keys(clause.jurisdictions);
  const [j, setJ] = useState(js[0]);
  const [editing, setEditing] = useState(null);
  const [run, busy] = useAction();
  const x = clause.jurisdictions[j];
  const cur = x.current;
  const act = (fn, msg) => run(fn, msg).then(onDone).catch(() => {});
  return (
    <Sheet open onClose={onClose} title={clause.title} size="lg"
      footer={editing != null ? <>
        <Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button>
        <Button busy={busy} disabled={!editing.trim()} onClick={() => act(() => api('contracts.clause.save', { clause_id: clause.id, jurisdiction: j, body: editing }), 'Saved as a new draft version').then(() => setEditing(null))}>Save company wording</Button>
      </> : <>
        <Button variant="secondary" icon={Plus} onClick={() => setEditing(cur.body)}>Add company wording</Button>
        {cur.state === 'draft' && <Button busy={busy} onClick={() => act(() => api('contracts.clause.approve', { items: [{ clause_id: clause.id, jurisdiction: j, version: cur.version }] }), 'Approved for company use')}>Approve</Button>}
      </>}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-footnote text-muted">
          <span className="num">{clause.id}</span>
          {clause.packs.length > 0 && <span>· used in {clause.packs.length} pack{clause.packs.length === 1 ? '' : 's'}</span>}
        </div>
        {js.length > 1 && <Segmented value={j} onChange={(v) => { setJ(v); setEditing(null); }} options={js.map((v) => ({ value: v, label: v === 'all' ? 'All of the UK' : JUR_SHORT[v], icon: JUR_ICON[v] }))} />}
        <div className="flex flex-wrap items-center gap-2">
          <StatePill state={cur.state} /><span className="text-footnote text-muted">Version {cur.version} · {cur.origin === 'seed' ? 'from the research library' : 'company wording'}{cur.approved_by_name ? ` · approved by ${cur.approved_by_name} ${date(cur.approved_at)}` : ''}</span>
        </div>
        {x.update && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-amber-soft p-3 text-footnote">
            <span className="min-w-0 flex-1">Updated research wording is available (version {x.update.version}, checked {date(x.update.checked_on)}). New drafts keep using version {cur.version} until you adopt it.</span>
            <Button size="sm" busy={busy} onClick={() => act(() => api('contracts.clause.adopt', { clause_id: clause.id, jurisdiction: j, version: x.update.version }), 'Update adopted')}>Adopt update</Button>
          </div>
        )}
        {editing != null
          ? <Textarea label="Wording" hint="Keep {{variables}} as they are; values come from the guide. Saved as a new draft version." rows={12} value={editing} onChange={(e) => setEditing(e.target.value)} />
          : <pre className="whitespace-pre-wrap rounded-2xl bg-bg p-4 font-sans text-footnote leading-relaxed">{cur.body}</pre>}
        {cur.sources?.length > 0 && (
          <div>
            <div className="mb-1 text-caption font-semibold uppercase tracking-wide text-faint">Sources{cur.checked_on ? ` · checked ${date(cur.checked_on)}` : ''}</div>
            <ul className="space-y-1 text-footnote">
              {cur.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue">{s.title}<ExternalLink size={12} /></a></li>)}
            </ul>
          </div>
        )}
        {x.versions.length > 1 && (
          <div>
            <div className="mb-1 text-caption font-semibold uppercase tracking-wide text-faint">Versions</div>
            <List>
              {x.versions.map((v) => (
                <Row key={v.version} title={`Version ${v.version}${v.version === cur.version ? ' · in use' : ''}`} subtitle={`${v.origin === 'seed' ? 'Research library' : 'Company'} · ${date(v.created_at)}`}
                  right={<div className="flex items-center gap-1.5"><StatePill state={v.state} />{v.version !== cur.version && <Button size="sm" variant="ghost" onClick={() => act(() => api('contracts.clause.adopt', { clause_id: clause.id, jurisdiction: j, version: v.version }), `Version ${v.version} in use`)}>Use</Button>}</div>} />
              ))}
            </List>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** A solicitor's review the manager records: only the versions in scope today become Legally reviewed */
function ReviewSheet({ packs, onClose, onDone }) {
  const [f, setF] = useState({ reviewer_name: '', firm: '', reviewed_on: '', jurisdiction: 'ew', scope_note: '', notes: '', pack_ids: [] });
  const [file, setFile] = useState(null);
  const [run, busy] = useAction();
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const toggle = (id) => setF((x) => ({ ...x, pack_ids: x.pack_ids.includes(id) ? x.pack_ids.filter((p) => p !== id) : [...x.pack_ids, id] }));
  const save = () => run(async () => {
    let letter = null;
    if (file) {
      const key = await upload(file, 'company');
      letter = (await api('docs.create', { owner_type: 'company', kind: 'other', title: `Legal review - ${f.reviewer_name}${f.firm ? `, ${f.firm}` : ''} - ${f.reviewed_on}`, s3_key: key, mime: file.type })).id;
    }
    return api('contracts.legalReview.record', { ...f, letter_document_id: letter || undefined });
  }, 'Legal review recorded').then(onDone).catch(() => {});
  return (
    <Sheet open onClose={onClose} title="Record a legal review" size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button busy={busy} disabled={!f.reviewer_name.trim() || !f.reviewed_on || !f.pack_ids.length} onClick={save}>Record review</Button></>}>
      <div className="space-y-4">
        <p className="rounded-2xl bg-blue-soft p-3.5 text-footnote">Record a review a solicitor has actually done. The exact wording in use today for the packs you tick becomes Legally reviewed. Any later edit starts a new draft version, which needs reviewing again.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Reviewer" value={f.reviewer_name} onChange={set('reviewer_name')} maxLength={200} />
          <Input label="Firm" hint="Optional" value={f.firm} onChange={set('firm')} maxLength={200} />
          <Input label="Reviewed on" type="date" value={f.reviewed_on} onChange={set('reviewed_on')} />
        </div>
        <div>
          <div className="mb-1.5 text-subhead font-semibold">Jurisdiction</div>
          <Segmented value={f.jurisdiction} onChange={(v) => setF((x) => ({ ...x, jurisdiction: v }))} options={[...Object.entries(JURISDICTIONS).map(([value, label]) => ({ value, label })), { value: 'all', label: 'All three' }]} />
        </div>
        <div>
          <div className="mb-1.5 text-subhead font-semibold">Packs covered</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {packs.map((p) => (
              <button key={p.id} type="button" aria-pressed={f.pack_ids.includes(p.id)} onClick={() => toggle(p.id)}
                className={cx('pressable rounded-xl border px-3 py-2.5 text-left text-footnote font-semibold', f.pack_ids.includes(p.id) ? 'border-blue bg-blue/5 text-blue' : 'border-line')}>{p.title}</button>
            ))}
          </div>
        </div>
        <Textarea label="Scope" hint="Optional: what the review covered or excluded" rows={2} value={f.scope_note} onChange={set('scope_note')} />
        <Textarea label="Notes" hint="Optional" rows={2} value={f.notes} onChange={set('notes')} />
        <label className="flex cursor-pointer items-center gap-2 text-footnote font-semibold text-blue">
          <FileUp size={16} />{file ? file.name : 'Attach the review letter (optional)'}
          <input type="file" accept="application/pdf,image/*,.doc,.docx" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </label>
      </div>
    </Sheet>
  );
}

export default function LibraryTab() {
  const packs = useApi('contracts.packs');
  const lib = useApi('contracts.library');
  const reviews = useApi('contracts.legalReviews');
  const law = useApi('contracts.law');
  const [text, setText] = useState('');
  const [state, setState] = useState('');
  const [open, setOpen] = useState(null);
  const [recording, setRecording] = useState(false);
  const reload = () => { packs.reload(); lib.reload(); reviews.reload(); };
  const clauses = useMemo(() => {
    const t = text.trim().toLowerCase();
    return (lib.data || []).filter((c) => (!t || `${c.id} ${c.title}`.toLowerCase().includes(t))
      && (!state || Object.values(c.jurisdictions).some((x) => (state === 'update' ? x.update : x.current?.state === state))));
  }, [lib.data, text, state]);
  const openClause = open && lib.data?.find((c) => c.id === open);
  return (
    <>
      <p className="mb-4 max-w-2xl text-subhead text-muted">
        The wording contracts are built from. Research-based drafts are written from GOV.UK, ACAS, SIA and legislation sources, not by a solicitor.
        Approve wording for company use, or record a solicitor&apos;s review to mark the exact versions they checked as Legally reviewed.
      </p>
      <Section title="Packs"><PackGrid q={packs} /></Section>

      <Section title="Legal reviews" action={<Button size="sm" icon={Plus} disabled={!packs.data} onClick={() => setRecording(true)}>Record legal review</Button>}>
        <Load q={reviews} skeleton="rows">
          {(rows) => rows.length ? (
            <List>
              {rows.map((r) => <Row key={r.id} left={<Gavel size={18} className="text-green" />} title={`${r.reviewer_name}${r.firm ? `, ${r.firm}` : ''}`}
                subtitle={`${date(r.reviewed_on)} · ${r.jurisdiction === 'all' ? 'All three' : JUR_SHORT[r.jurisdiction]} · ${r.items} clause versions${r.letter_title ? ' · letter on file' : ''}${r.recorded_by_name ? ` · recorded by ${r.recorded_by_name}` : ''}`} />)}
            </List>
          ) : <Empty icon={Gavel} title="No legal reviews recorded" body="Until a solicitor reviews the wording, contracts show a Draft – pending legal review watermark while drafting." />}
        </Load>
      </Section>

      <Section title="Clauses">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <SearchInput className="min-w-0 flex-1 basis-60" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search clauses" />
          <Segmented value={state} onChange={setState} options={[{ value: '', label: 'All', icon: Layers }, { value: 'draft', label: 'Drafts', icon: FilePen }, { value: 'company', label: 'Approved', icon: BadgeCheck }, { value: 'legal', label: 'Reviewed', icon: Gavel }, { value: 'update', label: 'Updates', icon: RefreshCw }]} />
        </div>
        <Load q={lib} skeleton="rows">
          {() => clauses.length ? (
            <List className="max-h-[32rem] overflow-y-auto">
              {clauses.map((c) => {
                const xs = Object.entries(c.jurisdictions);
                return (
                  <Row key={c.id} chevron onClick={() => setOpen(c.id)} title={c.title}
                    subtitle={`${c.id}${c.packs.length ? ` · ${c.packs.length} pack${c.packs.length === 1 ? '' : 's'}` : ''} · ${xs.map(([j]) => (j === 'all' ? 'UK' : JUR_SHORT[j])).join(', ')}`}
                    right={<div className="flex gap-1">{xs.some(([, x]) => x.update) && <Pill tone="amber">Update</Pill>}<StatePill state={xs[0][1].current?.state} /></div>} />
                );
              })}
            </List>
          ) : <Empty title="No matching clauses" />}
        </Load>
      </Section>

      <Section title="Law watch">
        <Load q={law} skeleton="rows">
          {(rows) => (
            <List>
              {rows.map((l) => {
                const [label, tone] = LAW_STATUS[l.status] || [l.status, 'grey'];
                return (
                  <a key={l.id} href={l.url} target="_blank" rel="noreferrer" className={cx('block px-4 py-3', soon(l.effective_date) && 'bg-amber-soft/60')}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1 text-subhead font-semibold">{l.title}</span>
                      <Pill tone={tone}>{label}</Pill>
                    </div>
                    <div className="mt-0.5 text-footnote text-muted">
                      {l.jurisdictions.map((j) => JUR_SHORT[j]).join(', ')}{l.effective_date ? ` · ${l.status === 'in_force' ? 'from' : 'expected'} ${date(l.effective_date)}` : ''}{soon(l.effective_date) ? ' · within 90 days' : ''} · checked {date(l.checked_on)}
                    </div>
                    {l.summary && <p className="mt-1 text-footnote">{l.summary}</p>}
                  </a>
                );
              })}
            </List>
          )}
        </Load>
      </Section>

      {openClause && <ClauseSheet clause={openClause} onClose={() => setOpen(null)} onDone={reload} />}
      {recording && <ReviewSheet packs={packs.data.packs} onClose={() => setRecording(false)} onDone={() => { setRecording(false); reload(); }} />}
    </>
  );
}
