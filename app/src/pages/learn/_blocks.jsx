// Lesson visuals and activities: picture, key facts, step flow, do/don't panels and the "What would you do?" options card.
// Officers see them in a section; company managers edit them in the course editor.
import { useRef, useState } from 'react';
import { Check, ImagePlus, Lightbulb, Plus, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { upload } from '../../api.js';
import { Button, cx, IconButton, Input, Select, Textarea } from '../../ui/index.jsx';
import { compressImage } from '../officer/_parts.jsx';
import { Lightbox } from '../everyday/_parts.jsx';

export const RATING = {
  best: { label: 'Best practice', cls: 'bg-green-soft text-green', ring: 'ring-green' },
  ok: { label: 'Acceptable', cls: 'bg-amber-soft text-amber', ring: 'ring-amber' },
  poor: { label: 'Poor', cls: 'bg-red-soft text-red', ring: 'ring-red' },
};
const RATING_OPTIONS = Object.entries(RATING).map(([value, r]) => ({ value, label: r.label }));
const find = (blocks, type) => (blocks || []).find((b) => b.type === type);

export function HeroImage({ blocks }) {
  const img = find(blocks, 'image');
  const [open, setOpen] = useState(null);
  if (!img?.url) return null;
  return (
    <figure className="-mx-1 mb-4">
      <button type="button" onClick={() => setOpen(0)} className="block aspect-video w-full overflow-hidden rounded-2xl bg-[#EEF0F3]">
        <img src={img.url} alt={img.caption || ''} loading="lazy" className="h-full w-full object-cover" />
      </button>
      {img.caption && <figcaption className="mt-1.5 px-1 text-[13px] text-muted">{img.caption}</figcaption>}
      <Lightbox photos={[img]} index={open} onClose={() => setOpen(null)} />
    </figure>
  );
}

// Everything except the picture, in a fixed order
export function Blocks({ blocks }) {
  if (!blocks?.length) return null;
  return (
    <div className="mt-5 space-y-5">
      {blocks.map((b) => {
        if (b.type === 'key_facts') return <KeyFacts key={b.type} b={b} />;
        if (b.type === 'steps') return <StepFlow key={b.type} b={b} />;
        if (b.type === 'dos_donts') return <DosDonts key={b.type} b={b} />;
        if (b.type === 'options') return <OptionsCard key={b.type} b={b} />;
        return null;
      })}
    </div>
  );
}

function KeyFacts({ b }) {
  return (
    <div className={cx('grid gap-2.5', b.facts.length === 1 ? 'grid-cols-1' : b.facts.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2 lg:grid-cols-4')}>
      {b.facts.map((f, i) => (
        <div key={i} className="min-w-0 rounded-2xl bg-blue-soft px-4 py-3.5">
          <div className="break-words font-display text-[28px] font-bold leading-none text-blue">{f.value}</div>
          <div className="mt-1.5 text-[14px] font-semibold leading-snug text-ink">{f.label}</div>
        </div>
      ))}
    </div>
  );
}

function StepFlow({ b }) {
  return (
    <div>
      {b.title && <div className="mb-2.5 text-[15px] font-bold">{b.title}</div>}
      <ol className="relative">
        {b.steps.map((t, i) => (
          <li key={i} className="relative flex gap-3 pb-2.5 last:pb-0">
            {i < b.steps.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-24px)] w-0.5 bg-blue/25" aria-hidden />}
            <span className="relative z-[1] grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue text-[14px] font-bold text-white">{i + 1}</span>
            <span className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 py-2 text-[15px] leading-snug">{t}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DosDonts({ b }) {
  const panel = (items, ok) => items.length > 0 && (
    <div className={cx('min-w-0 rounded-2xl px-4 py-3.5', ok ? 'bg-green-soft' : 'bg-red-soft')}>
      <div className={cx('mb-2 flex items-center gap-1.5 text-[15px] font-bold', ok ? 'text-green' : 'text-red')}>
        {ok ? <Check size={18} strokeWidth={3} /> : <X size={18} strokeWidth={3} />}{ok ? 'Do' : "Don't"}
      </div>
      <ul className="space-y-1.5">
        {items.map((t, i) => (
          <li key={i} className="flex gap-2 text-[15px] leading-snug">
            <span className={cx('mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full', ok ? 'bg-green' : 'bg-red')} />{t}
          </li>
        ))}
      </ul>
    </div>
  );
  return <div className="grid gap-2.5 sm:grid-cols-2">{panel(b.do, true)}{panel(b.dont, false)}</div>;
}

function OptionsCard({ b }) {
  const [picked, setPicked] = useState(null);
  const shown = picked != null;
  return (
    <div className="rounded-2xl border border-line bg-bg/60 p-4">
      <div className="mb-1 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-blue"><Lightbulb size={14} /> What would you do?</div>
      <p className="mb-3 text-[15px] font-semibold leading-snug">{b.situation}</p>
      <div className="space-y-2">
        {b.choices.map((c, i) => {
          const r = RATING[c.rating] || RATING.ok;
          return (
            <button key={i} type="button" disabled={shown} onClick={() => setPicked(i)}
              className={cx('block w-full rounded-xl border bg-surface px-3.5 py-3 text-left transition',
                !shown && 'border-line hover:border-blue', shown && 'border-transparent', shown && picked === i && `ring-2 ${r.ring}`)}>
              <div className="flex items-start gap-2">
                <span className="min-w-0 flex-1 text-[15px] leading-snug">{c.text}</span>
                {shown && <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold', r.cls)}>{r.label}</span>}
              </div>
              {shown && c.why && <p className="mt-1.5 text-[14px] leading-snug text-muted">{c.why}</p>}
            </button>
          );
        })}
      </div>
      {shown && <p className="mt-3 text-[13px] text-muted">{picked != null && b.choices[picked].rating === 'best' ? 'Well done — that is best practice.' : 'Compare your choice with the best practice above.'} <button type="button" className="font-semibold text-blue" onClick={() => setPicked(null)}>Try again</button></p>}
    </div>
  );
}

// ---------- Manager editor ----------
const EMPTY = {
  key_facts: { type: 'key_facts', facts: [{ value: '', label: '' }, { value: '', label: '' }] },
  steps: { type: 'steps', title: '', steps: ['', '', ''] },
  dos_donts: { type: 'dos_donts', do: [''], dont: [''] },
  options: { type: 'options', situation: '', choices: [{ text: '', rating: 'best', why: '' }, { text: '', rating: 'ok', why: '' }, { text: '', rating: 'poor', why: '' }] },
};
const NAMES = { key_facts: 'Key facts', steps: 'Step flow', dos_donts: "Do / Don't", options: 'What would you do?' };
const ORDER = ['image', 'key_facts', 'steps', 'dos_donts', 'options'];
// Lines kept as typed (blank ones too) so the textarea behaves; the server drops blanks
const linesOf = (t) => t.split('\n');

export function BlocksEditor({ blocks = [], onChange, onDraw, onEnrich, drawing, busy, hasBody }) {
  const set = (type, fn) => onChange(ORDER.map((t) => (t === type ? fn(find(blocks, t)) : find(blocks, t))).filter(Boolean));
  const img = find(blocks, 'image');
  const missing = Object.keys(EMPTY).filter((t) => !find(blocks, t));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="soft" icon={Sparkles} disabled={busy || !hasBody} onClick={onEnrich}>{blocks.some((b) => b.type !== 'image') ? 'Redo visuals with AI' : 'Add visuals with AI'}</Button>
        {!hasBody && <span className="text-[13px] text-muted">Write the lesson first.</span>}
      </div>
      <ImageEditor img={img} onChange={(v) => set('image', () => v)} onDraw={onDraw} drawing={drawing} busy={busy} />
      {blocks.filter((b) => b.type !== 'image').map((b) => (
        <div key={b.type} className="rounded-2xl border border-line p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[14px] font-bold">{NAMES[b.type]}</span>
            <IconButton icon={Trash2} label={`Remove ${NAMES[b.type]}`} onClick={() => set(b.type, () => null)} />
          </div>
          {b.type === 'key_facts' && (
            <div className="space-y-2">
              {b.facts.map((f, i) => (
                <div key={i} className="flex items-end gap-2">
                  <Input className="w-28 shrink-0" label={i === 0 ? 'Number / fact' : undefined} value={f.value} maxLength={16} placeholder="999"
                    onChange={(e) => set('key_facts', (x) => ({ ...x, facts: x.facts.map((y, j) => (j === i ? { ...y, value: e.target.value } : y)) }))} />
                  <Input className="min-w-0 flex-1" label={i === 0 ? 'Label' : undefined} value={f.label} maxLength={80} placeholder="Call first in any emergency"
                    onChange={(e) => set('key_facts', (x) => ({ ...x, facts: x.facts.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)) }))} />
                  <IconButton icon={X} label="Remove fact" onClick={() => set('key_facts', (x) => ({ ...x, facts: x.facts.filter((_, j) => j !== i) }))} />
                </div>
              ))}
              {b.facts.length < 4 && <Button size="sm" variant="ghost" icon={Plus} onClick={() => set('key_facts', (x) => ({ ...x, facts: [...x.facts, { value: '', label: '' }] }))}>Add a fact</Button>}
            </div>
          )}
          {b.type === 'steps' && (
            <div className="space-y-2">
              <Input label="Title" value={b.title} placeholder="If someone collapses" onChange={(e) => set('steps', (x) => ({ ...x, title: e.target.value }))} />
              <Textarea label="Steps (one per line, in order)" rows={5} value={b.steps.join('\n')} onChange={(e) => set('steps', (x) => ({ ...x, steps: linesOf(e.target.value) }))} />
            </div>
          )}
          {b.type === 'dos_donts' && (
            <div className="grid gap-2 sm:grid-cols-2">
              <Textarea label="Do (one per line)" rows={4} value={b.do.join('\n')} onChange={(e) => set('dos_donts', (x) => ({ ...x, do: linesOf(e.target.value) }))} />
              <Textarea label="Don't (one per line)" rows={4} value={b.dont.join('\n')} onChange={(e) => set('dos_donts', (x) => ({ ...x, dont: linesOf(e.target.value) }))} />
            </div>
          )}
          {b.type === 'options' && (
            <div className="space-y-2.5">
              <Textarea label="Situation" rows={2} value={b.situation} onChange={(e) => set('options', (x) => ({ ...x, situation: e.target.value }))} />
              {b.choices.map((c, i) => {
                const setC = (k, v) => set('options', (x) => ({ ...x, choices: x.choices.map((y, j) => (j === i ? { ...y, [k]: v } : y)) }));
                return (
                  <div key={i} className="rounded-xl bg-bg p-2.5">
                    <div className="flex items-end gap-2">
                      <Input className="min-w-0 flex-1" label={`Option ${i + 1}`} value={c.text} onChange={(e) => setC('text', e.target.value)} />
                      <Select className="w-40 shrink-0" value={c.rating} options={RATING_OPTIONS} onChange={(e) => setC('rating', e.target.value)} />
                      <IconButton icon={X} label="Remove option" onClick={() => set('options', (x) => ({ ...x, choices: x.choices.filter((_, j) => j !== i) }))} />
                    </div>
                    <Input className="mt-2" placeholder="Why (one sentence)" value={c.why} onChange={(e) => setC('why', e.target.value)} />
                  </div>
                );
              })}
              {b.choices.length < 5 && <Button size="sm" variant="ghost" icon={Plus} onClick={() => set('options', (x) => ({ ...x, choices: [...x.choices, { text: '', rating: 'ok', why: '' }] }))}>Add an option</Button>}
              <p className="text-[13px] text-muted">Officers see the options in a random order. It needs at least one Best practice and one Poor option to show.</p>
            </div>
          )}
        </div>
      ))}
      {missing.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {missing.map((t) => <Button key={t} size="sm" variant="secondary" icon={Plus} onClick={() => set(t, () => structuredClone(EMPTY[t]))}>{NAMES[t]}</Button>)}
        </div>
      )}
    </div>
  );
}

function ImageEditor({ img, onChange, onDraw, drawing, busy }) {
  const file = useRef(null);
  const [up, setUp] = useState(false);
  const [err, setErr] = useState('');
  const v = img || { type: 'image', prompt: '', caption: '', source: 'ai' };
  const pick = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setUp(true); setErr('');
    try {
      const small = await compressImage(f);
      const key = await upload(small, 'learn');
      onChange({ ...v, key, source: 'upload', url: URL.createObjectURL(small) });
    } catch (x) { setErr(x.message || 'Upload failed'); }
    setUp(false);
  };
  return (
    <div className="rounded-2xl border border-line p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[14px] font-bold">Picture</span>
        {img && <IconButton icon={Trash2} label="Remove picture" onClick={() => onChange(null)} />}
      </div>
      <div className="grid gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
        <div className="grid aspect-video place-items-center overflow-hidden rounded-xl bg-[#EEF0F3] text-faint">
          {v.url ? <img src={v.url} alt="" className="h-full w-full object-cover" /> : <ImagePlus size={28} />}
        </div>
        <div className="min-w-0 space-y-2">
          <Textarea label="Picture idea (for AI)" rows={2} value={v.prompt} placeholder="A door supervisor calmly talking to a customer outside a busy bar at night"
            onChange={(e) => onChange({ ...v, prompt: e.target.value })} />
          <Input label="Caption" value={v.caption} maxLength={140} onChange={(e) => onChange({ ...v, caption: e.target.value })} />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="soft" icon={Sparkles} busy={drawing} disabled={busy || up} onClick={() => onDraw(v.prompt)}>{v.key ? 'Redraw with AI' : 'Draw with AI'}</Button>
            <Button size="sm" variant="secondary" icon={Upload} busy={up} disabled={busy} onClick={() => file.current?.click()}>Upload photo</Button>
            <input ref={file} type="file" accept="image/*" className="hidden" onChange={pick} />
          </div>
          {err && <p className="text-[13px] text-red">{err}</p>}
          <p className="text-[12px] text-muted">AI pictures have no words in them, and nobody in them can be identified. Only upload photos you have permission to use.</p>
        </div>
      </div>
    </div>
  );
}
