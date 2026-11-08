// The report as Orb wrote it: plain sections the writer can change word for word, each with its photos, and a ✦ to have
// Orb redo just that part. Orb's questions sit on top; what still blocks signing sits at the bottom.
import { useState } from 'react';
import { AlertTriangle, ArrowLeft, ChevronRight, MessageCircleQuestion, Sparkles } from 'lucide-react';
import { Button, cx, Input, Pressable, Select, Sheet, Textarea } from '../../../ui/index.jsx';
import { Prose } from './Blocks.jsx';

export const SECTIONS = [
  { key: 'what', title: 'What happened', field: 'description', hint: 'Facts in order: what was seen, heard and done.' },
  { key: 'people', title: 'People involved', field: 'people_involved' },
  { key: 'injuries', title: 'Injuries', field: 'injuries', hint: 'Leave empty if nobody was hurt.' },
  { key: 'actions', title: 'What was done', field: 'actions_taken' },
  { key: 'force_justification', title: 'Why force was necessary', field: 'force_justification', force: true },
];
export const PHOTO_SECTIONS = [
  { value: 'what', label: 'What happened' }, { value: 'people', label: 'People involved' }, { value: 'injuries', label: 'Injuries' }, { value: 'actions', label: 'What was done' }, { value: '', label: 'Not in a section' },
];

// A few shimmering lines while Orb writes
export function Writing({ lines = 4, label }) {
  return (
    <div aria-busy="true" aria-live="polite" className="space-y-2 py-1">
      {label && <p className="flex items-center gap-1.5 text-footnote font-semibold text-blue"><Sparkles size={14} aria-hidden />{label}</p>}
      {Array.from({ length: lines }, (_, i) => <div key={i} className="skeleton h-3.5 rounded-full" style={{ width: `${[96, 88, 92, 64, 80, 72][i % 6]}%` }} />)}
    </div>
  );
}

