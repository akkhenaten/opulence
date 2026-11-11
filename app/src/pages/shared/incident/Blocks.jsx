// The writing page's body: free text with blocks dropped in between — photos, files, people and the emergency facts.
// Text is borderless and grows as it is written; typing "/" at the start of a line opens the insert menu.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Ambulance, FileText, Hand, ImagePlus, Loader2, Pencil, Siren, Trash2, UserRound, X } from 'lucide-react';
import { cx, IconButton, Input, Pressable, Textarea } from '../../../ui/index.jsx';
import { isImage } from '../evidence.jsx';
import { FactFields } from './Props.jsx';
import { SlashMenu, slashItems } from './InsertBar.jsx';

export const newId = () => Math.random().toString(36).slice(2, 10);
export const textBlock = (text = '') => ({ id: newId(), kind: 'text', text });
export const FACTS = ['police', 'ambulance', 'force'];
export const PERSON_ROLES = [
  { value: 'witness', label: 'Witness' }, { value: 'involved', label: 'Involved' }, { value: 'injured', label: 'Injured' }, { value: 'staff', label: 'Staff' },
];
export const blankPerson = () => ({ id: newId(), kind: 'person', name: '', role: 'witness', contact: '', statement: '', injuries: '' });

/**
 * Put new blocks where the cursor is: the text block is split around them. An empty "before" part is replaced,
 * and the page always ends with a text block so there is somewhere to keep writing.
 */
export function insertAt(blocks, at, add) {
  const i = at ? blocks.findIndex((b) => b.id === at.id) : -1;
  let out;
  if (i < 0) {
    const last = blocks[blocks.length - 1];
    out = last?.kind === 'text' && !last.text.trim() ? [...blocks.slice(0, -1), ...add] : [...blocks, ...add];
  } else {
    const b = blocks[i];
    if (b.kind !== 'text') out = [...blocks.slice(0, i + 1), ...add, ...blocks.slice(i + 1)];
    else {
      const pos = Math.min(at.pos ?? b.text.length, b.text.length);
      const before = b.text.slice(0, pos).replace(/\s+$/, '');
      const after = b.text.slice(pos).replace(/^\s+/, '');
      out = [...blocks.slice(0, i), ...(before ? [{ ...b, text: before }] : []), ...add, ...(after ? [textBlock(after)] : []), ...blocks.slice(i + 1)];
    }
  }
  if (out[out.length - 1]?.kind !== 'text') out.push(textBlock());
  // Two text blocks side by side read as one paragraph break; keep them apart only when a block sits between
  return out.length ? out : [textBlock()];
}

// Borderless text that grows with what is written. A raw textarea: the kit's one always draws a field border
export function Prose({ value, onChange, inputRef, className, ...p }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea ref={(el) => { ref.current = el; if (inputRef) inputRef(el); }} rows={1} value={value} onChange={onChange}
      className={cx('block w-full resize-none overflow-hidden bg-transparent text-callout leading-relaxed text-ink outline-none placeholder:text-faint', className)} {...p} />
  );
}

/** The slash at the start of a line, before the cursor, with nothing else on the line */
const slashAt = (text, pos) => {
  const start = text.lastIndexOf('\n', pos - 1) + 1;
  const end = text.indexOf('\n', pos);
  const m = /^\/(\w*)$/.exec(text.slice(start, pos));
  return m && !text.slice(pos, end < 0 ? text.length : end).trim() ? { start, q: m[1].toLowerCase() } : null;
};

