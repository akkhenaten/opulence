import { useState } from 'react';
import { api } from '../../api.js';
import { Button, Input, Pressable, Select, Sheet, Textarea, useAction, useApi } from '../../ui/index.jsx';
import { Chips, useRoles } from '../people/_parts.jsx';
import { Progress } from '../officer/_parts.jsx';
import { TOPICS } from '../learn/_parts.jsx';

export const TOPIC_OPTIONS = Object.entries(TOPICS).map(([value, label]) => ({ value, label }));

/**
 * AI-draft a whole course: the outline first, then one request per section so each stays short.
 * onStep({ step, of, label }) reports progress. Returns the course id.
 */
export async function draftCourse({ title, topic, notes }, onStep = () => {}) {
  onStep({ step: 0, of: 1, label: 'Planning the sections…' });
  const o = await api('academy.draftOutline', { title, topic, notes });
  const of = o.sections.length + 1;
  for (const [i, s] of o.sections.entries()) {
    onStep({ step: i + 1, of, label: `Writing “${s.title}”…` });
    try {
      await api('academy.draftSection', { section_id: s.id, aims: s.aims });
    } catch (e) {
      if (e.status === 429) throw e; // AI cap reached: stop, the course stays as a draft
      // One retry, then leave the section empty for the manager to redo
      await api('academy.draftSection', { section_id: s.id, aims: s.aims }).catch(() => {});
    }
  }
  onStep({ step: of, of, label: 'Done' });
  return o.course.id;
}

export function DraftProgress({ p }) {
  if (!p) return null;
  return (
    <div className="rounded-2xl bg-blue-soft px-4 py-3">
      <div className="mb-2 flex justify-between gap-2 text-subhead font-semibold text-blue"><span className="min-w-0 truncate">{p.label}</span><span className="num shrink-0">{Math.round((p.step / p.of) * 100)}%</span></div>
      <Progress value={p.step} max={p.of} />
    </div>
  );
}

const TARGETS = [
  { value: 'all', label: 'Everyone' },
  { value: 'role', label: 'By role' },
  { value: 'venue', label: 'By venue team' },
  { value: 'officers', label: 'Pick officers' },
];

/** Assign a published course to officers, with an optional due date. */
export function AssignSheet({ open, onClose, courses, courseId, onDone, preset }) {
  const [v, setV] = useState({ course_id: courseId || '', target: 'all', ids: [], due_date: '', ...preset });
  const { roles } = useRoles();
  const venues = useApi('venues.list', {}, { skip: !open || v.target !== 'venue' });
  const officers = useApi('officers.list', { status: 'active' }, { skip: !open || v.target !== 'officers' });
  const [run, busy] = useAction();
  const set = (k, val) => setV((s) => ({ ...s, [k]: val }));
  const course = v.course_id || courseId;
  const options = v.target === 'role' ? roles.map((r) => ({ value: r.code, label: r.name }))
    : v.target === 'venue' ? (venues.data || []).map((x) => ({ value: x.id, label: x.name }))
      : v.target === 'officers' ? (officers.data || []).map((o) => ({ value: o.id, label: o.name || `${o.first_name} ${o.last_name}` })) : [];
  const save = () => run(async () => {
    const r = await api('academy.assign', { course_id: course, target: v.target, ids: v.ids, due_date: v.due_date || null });
    onDone?.(r); onClose();
    return r;
  }, (r) => `Assigned to ${r.assigned} officer${r.assigned === 1 ? '' : 's'}`).catch(() => {});
  return (
    <Sheet open={open} onClose={onClose} title="Assign training"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!course || (v.target !== 'all' && !v.ids.length)} onClick={save}>Assign</Button></>}>
      <div className="space-y-4">
        {!courseId && <Select label="Course" value={v.course_id} onChange={(e) => set('course_id', e.target.value)} placeholder="Choose a published course" options={(courses || []).map((c) => ({ value: c.id, label: c.title }))} />}
        <div>
          <div className="mb-1.5 text-footnote font-semibold text-muted">Who</div>
          <div className="flex flex-wrap gap-2">
            {TARGETS.map((t) => (
              <Pressable press key={t.value} onClick={() => setV((s) => ({ ...s, target: t.value, ids: [] }))}
                className={`rounded-full border px-3 py-1.5 text-footnote font-semibold ${v.target === t.value ? 'border-blue bg-blue text-white' : 'border-line bg-surface'}`}>{t.label}</Pressable>
            ))}
          </div>
        </div>
        {v.target !== 'all' && <Chips options={options} value={v.ids} onChange={(ids) => set('ids', ids)} />}
        {v.target === 'venue' && <p className="text-caption text-faint">Officers who worked there in the last 90 days or are booked in the next 30.</p>}
        <Input label="Due date (optional)" type="date" value={v.due_date} onChange={(e) => set('due_date', e.target.value)} hint="Officers get a reminder 3 days before. Overdue required courses show on the compliance check." />
      </div>
    </Sheet>
  );
}

/** New course: AI draft or blank. */
export function NewCourseSheet({ open, onClose, onCreated }) {
  const [v, setV] = useState({ title: '', topic: 'law', notes: '' });
  const [p, setP] = useState(null);
  const [run, busy] = useAction();
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const ai = () => run(async () => { const id = await draftCourse(v, setP); setP(null); onCreated(id); }, 'Draft ready — check it before publishing').catch(() => setP(null));
  const blank = () => run(async () => { const c = await api('academy.save', { title: v.title, topic: v.topic, summary: '', sections: [{ title: 'Section 1', body: '' }] }); onCreated(c.id); });
  return (
    <Sheet open={open} onClose={busy ? () => {} : onClose} title="New course"
      footer={<><Button variant="secondary" disabled={busy || !v.title.trim()} onClick={blank}>Start blank</Button><Button busy={busy} disabled={!v.title.trim()} onClick={ai}>Draft with AI</Button></>}>
      <div className="space-y-3">
        <Input label="Title" value={v.title} onChange={set('title')} placeholder="e.g. Dealing with intoxicated customers" />
        <Select label="Area" value={v.topic} onChange={set('topic')} options={TOPIC_OPTIONS} />
        <Textarea label="What it must cover (optional)" rows={3} value={v.notes} onChange={set('notes')} placeholder="Your venue rules, local procedures, things officers get wrong…" />
        <p className="text-footnote text-muted">The AI writes each section with a quick check and quiz questions, naming its sources. Nothing reaches officers until you publish it.</p>
        <DraftProgress p={p} />
      </div>
    </Sheet>
  );
}
