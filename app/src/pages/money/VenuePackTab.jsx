// Venue → Instructions & procedures: the venue's pack in order, AI drafting from the site's facts and the client's documents, and the signing register
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, BookText, CheckCircle2, Download, FileText, MessageSquare, PenLine, Plus, Sparkles, Upload } from 'lucide-react';
import { api, downloadAction } from '../../api.js';
import { HOME, useAuth } from '../../auth.jsx';
import {
  Button, Check, Chip, cx, date, dateTime, Empty, IconButton, List, Load, Pill, Row, SearchInput, Section, Segmented, Sheet, Textarea, Toggle, useAction, useApi, useToast,
} from '../../ui/index.jsx';
import { docKind, PackPill } from '../shared/PackPaper.jsx';
import { DocStatus, NewSheet } from '../people/procedures/Library.jsx';
import { DocSheet } from './VenueDetail.jsx';

export default function VenuePackTab({ venueId }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const q = useApi('venuePacks.get', { venue_id: venueId });
  const [sheet, setSheet] = useState(null); // 'ai' | 'new'
  const [run, busy] = useAction();
  const edit = (id) => nav(`${HOME[user.role]}/people/procedures/${id}`);
  const co = user.role === 'company';
  return (
    <Load q={q} skeleton="rows">
      {(d) => {
        const instr = d.documents.find((x) => x.kind === 'instructions');
        const byId = new Map(d.documents.map((x) => [x.id, x]));
        const off = d.documents.filter((x) => !x.in_pack);
        const move = (i, dir) => {
          const ids = d.pack.map((x) => x.procedure_id);
          [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
          q.setData((x) => ({ ...x, pack: ids.map((id) => x.pack.find((p) => p.procedure_id === id)) }));
          run(() => api('venuePacks.order', { venue_id: venueId, ids })).catch(q.reload);
        };
        const toggle = (doc, included) => run(() => api('venuePacks.toggle', { venue_id: venueId, procedure_id: doc.id, included }), included ? 'Added to this pack' : 'Switched off here').then(q.reload).catch(() => {});
        const write = () => run(() => api('procedures.save', { kind: 'instructions', venue_id: venueId, title: 'Assignment instructions', body: '' })).then((p) => edit(p.id)).catch(() => {});
        return (
          <div className="space-y-6">
            <div className="flex flex-wrap gap-2">
              <Chip value={d.counts.booked} label="booked" />
              <Chip value={d.counts.ok} label="up to date" tone={d.counts.ok ? 'green' : 'grey'} />
              <Chip value={d.counts.action} label="still to sign" tone={d.counts.action ? 'red' : 'grey'} />
              {d.open_suggestions > 0 && <Chip value={d.open_suggestions} label="suggested changes" tone="blue" />}
            </div>

            {!instr && (
              <div className="rounded-tile bg-surface p-5 shadow-tile">
                <div className="flex items-start gap-3">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-soft text-blue"><Sparkles size={22} /></div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-callout font-semibold">No assignment instructions yet</h3>
                    <p className="mt-0.5 text-subhead text-muted">Answer a few questions, tick the client's documents, and AI writes the instructions and suggests the procedures this site needs. You check and publish them.</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button icon={Sparkles} onClick={() => setSheet('ai')}>Create with AI</Button>
                      <Button variant="secondary" icon={PenLine} busy={busy} onClick={write}>Write by hand</Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            <Section title="In the pack, in reading order" action={<div className="flex gap-1.5">
              {instr && <Button size="sm" variant="secondary" icon={Sparkles} onClick={() => setSheet('ai')}>Redraft with AI</Button>}
              <Button size="sm" icon={Plus} onClick={() => setSheet('new')}>Procedure</Button>
            </div>}>
              {d.pack.length ? (
                <List>
                  {d.pack.map((p, i) => {
                    const doc = byId.get(p.procedure_id) || {};
                    return (
                      <div key={p.procedure_id} className="flex items-center gap-2 px-4 py-3">
                        <span className="num w-5 shrink-0 text-footnote font-bold text-faint">{i + 1}</span>
                        <button type="button" onClick={() => edit(p.procedure_id)} className="pressable min-w-0 flex-1 text-left">
                          <span className="block truncate text-body font-semibold">{p.title}</span>
                          <span className="block truncate text-footnote text-muted">{docKind(p)} · v{p.version} · {date(p.published_at)}</span>
                        </button>
                        {doc.has_draft && <Pill tone="amber">Changes</Pill>}
                        {p.kind !== 'instructions' && <>
                          <IconButton size="sm" icon={ArrowUp} label="Move up" disabled={i === 0 || d.pack[i - 1].kind === 'instructions' || busy} onClick={() => move(i, -1)} />
                          <IconButton size="sm" icon={ArrowDown} label="Move down" disabled={i === d.pack.length - 1 || busy} onClick={() => move(i, 1)} />
                        </>}
                        {p.scope === 'general' && co && <Toggle checked label={<span className="sr-only">{`${p.title} at this venue`}</span>} onChange={() => toggle(doc, false)} />}
                      </div>
                    );
                  })}
                </List>
              ) : <Empty icon={BookText} title="Nothing published yet" body="Officers are not asked to sign anything here until a document is published." />}
              {d.pack.some((p) => p.scope === 'general') && co && <p className="mt-1.5 px-1 text-caption text-faint">Switch a company-wide procedure off to turn it off at this venue only. It saves straight away.</p>}
            </Section>

            {off.length > 0 && (
              <Section title="Not in the pack">
                <List>
                  {off.map((x) => (
                    <Row key={x.id} onClick={() => edit(x.id)} title={x.title}
                      subtitle={`${docKind(x)} · ${x.current_version ? (x.scope === 'general' ? 'switched off here' : 'archived') : 'draft, not published yet'}`}
                      right={<span className="flex items-center gap-2">
                        <DocStatus d={x} />
                        {x.scope === 'general' && x.current_version > 0 && co && <Button size="sm" variant="secondary" busy={busy} onClick={(e) => { e.stopPropagation(); toggle(x, true); }}>Add</Button>}
                      </span>} />
                  ))}
                </List>
              </Section>
            )}

            <Register venueId={venueId} />
            {d.open_suggestions > 0 && <Suggestions venueId={venueId} onOpen={edit} />}

            {sheet === 'ai' && <AiPackSheet venueId={venueId} venueName={d.venue.name} onClose={() => { setSheet(null); q.reload(); }} onEdit={edit} />}
            {sheet === 'new' && <NewSheet ai venueId={venueId} onClose={() => setSheet(null)} onCreated={(p) => edit(p.id)} />}
          </div>
        );
      }}
    </Load>
  );
}

/** Questions, the client's documents, then one AI pass: the instructions plus the procedures worth writing */
function AiPackSheet({ venueId, venueName, onClose, onEdit }) {
  const q = useApi('venuePacks.ai.questions', { venue_id: venueId });
  const store = `venuePackAnswers:${venueId}`;
  const [answers, setAnswers] = useState(() => { try { return JSON.parse(localStorage.getItem(store)) || {}; } catch { return {}; } });
  const [ids, setIds] = useState([]);
  const [upload, setUpload] = useState(false);
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState(null);
  const toast = useToast();
  useEffect(() => { try { localStorage.setItem(store, JSON.stringify(answers)); } catch { /* full or private */ } }, [answers, store]);
  const draft = async () => {
    setBusy(true);
    try { setOut(await api('venuePacks.ai.draft', { venue_id: venueId, answers, document_ids: ids })); } catch (e) { toast(e.message, 'error'); } finally { setBusy(false); }
  };
  if (out) return <AiResult out={out} venueId={venueId} venueName={venueName} onClose={onClose} onEdit={onEdit} />;
  return (
    <Sheet open onClose={busy ? () => {} : onClose} size="lg" title={`Create with AI: ${venueName}`}
      footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button icon={Sparkles} busy={busy} onClick={draft}>{busy ? 'Writing… about a minute' : 'Draft the instructions'}</Button></>}>
      <Load q={q} skeleton="rows">{({ questions, sources }) => (
        <div className="space-y-5">
          <p className="text-subhead text-muted">Answer what you can. The AI also uses what the app knows (address, roles and shift times, recent incident types) and UK good practice. Anything it cannot know is marked [To confirm]. Do not type alarm, safe or door codes.</p>
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-footnote font-semibold uppercase tracking-wide text-muted">Client documents to read</h3>
              <Button size="sm" variant="ghost" icon={Upload} onClick={() => setUpload(true)}>Upload</Button>
            </div>
            {sources.length ? (
              <List>
                {sources.map((s) => (
                  <label key={s.id} className={cx('flex items-center gap-3 px-4 py-3', s.readable ? 'cursor-pointer' : 'opacity-60')}>
                    <Check checked={ids.includes(s.id)} label={s.title} onChange={(on) => s.readable && setIds((x) => (on ? (x.length < 4 ? [...x, s.id] : x) : x.filter((i) => i !== s.id)))} />
                    <FileText size={16} className="shrink-0 text-muted" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-subhead font-semibold">{s.title}</span>
                      <span className="block text-caption text-muted">{s.readable ? `Added ${date(s.created_at)}` : 'This file type cannot be read'}</span></span>
                  </label>
                ))}
              </List>
            ) : <p className="rounded-2xl bg-bg p-3 text-footnote text-muted">No documents yet. Upload the client's site instructions, risk assessment or site plan (PDF, image or Word) and the AI will read them.</p>}
            {sources.length > 0 && <p className="mt-1 px-1 text-caption text-faint">Up to 4 documents.</p>}
          </div>
          <div className="space-y-3">
            {questions.map((x) => (
              <Textarea key={x.key} label={x.label} hint={x.hint} rows={2} maxLength={2000} value={answers[x.key] || ''} onChange={(e) => setAnswers((a) => ({ ...a, [x.key]: e.target.value }))} />
            ))}
          </div>
          {upload && <DocSheet venueId={venueId} onClose={() => setUpload(false)} onSaved={q.reload} />}
        </div>
      )}</Load>
    </Sheet>
  );
}

function AiResult({ out, venueId, venueName, onClose, onEdit }) {
  const [made, setMade] = useState({});
  const [working, setWorking] = useState(null);
  const toast = useToast();
  const make = async (s) => {
    setWorking(s.title);
    try {
      const p = await api('procedures.ai.draft', { title: s.title, why: s.why, venue_id: venueId, site_facts: out.site_facts });
      setMade((m) => ({ ...m, [s.title]: p.id }));
    } catch (e) { toast(e.message, 'error'); } finally { setWorking(null); }
  };
  return (
    <Sheet open onClose={working ? () => {} : onClose} size="lg" title="Draft ready"
      footer={<><Button variant="secondary" disabled={!!working} onClick={onClose}>Done for now</Button><Button disabled={!!working} onClick={() => onEdit(out.instructions.id)}>Check the instructions</Button></>}>
      <div className="space-y-5">
        <p className="flex gap-2 rounded-2xl bg-green-soft p-3 text-footnote text-ink"><CheckCircle2 size={16} className="mt-0.5 shrink-0 text-green" />
          The assignment instructions for {venueName} are saved as a draft. Officers see nothing until you check and publish them.</p>
        {(out.used.length > 0 || out.skipped.length > 0) && (
          <p className="text-footnote text-muted">
            {out.used.length > 0 && `Read: ${out.used.join(', ')}. `}
            {out.skipped.map((s) => `${s.title} was skipped (${s.why}).`).join(' ')}
          </p>
        )}
        {out.to_confirm.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-footnote font-semibold uppercase tracking-wide text-muted">To confirm before publishing ({out.to_confirm.length})</h3>
            <ul className="list-disc space-y-1 rounded-2xl bg-amber-soft py-3 pl-8 pr-3 text-footnote">{out.to_confirm.map((t) => <li key={t}>{t}</li>)}</ul>
          </div>
        )}
        {out.suggestions.length > 0 && (
          <div>
            <h3 className="mb-1.5 text-footnote font-semibold uppercase tracking-wide text-muted">Procedures this site needs</h3>
            <List>
              {out.suggestions.map((s) => (
                <Row key={s.title} title={s.title} subtitle={s.why}
                  right={made[s.title]
                    ? <Button size="sm" variant="ghost" onClick={() => onEdit(made[s.title])}>Open</Button>
                    : <Button size="sm" variant="secondary" icon={Sparkles} busy={working === s.title} disabled={!!working && working !== s.title} onClick={() => make(s)}>Draft</Button>} />
              ))}
            </List>
            <p className="mt-1 px-1 text-caption text-faint">Each draft takes about a minute and is saved for you to check.</p>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/** Who has read and signed, who is booked and still has to, with every signing and its sealed PDF */
export function Register({ venueId }) {
  const [filter, setFilter] = useState('booked');
  const [term, setTerm] = useState('');
  const history = filter === 'history';
  const q = useApi('venuePacks.register', { venue_id: venueId, filter: history ? undefined : filter === 'all' ? undefined : filter, history: history || undefined });
  const [run, busy] = useAction();
  const pdf = (id) => run(() => downloadAction('venuePacks.pdf', { id })).catch(() => {});
  const exp = (format) => run(() => downloadAction('venuePacks.export', { venue_id: venueId, format })).catch(() => {});
  const t = term.trim().toLowerCase();
  return (
    <Section title="Signing register" action={<div className="flex gap-1.5">
      <Button size="sm" variant="secondary" icon={Download} busy={busy} onClick={() => exp('pdf')}>PDF</Button>
      <Button size="sm" variant="secondary" icon={Download} busy={busy} onClick={() => exp('csv')}>CSV</Button>
    </div>}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented value={filter} onChange={setFilter} options={[
          { value: 'booked', label: 'Booked' }, { value: 'action', label: 'To sign' }, { value: 'current', label: 'Up to date' }, { value: 'all', label: 'Everyone' }, { value: 'history', label: 'All signings' },
        ]} />
        <SearchInput className="min-w-0 flex-1 sm:max-w-xs" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search name or reference" />
      </div>
      <Load q={q} skeleton="rows">{(r) => {
        if (history) {
          const rows = (r.signings || []).filter((g) => !t || `${g.name} ${g.reference}`.toLowerCase().includes(t));
          return rows.length ? (
            <List>
              {rows.map((g) => (
                <Row key={g.id} onClick={() => pdf(g.id)} title={g.name}
                  subtitle={`${dateTime(g.signed_at)} · ${g.reference} · ${g.documents.map((x) => `${x.title} v${x.version}`).join(', ')}`}
                  right={<Download size={16} className="text-blue" />} />
              ))}
            </List>
          ) : <Empty icon={PenLine} title="No signings yet" />;
        }
        const rows = r.rows.filter((x) => !t || `${x.name} ${x.reference || ''}`.toLowerCase().includes(t));
        return rows.length ? (
          <List>
            {rows.map((x) => (
              <Row key={x.officer_id} title={x.name}
                subtitle={[
                  x.next_shift ? `Next shift ${dateTime(x.next_shift)}` : 'No upcoming shift',
                  x.signed_at ? `signed ${date(x.signed_at)} (${x.reference})` : null,
                  x.to_read && x.status !== 'current' ? `${x.to_read} to read` : null,
                ].filter(Boolean).join(' · ')}
                right={<span className="flex items-center gap-2"><PackPill status={x.status} />{x.signing_id && <IconButton size="sm" icon={Download} label="Signed PDF" onClick={() => pdf(x.signing_id)} />}</span>} />
            ))}
          </List>
        ) : <Empty icon={PenLine} title={filter === 'action' ? 'Everyone booked has signed' : 'No one here yet'} body={filter === 'booked' ? 'Officers appear once they are booked at this venue.' : undefined} />;
      }}</Load>
    </Section>
  );
}

function Suggestions({ venueId, onOpen }) {
  const q = useApi('venuePacks.suggestions', { venue_id: venueId });
  return (
    <Section title="Suggested changes">
      <Load q={q} skeleton="rows">{({ suggestions }) => (
        <List>
          {suggestions.filter((s) => s.status === 'open').map((s) => (
            <Row key={s.id} onClick={() => onOpen(s.procedure_id)} left={<MessageSquare size={18} className="text-blue" />} title={s.procedure_title}
              subtitle={`${s.author_name || 'Client'} · ${date(s.created_at)} · ${s.body}`} />
          ))}
        </List>
      )}</Load>
    </Section>
  );
}