export function Blocks({ blocks, setBlocks, v, setV, setFact, resolve, captions, onOpen, onEditPhoto, onRemoveRef, onAddTo, onInsert, onCursor, placeholder, readOnly }) {
  const refs = useRef({});
  const [slash, setSlash] = useState(null); // { id, start, pos, q, i }
  const focusNext = useRef(null);
  useEffect(() => {
    const f = focusNext.current;
    if (!f) return;
    focusNext.current = null;
    const el = refs.current[f.id];
    if (el) { el.focus(); el.setSelectionRange(f.pos, f.pos); }
  });

  const patch = (id, p) => setBlocks((bs) => bs.map((b) => (b.id === id ? { ...b, ...p } : b)));
  const drop = (b) => {
    if (FACTS.includes(b.kind)) { setFact(b.kind, false); return; }
    setBlocks((bs) => { const n = bs.filter((x) => x.id !== b.id); return n.length ? n : [textBlock()]; });
    (b.items || []).forEach((r) => onRemoveRef(r));
  };
  const items = slash ? slashItems(slash.q) : [];
  const choose = (it) => {
    const b = blocks.find((x) => x.id === slash.id);
    const text = b.text.slice(0, slash.start) + b.text.slice(slash.pos);
    setSlash(null);
    patch(b.id, { text });
    onInsert(it.kind, { id: b.id, pos: slash.start });
  };
  const track = (b, e) => {
    const el = e.target;
    const pos = el.selectionStart;
    onCursor({ id: b.id, pos });
    const s = slashAt(el.value, pos);
    setSlash((cur) => (s ? { id: b.id, pos, ...s, i: cur?.id === b.id && cur.q === s.q ? cur.i : 0 } : null));
  };
  const keys = (b, i) => (e) => {
    if (slash?.id === b.id && items.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const d = e.key === 'ArrowDown' ? 1 : -1;
        setSlash((s) => ({ ...s, i: (s.i + d + items.length) % items.length }));
        return;
      }
      if (e.key === 'Enter') { e.preventDefault(); choose(items[slash.i] || items[0]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setSlash(null); return; }
    }
    // Backspace in an empty paragraph joins up with the text above it
    if (e.key === 'Backspace' && !b.text && blocks.length > 1 && e.target.selectionStart === 0) {
      const prev = blocks.slice(0, i).reverse().find((x) => x.kind === 'text');
      if (!prev) return;
      e.preventDefault();
      focusNext.current = { id: prev.id, pos: prev.text.length };
      setBlocks((bs) => bs.filter((x) => x.id !== b.id));
    }
  };
  const firstText = blocks.find((b) => b.kind === 'text')?.id;

  return (
    <div className="space-y-3">
      {blocks.map((b, i) => {
        if (b.kind === 'text') {
          const lone = blocks.length === 1 || (b.id === firstText && !blocks.some((x) => x.kind === 'text' && x.text));
          return (
            <div key={b.id} className="relative">
              <Prose inputRef={(el) => { refs.current[b.id] = el; }} value={b.text} readOnly={readOnly} aria-label="Report notes"
                placeholder={lone ? placeholder : i === blocks.length - 1 ? 'Keep writing, or type / to add something' : ''}
                onChange={(e) => { patch(b.id, { text: e.target.value }); track(b, e); }}
                onSelect={(e) => track(b, e)} onFocus={(e) => onCursor({ id: b.id, pos: e.target.selectionStart })}
                onBlur={() => setTimeout(() => setSlash((s) => (s?.id === b.id ? null : s)), 150)}
                onKeyDown={keys(b, i)} className={lone ? 'min-h-[9rem]' : ''} />
              {slash?.id === b.id && items.length > 0 && <SlashMenu items={items} active={slash.i} onPick={choose} />}
            </div>
          );
        }
        if (b.kind === 'photo' || b.kind === 'file') {
          return <MediaBlock key={b.id} b={b} resolve={resolve} captions={captions} onOpen={onOpen} onEdit={onEditPhoto} readOnly={readOnly}
            onRemove={(r) => { const left = b.items.filter((x) => x !== r); if (left.length) patch(b.id, { items: left }); else drop({ ...b, items: [] }); onRemoveRef(r); }}
            onAdd={() => onAddTo(b)} onDrop={() => drop(b)} />;
        }
        if (b.kind === 'person') return <PersonBlock key={b.id} b={b} patch={(p) => patch(b.id, p)} onDrop={() => drop(b)} readOnly={readOnly} />;
        if (FACTS.includes(b.kind)) return <FactBlock key={b.id} kind={b.kind} v={v} setV={setV} setFact={setFact} onDrop={() => drop(b)} readOnly={readOnly} />;
        return null;
      })}
    </div>
  );
}

function BlockCard({ icon: I, tone = 'text-blue', title, onDrop, readOnly, children, label }) {
  return (
    <section className="anim-pop rounded-2xl border border-hairline bg-surface p-3.5 shadow-tile" aria-label={label || title}>
      <div className="mb-2 flex items-center gap-2">
        <I size={18} className={cx('shrink-0', tone)} aria-hidden />
        <h3 className="min-w-0 flex-1 truncate text-subhead font-bold">{title}</h3>
        {!readOnly && onDrop && <IconButton icon={X} size="sm" label={`Remove ${title.toLowerCase()}`} onClick={onDrop} />}
      </div>
      {children}
    </section>
  );
}

function PersonBlock({ b, patch, onDrop, readOnly }) {
  const set = (k) => (e) => patch({ [k]: e.target.value });
  const role = PERSON_ROLES.find((r) => r.value === b.role)?.label || 'Person';
  return (
    <BlockCard icon={UserRound} title={b.name ? `${role} · ${b.name}` : role} onDrop={onDrop} readOnly={readOnly} label="Person">
      <div className="no-scrollbar -mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1">
        {PERSON_ROLES.map((r) => (
          <Pressable press key={r.value} disabled={readOnly} onClick={() => patch({ role: r.value })} aria-pressed={b.role === r.value}
            className={cx('relative h-8 shrink-0 rounded-full px-3 text-footnote font-semibold before:absolute before:inset-x-0 before:-inset-y-1.5', b.role === r.value ? 'bg-blue text-white' : 'bg-bg text-ink')}>
            {r.label}
          </Pressable>
        ))}
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Input label="Name or description" value={b.name} onChange={set('name')} autoComplete="off" readOnly={readOnly} placeholder="e.g. Sam Patel, or male, about 30, red jacket" />
        <Input label="Phone or email" value={b.contact} onChange={set('contact')} autoComplete="off" readOnly={readOnly} />
      </div>
      <Textarea className="mt-2.5" label={b.role === 'witness' ? 'What they saw' : 'What they said or did'} autoGrow minRows={2} value={b.statement} onChange={set('statement')} readOnly={readOnly} />
      {(b.role === 'injured' || b.injuries) && (
        <Input className="mt-2.5" label="Injuries" value={b.injuries} onChange={set('injuries')} readOnly={readOnly} placeholder="e.g. Cut above left eye, treated by first aider" />
      )}
    </BlockCard>
  );
}

