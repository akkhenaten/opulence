// Clauses: the wording the document uses, slot by slot. Alternatives, optional clauses and wording written for this document only.
import { useRef, useState } from 'react';
import { BadgeCheck, Bold, ExternalLink, Heading, List as ListIcon, PenLine, Undo2 } from 'lucide-react';
import { Button, cx, IconButton, Pill, Select, Toggle } from '../../../ui/index.jsx';
import { edit, lineStart } from '../_esign.jsx';
import { ORIGIN, StatePill } from './_shared.jsx';

function WordingEditor({ initial, onCancel, onSave, busy, error }) {
  const [body, setBody] = useState(initial);
  const ta = useRef(null);
  const tool = (kind) => edit(ta.current, setBody, (pre, sel, post) => {
    if (kind === 'bold') { const s = sel || 'bold text'; return [`${pre}**${s}**${post}`, pre.length + s.length + 4]; }
    const s = `${lineStart(pre)}${kind === 'heading' ? '## ' : '- '}${sel}`;
    return [pre + s + post, pre.length + s.length];
  });
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center gap-1">
        <Button size="sm" variant="ghost" icon={Heading} onClick={() => tool('heading')}>Sub-heading</Button>
        <IconButton size="sm" icon={Bold} label="Bold" onClick={() => tool('bold')} />
        <IconButton size="sm" icon={ListIcon} label="Bullet point" onClick={() => tool('bullet')} />
      </div>
      <textarea ref={ta} value={body} onChange={(e) => setBody(e.target.value)} spellCheck aria-label="Clause wording" rows={9}
        className="w-full rounded-xl border border-line bg-surface p-3 font-mono text-footnote leading-relaxed outline-none focus:border-blue focus:ring-4 focus:ring-blue/10" />
      {error && <p className="mt-1 text-footnote text-red" role="alert">{error}</p>}
      <p className="mt-1 text-caption text-faint">Values in {'{{ }}'} come from the Guide. Wording written here is used in this document only and is flagged for review.</p>
      <div className="mt-2 flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button size="sm" busy={busy} disabled={!body.trim() || body === initial} onClick={() => onSave(body)}>Use this wording</Button>
      </div>
    </div>
  );
}

function Slot({ slotId, slot, m, onPatch, draft }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showSources, setShowSources] = useState(false);
  const chosen = slot.clauses.find((c) => c.id === m?.clause);
  const included = !!m;
  const save = async (body) => {
    setBusy(true); setError(null);
    try { await onPatch({ bespoke: { [m.clause]: { body } } }, { now: true }); setEditing(false); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return (
    <div id={`slot-${slotId}`} className={cx('rounded-xl border border-line p-3 transition-shadow', !included && 'bg-bg')}>
      <div id={m ? `clause-${m.clause}` : undefined} className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1 basis-40">
          <div className={cx('text-subhead font-semibold', !included && 'text-muted')}>{m?.title || slot.clauses[0]?.title}</div>
          {included
            ? <div className="mt-1 flex flex-wrap items-center gap-1.5"><StatePill state={m.state} /><span className="text-caption text-muted">{ORIGIN[m.origin]}{m.version ? ` · v${m.version}` : ''}</span></div>
            : <div className="text-caption text-muted">{slot.optional ? 'Switched off' : 'Left out: it depends on your answers in the Guide'}</div>}
          {included && (m.why || slot.why) && <div className="mt-1 text-caption text-faint">{m.why || slot.why}</div>}
        </div>
        {slot.optional && <div className="-my-2 shrink-0"><Toggle checked={included} onChange={(on) => onPatch({ selections: { [slotId]: { on } } })} label={<span className="sr-only">Include</span>} /></div>}
      </div>

      {included && slot.clauses.length > 1 && (
        <Select className="mt-2" label="Wording" value={m.clause}
          options={slot.clauses.map((c) => ({ value: c.id, label: `${c.title}${c.state === 'draft' ? ' · Research-based draft' : c.state === 'company' ? ' · Company-approved' : c.state === 'legal' ? ' · Legally reviewed' : ''}` }))}
          onChange={(e) => onPatch({ selections: { [slotId]: { clause: e.target.value } } })} />
      )}

      {included && !editing && (
        <div className="mt-2 flex flex-wrap gap-1">
          <Button size="sm" variant="ghost" icon={PenLine} onClick={() => setEditing(true)}>Edit wording</Button>
          {m.origin === 'bespoke' && <Button size="sm" variant="ghost" icon={Undo2} onClick={() => onPatch({ bespoke: { [m.clause]: null } })}>Back to library wording</Button>}
          {chosen?.sources?.length > 0 && <Button size="sm" variant="ghost" onClick={() => setShowSources((x) => !x)}>Sources ({chosen.sources.length})</Button>}
        </div>
      )}
      {showSources && !editing && (
        <ul className="mt-1 space-y-1 text-footnote">
          {chosen.sources.map((s) => <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-blue">{s.title}<ExternalLink size={12} /></a></li>)}
        </ul>
      )}
      {editing && <WordingEditor initial={draft.bespoke?.[m.clause]?.body || chosen?.body || ''} busy={busy} error={error} onCancel={() => { setEditing(false); setError(null); }} onSave={save} />}
    </div>
  );
}

export default function ClauseList({ v, onPatch, onApproveAll, approving }) {
  const { pack, result, slots, draft } = v;
  const bySlot = Object.fromEntries(result.manifest.map((m) => [m.slot, m]));
  const drafts = result.manifest.filter((m) => m.state === 'draft').length;
  const sections = (pack.clauses || []).map((s) => ({ ...s, slots: Object.entries(slots).filter(([, x]) => x.section === s.id) })).filter((s) => s.slots.length);
  return (
    <div className="space-y-4 pb-6">
      <div className="rounded-2xl bg-surface p-4 shadow-tile">
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1 basis-56 text-footnote text-muted">
            {result.manifest.length} clauses in this document.{' '}
            {drafts ? <><b className="text-amber">{drafts} still a Research-based draft</b>: approve them for use by your company before sending.</> : 'Every clause is approved for use.'}
          </div>
          {drafts > 0 && <Button size="sm" icon={BadgeCheck} busy={approving} onClick={onApproveAll}>Approve all for company use</Button>}
        </div>
        <p className="mt-2 text-caption text-faint">Approving records your name and makes the wording Company-approved in your library. Only a review you record in Settings → Contract library makes wording Legally reviewed.</p>
      </div>
      {sections.map((s) => (
        <section key={s.id} id={`sec-${s.id}`} className="rounded-2xl bg-surface p-4 shadow-tile">
          <h3 className="mb-3 flex items-center gap-2 text-headline font-bold">{s.title}{s.slots.every(([id]) => !bySlot[id]) && <Pill tone="grey">Not included</Pill>}</h3>
          <div className="space-y-2">
            {s.slots.map(([id, slot]) => <Slot key={id} slotId={id} slot={slot} m={bySlot[id]} onPatch={onPatch} draft={draft} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