export function OrbWrite({
  sections, setSection, questions, writing, error, onWriteSelf, onRedo, onAnswer, photos, captions, onPhoto, onOpen, force, problems, onBack, readOnly,
}) {
  const [answers, setAnswers] = useState({});
  const [redo, setRedo] = useState(null); // { key, text }
  const shown = SECTIONS.filter((s) => !s.force || force);
  const answered = questions.filter((q) => answers[q]?.trim());
  const placed = (key) => photos.filter((p) => (captions[p.key]?.section ?? '') === key);
  const loose = photos.filter((p) => !PHOTO_SECTIONS.some((s) => s.value && s.value === captions[p.key]?.section));

  if (writing === 'all') {
    return (
      <div className="space-y-6 anim-fade-in">
        {shown.slice(0, 4).map((s, i) => (
          <div key={s.key}><h2 className="text-headline font-bold text-faint">{s.title}</h2><Writing lines={i ? 2 : 4} label={i ? null : 'Orb is writing your report…'} /></div>
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-2xl bg-amber-soft px-4 py-3.5 text-amber anim-fade-in">
        <div className="flex items-center gap-2 text-subhead font-bold"><AlertTriangle size={18} aria-hidden />Orb couldn't write it just now</div>
        <p className="mt-1 text-subhead text-ink/80">{error}. Your notes and photos are kept.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" icon={ArrowLeft} onClick={onBack}>Back to notes</Button>
          <Button size="sm" onClick={onWriteSelf}>Write it yourself</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 anim-fade-in">
      {questions.length > 0 && !readOnly && (
        <section className="rounded-2xl bg-blue-soft px-4 py-3.5" aria-label="Orb's questions">
          <div className="flex items-center gap-2 text-subhead font-bold text-blue"><MessageCircleQuestion size={18} aria-hidden />Orb has a few questions</div>
          <p className="mt-0.5 text-footnote text-muted">Answer any you can and Orb adds them in. Skip the rest.</p>
          <div className="mt-3 space-y-3">
            {questions.map((q) => <Input key={q} label={q} value={answers[q] || ''} onChange={(e) => setAnswers((a) => ({ ...a, [q]: e.target.value }))} />)}
          </div>
          <Button className="mt-3" size="sm" icon={Sparkles} disabled={!answered.length || !!writing}
            onClick={() => onAnswer(answered.map((q) => ({ question: q, answer: answers[q].trim() })))}>Update the report</Button>
        </section>
      )}

      {shown.map((s) => (
        <section key={s.key} aria-label={s.title}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-headline font-bold">{s.title}</h2>
            {!readOnly && (
              <Pressable press disabled={!!writing} onClick={() => setRedo(redo?.key === s.key ? null : { key: s.key, text: '' })}
                className="relative inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-footnote font-semibold text-blue hover:bg-blue-soft before:absolute before:inset-x-0 before:-inset-y-2">
                <Sparkles size={14} aria-hidden />Redo
              </Pressable>
            )}
          </div>
          {redo?.key === s.key && (
            <div className="mt-2 flex gap-2 anim-fade-in">
              <Input className="min-w-0 flex-1" autoFocus value={redo.text} onChange={(e) => setRedo({ ...redo, text: e.target.value })} placeholder="e.g. shorter, add the times, leave out the name"
                onKeyDown={(e) => { if (e.key === 'Enter') { onRedo(s.key, redo.text); setRedo(null); } }} />
              <Button icon={Sparkles} onClick={() => { onRedo(s.key, redo.text); setRedo(null); }}>Redo</Button>
            </div>
          )}
          {writing === s.key ? <Writing lines={3} label="Rewriting…" /> : (
            <Prose value={sections[s.key] || ''} onChange={(e) => setSection(s.key, e.target.value)} readOnly={readOnly}
              placeholder={s.hint || 'Write this part'} aria-label={s.title} className="mt-1.5" />
          )}
          {placed(s.key).length > 0 && <PhotoStrip photos={placed(s.key)} captions={captions} onPhoto={onPhoto} onOpen={onOpen} readOnly={readOnly} />}
        </section>
      ))}

      {loose.length > 0 && (
        <section aria-label="Other photos">
          <h2 className="text-headline font-bold">Other photos and files</h2>
          <PhotoStrip photos={loose} captions={captions} onPhoto={onPhoto} onOpen={onOpen} readOnly={readOnly} />
        </section>
      )}

      {problems.length > 0 && !readOnly && (
        <section className="overflow-hidden rounded-2xl bg-amber-soft text-amber" aria-label="Before you sign">
          <div className="px-4 pb-1 pt-3.5 text-subhead font-bold">Before you sign</div>
          {problems.map((p) => (
            <Pressable key={p.text} onClick={p.fix} className="flex min-h-12 items-center gap-3 px-4 text-subhead font-semibold">
              <AlertTriangle size={16} className="shrink-0" aria-hidden /><span className="flex-1">{p.text}</span><ChevronRight size={18} className="shrink-0" aria-hidden />
            </Pressable>
          ))}
        </section>
      )}
    </div>
  );
}

function PhotoStrip({ photos, captions, onPhoto, onOpen, readOnly }) {
  return (
    <div className="no-scrollbar -mx-1 mt-3 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
      {photos.map((p) => (
        <figure key={p.key} className="w-36 shrink-0 snap-start sm:w-44">
          <Pressable press onClick={() => (readOnly ? onOpen(p) : onPhoto(p))} aria-label={readOnly ? `Open ${p.name}` : `Caption and place ${p.name}`}
            className="block aspect-[4/3] w-full overflow-hidden rounded-2xl bg-bg">
            {p.url ? <img src={p.url} alt={captions[p.key]?.caption || ''} className="h-full w-full object-cover" /> : <span className="grid h-full place-items-center p-2 text-caption font-semibold">{p.name}</span>}
          </Pressable>
          <figcaption className={cx('mt-1 line-clamp-2 px-0.5 text-caption', captions[p.key]?.caption ? 'text-muted' : 'text-faint')}>{captions[p.key]?.caption || (readOnly ? '' : 'Tap to caption')}</figcaption>
        </figure>
      ))}
    </div>
  );
}

/** Caption a photo and choose the section of the report it sits under */
export function PhotoSheet({ photo, captions, setCaptions, onClose, onOpen, sections = true }) {
  const c = (photo && captions[photo.key]) || {};
  const set = (p) => setCaptions((m) => ({ ...m, [photo.key]: { caption: '', section: '', ...m[photo.key], ...p } }));
  return (
    <Sheet open={!!photo} onClose={onClose} title="Photo" size="sm" footer={<Button onClick={onClose}>Done</Button>}>
      {photo && (
        <div className="space-y-3">
          {photo.url && (
            <Pressable press onClick={() => onOpen(photo)} className="block overflow-hidden rounded-2xl bg-bg" aria-label="Open full size">
              <img src={photo.url} alt="" className="max-h-64 w-full object-contain" />
            </Pressable>
          )}
          <Textarea label="Caption" autoGrow minRows={2} maxLength={300} value={c.caption || ''} onChange={(e) => set({ caption: e.target.value })} placeholder="What the photo shows, e.g. Broken glass by the main bar, 23:45" />
          {sections && <Select label="Shown under" value={c.section || ''} onChange={(e) => set({ section: e.target.value })} options={PHOTO_SECTIONS} />}
          <p className="text-footnote text-muted">Never photograph children. Captions go in the report as written, so keep them factual.</p>
        </div>
      )}
    </Sheet>
  );
}