const FACT_HEAD = {
  police: { icon: Siren, title: 'Police called', tone: 'text-blue' },
  ambulance: { icon: Ambulance, title: 'Ambulance called', tone: 'text-red' },
  force: { icon: Hand, title: 'Force used', tone: 'text-red' },
};
function FactBlock({ kind, v, setV, setFact, onDrop, readOnly }) {
  const h = FACT_HEAD[kind];
  return (
    <BlockCard icon={h.icon} tone={h.tone} title={h.title} onDrop={onDrop} readOnly={readOnly}>
      <FactFields kind={kind} v={v} setV={setV} setFact={setFact} bare />
    </BlockCard>
  );
}

// Photos sit in a strip that scrolls sideways on phones; files are a short list
export function MediaBlock({ b, resolve, captions, onOpen, onEdit, onRemove, onAdd, onDrop, readOnly }) {
  const rows = b.items.map((r) => ({ ref: r, ...resolve(r) })).filter((x) => x.name || x.url);
  if (!rows.length) return null;
  const photo = b.kind === 'photo';
  return (
    <section className="anim-pop" aria-label={photo ? 'Photos' : 'Files'}>
      <div className={cx(photo ? 'no-scrollbar -mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1' : 'space-y-1.5')}>
        {rows.map((x) => {
          const cap = captions[x.key]?.caption;
          if (!photo || !isImage(x.mime)) {
            return (
              <div key={x.ref} className="flex items-center gap-3 rounded-2xl bg-bg px-3 py-2.5">
                <FileText size={20} className="shrink-0 text-blue" aria-hidden />
                <Pressable press onClick={() => onOpen(x)} disabled={!x.url} className="min-w-0 flex-1 truncate text-subhead font-semibold">{x.name}</Pressable>
                {x.status === 'uploading' && <Loader2 size={16} className="animate-spin text-muted" aria-label="Uploading" />}
                {x.status === 'error' && <span className="text-caption font-semibold text-red">Upload failed</span>}
                {!readOnly && x.can_remove !== false && <IconButton icon={Trash2} size="sm" label={`Remove ${x.name}`} onClick={() => onRemove(x.ref)} />}
              </div>
            );
          }
          return (
            <figure key={x.ref} className="w-40 shrink-0 snap-start sm:w-48">
              <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-bg">
                <Pressable press onClick={() => onOpen(x)} className="block h-full w-full" aria-label={`Open ${x.name}`}>
                  <img src={x.url} alt={cap || ''} className="h-full w-full object-cover" />
                </Pressable>
                {x.status === 'uploading' && <div className="pointer-events-none absolute inset-0 grid place-items-center bg-ink/35 text-white"><Loader2 size={20} className="animate-spin" /></div>}
                {x.status === 'error' && <div className="pointer-events-none absolute inset-0 grid place-items-center bg-red/80 p-2 text-center text-caption2 font-semibold text-white">Upload failed</div>}
                {!readOnly && (
                  <div className="absolute right-1.5 top-1.5 flex gap-1.5">
                    {x.key && <Pressable press aria-label="Caption, crop or blur" onClick={() => onEdit(x)} className="relative grid h-8 w-8 place-items-center rounded-full bg-ink/70 text-white before:absolute before:-inset-1.5"><Pencil size={14} /></Pressable>}
                    {x.can_remove !== false && <Pressable press aria-label={`Remove ${x.name}`} onClick={() => onRemove(x.ref)} className="relative grid h-8 w-8 place-items-center rounded-full bg-ink/70 text-white before:absolute before:-inset-1.5"><Trash2 size={14} /></Pressable>}
                  </div>
                )}
              </div>
              {(cap || (!readOnly && x.key)) && (
                <figcaption>
                  <Pressable press disabled={readOnly || !x.key} onClick={() => onEdit(x)} className={cx('mt-1 line-clamp-2 w-full px-0.5 text-caption', cap ? 'text-muted' : 'text-faint')}>
                    {cap || 'Add a caption'}
                  </Pressable>
                </figcaption>
              )}
            </figure>
          );
        })}
        {photo && !readOnly && (
          <Pressable press onClick={onAdd} aria-label="Add photos here"
            className="grid aspect-[4/3] w-24 shrink-0 snap-start place-items-center rounded-2xl border-2 border-dashed border-line text-muted">
            <ImagePlus size={20} aria-hidden />
          </Pressable>
        )}
      </div>
      {!readOnly && rows.length > 1 && (
        <div className="mt-1 flex justify-end"><Pressable press onClick={onDrop} className="relative px-1 text-caption font-semibold text-muted before:absolute before:inset-x-0 before:-inset-y-3">Remove all {rows.length}</Pressable></div>
      )}
    </section>
  );
}
