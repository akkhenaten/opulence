import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Archive, ArrowDown, ArrowUp, Eye, Plus, Save, Send, Sparkles, Trash2, Undo2, UserPlus } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Button, cx, date, ErrorBox, IconButton, Input, Page, Pill, Select, Sheet, Spinner, Textarea, Tile, Toggle, useAction, useApi, useConfirm,
} from '../../ui/index.jsx';
import { Lesson, TOPICS } from '../learn/_parts.jsx';
import { AssignSheet, TOPIC_OPTIONS } from './_parts.jsx';

let tmpN = 0;
const tmp = () => `tmp${++tmpN}`;
const blankQ = (section_id) => ({ key: tmp(), section_id, kind: 'mcq', prompt: '', options: ['', '', ''], answer: 0, explain: '', active: true });

// Server rows → editable state. Questions carry `key` for React and keep `id` when saved.
function toState(d) {
  return {
    course: { ...d.course, sources: (d.course.sources || []).join('\n'), renew_months: d.course.renew_months ?? '' },
    sections: d.sections.map((s) => ({ ...s, key: s.id })),
    questions: d.questions.map((x) => ({ ...x, key: x.id })),
  };
}

function toBody(st) {
  const c = st.course;
  return {
    id: c.id, title: c.title, topic: c.topic, summary: c.summary, pass_mark: c.pass_mark, quiz_size: c.quiz_size, cooldown_hours: c.cooldown_hours,
    mandatory: c.mandatory, renew_months: c.renew_months === '' ? null : Number(c.renew_months), sources: c.sources.split('\n').map((s) => s.trim()).filter(Boolean),
    sections: st.sections.map((s) => ({ id: s.id, tmp: s.id ? undefined : s.key, title: s.title, body: s.body, quick_check: s.quick_check?.prompt ? s.quick_check : null })),
    questions: st.questions.filter((x) => x.prompt.trim() || x.id).map((x) => {
      // Blank answers are dropped, so re-point the correct answer at its new position
      const kept = x.options.map((o, i) => [o.trim(), i]).filter(([o]) => o);
      return { id: x.id, section_id: x.section_id, kind: x.kind, prompt: x.prompt, options: kept.map(([o]) => o), answer: kept.findIndex(([, i]) => i === x.answer), explain: x.explain, active: x.active };
    }),
  };
}

export default function CourseEditor() {
  const { id } = useParams();
  const { user } = useAuth();
  const nav = useNavigate();
  const co = user.role === 'company';
  const base = `/${user.role}`;
  const q = useApi('academy.edit', { id });
  const [st, setSt] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [run, busy] = useAction();
  const [drafting, setDrafting] = useState(null);
  const [assign, setAssign] = useState(false);
  const [editQ, setEditQ] = useState(null);
  const confirm = useConfirm();

  useEffect(() => { if (q.data) { setSt(toState(q.data)); setDirty(false); } }, [q.data]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  if (q.error) return <Page title="Course" back={{ to: `${base}/team/academy`, label: 'Academy' }}><ErrorBox error={q.error} retry={q.reload} /></Page>;
  if (!st) return <Page title="Course" back={{ to: `${base}/team/academy`, label: 'Academy' }}><Spinner /></Page>;

  const c = st.course;
  const edit = (fn) => { setSt((s) => fn(structuredClone(s))); setDirty(true); };
  const setC = (k, v) => edit((s) => { s.course[k] = v; return s; });
  const setS = (i, k, v) => edit((s) => { s.sections[i][k] = v; return s; });
  const move = (i, d) => edit((s) => { const [x] = s.sections.splice(i, 1); s.sections.splice(i + d, 0, x); return s; });
  const addSection = () => edit((s) => { s.sections.push({ key: tmp(), title: `Section ${s.sections.length + 1}`, body: '', quick_check: null }); return s; });
  const removeSection = async (i) => {
    const sec = st.sections[i];
    const n = st.questions.filter((x) => x.section_id === (sec.id || sec.key)).length;
    if (!(await confirm({ title: `Remove “${sec.title}”?`, body: n ? `Its ${n} quiz question${n === 1 ? '' : 's'} will be removed too.` : undefined, confirm: 'Remove', danger: true }))) return;
    edit((s) => { s.sections.splice(i, 1); s.questions = s.questions.filter((x) => x.section_id !== (sec.id || sec.key)); return s; });
  };

  const save = (msg = 'Saved') => run(async () => {
    const r = await api('academy.save', toBody(st));
    setDirty(false);
    await q.reload();
    return r;
  }, msg);
  const setStatus = (status, msg) => run(async () => {
    if (dirty) await api('academy.save', toBody(st));
    await api('academy.setStatus', { id: c.id, status });
    setDirty(false);
    await q.reload();
  }, msg).catch(() => {});
  const publish = async () => {
    if (!(await confirm({ title: c.status === 'published' ? 'Publish these changes?' : `Publish ${c.title}?`, body: 'Officers will see it straight away. Make sure you have read every section and checked the answers.', confirm: 'Publish' }))) return;
    setStatus('published', 'Published — officers can now take it');
  };
  const draftSection = async (i) => {
    const sec = st.sections[i];
    if (sec.body.trim() && !(await confirm({ title: `Rewrite “${sec.title}” with AI?`, body: 'This replaces the lesson text, quick check and quiz questions for this section.', confirm: 'Rewrite' }))) return;
    setDrafting(sec.key);
    try {
      await run(async () => {
        let sid = sec.id;
        if (!sid || dirty) {
          await api('academy.save', toBody(st));
          const fresh = await api('academy.edit', { id: c.id });
          sid = fresh.sections[i]?.id;
        }
        await api('academy.draftSection', { section_id: sid, aims: sec.aims || '' });
        setDirty(false);
        await q.reload();
      }, 'Section drafted — read it through');
    } catch { /* toast shown */ }
    setDrafting(null);
  };

  const qFor = (sec) => st.questions.filter((x) => x.section_id === (sec.id || sec.key));
  const unlinked = st.questions.filter((x) => !st.sections.some((s) => x.section_id === (s.id || s.key)));
  const activeQs = st.questions.filter((x) => x.active && x.prompt.trim()).length;
  const ready = st.sections.length && st.sections.every((s) => s.body.trim()) && activeQs >= 5;
  const saveQ = (x) => edit((s) => {
    const i = s.questions.findIndex((y) => y.key === x.key);
    if (i >= 0) s.questions[i] = x; else s.questions.push(x);
    return s;
  });
  const removeQ = (key) => edit((s) => { s.questions = s.questions.filter((y) => y.key !== key); return s; });

  const status = c.status === 'published' ? <Pill tone="green">Published · v{c.version}</Pill> : c.status === 'archived' ? <Pill tone="grey">Archived</Pill> : <Pill tone="blue">Draft</Pill>;
  return (
    <Page title={c.title || 'Untitled course'} back={{ to: `${base}/team/academy`, label: 'Academy' }} wide
      subtitle={<span className="flex flex-wrap items-center gap-2">{status}{c.review_by && <span className="text-[13px]">Review by {date(c.review_by)}</span>}{dirty && <Pill tone="amber">Unsaved changes</Pill>}</span>}
      actions={(
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={Eye} to={`${base}/team/academy/${c.id}/preview`}>Preview</Button>
          {c.status === 'published' && <Button variant="secondary" icon={UserPlus} onClick={() => setAssign(true)}>Assign</Button>}
          {co && <Button variant="secondary" icon={Save} busy={busy && !drafting} disabled={!dirty} onClick={() => save().catch(() => {})}>Save</Button>}
          {co && c.status !== 'archived' && (c.status !== 'published' || dirty) && <Button icon={Send} disabled={busy || !ready} onClick={publish}>Publish</Button>}
        </div>
      )}>
      {co && !ready && c.status !== 'archived' && (
        <div className="mb-4 rounded-2xl bg-amber-soft px-4 py-3 text-[14px] text-amber">
          To publish, every section needs its lesson text and the course needs at least 5 quiz questions ({activeQs} so far).
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          {st.sections.map((s, i) => (
            <Tile key={s.key} title={`Section ${i + 1}`}
              action={co && (
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="soft" icon={Sparkles} busy={drafting === s.key} disabled={busy} onClick={() => draftSection(i)}>{s.body.trim() ? 'Rewrite with AI' : 'Write with AI'}</Button>
                  <IconButton icon={ArrowUp} label="Move up" disabled={i === 0} onClick={() => move(i, -1)} />
                  <IconButton icon={ArrowDown} label="Move down" disabled={i === st.sections.length - 1} onClick={() => move(i, 1)} />
                  <IconButton icon={Trash2} label="Remove section" onClick={() => removeSection(i)} />
                </div>
              )}>
              {co ? (
                <div className="space-y-3">
                  <Input label="Title" value={s.title} onChange={(e) => setS(i, 'title', e.target.value)} />
                  <Textarea label="Lesson" rows={12} value={s.body} onChange={(e) => setS(i, 'body', e.target.value)}
                    hint="### for a heading, - for a bullet, **bold**. Keep it short — officers read this on a phone." />
                  <QuickCheckEditor value={s.quick_check} onChange={(v) => setS(i, 'quick_check', v)} />
                </div>
              ) : (
                <div><div className="mb-2 text-[17px] font-bold">{s.title}</div>{s.body ? <Lesson text={s.body} /> : <p className="text-muted">No lesson text yet.</p>}</div>
              )}
              <QuestionList qs={qFor(s)} co={co} onEdit={setEditQ} onAdd={() => setEditQ(blankQ(s.id || s.key))} />
            </Tile>
          ))}
          {unlinked.length > 0 && <Tile title="Other questions"><QuestionList qs={unlinked} co={co} onEdit={setEditQ} /></Tile>}
          {co && <Button variant="secondary" icon={Plus} onClick={addSection}>Add a section</Button>}
        </div>

        <div className="space-y-4">
          <Tile title="Course details">
            <fieldset disabled={!co} className="space-y-3">
              <Input label="Title" value={c.title} onChange={(e) => setC('title', e.target.value)} />
              <Select label="Area" value={c.topic} onChange={(e) => setC('topic', e.target.value)} options={TOPIC_OPTIONS} />
              <Textarea label="Summary" rows={3} value={c.summary || ''} onChange={(e) => setC('summary', e.target.value)} />
              <div className="grid grid-cols-2 gap-3">
                <Input label="Pass mark %" type="number" min={50} max={100} value={c.pass_mark} onChange={(e) => setC('pass_mark', e.target.value)} />
                <Input label="Quiz questions" type="number" min={3} max={40} value={c.quiz_size} onChange={(e) => setC('quiz_size', e.target.value)} />
                <Input label="Retake after (hours)" type="number" min={0} max={720} value={c.cooldown_hours} onChange={(e) => setC('cooldown_hours', e.target.value)} />
                <Input label="Renew every (months)" type="number" min={1} max={60} value={c.renew_months} placeholder="Never" onChange={(e) => setC('renew_months', e.target.value)} />
              </div>
              {co ? <Toggle checked={c.mandatory} onChange={(v) => setC('mandatory', v)} label="Required training" hint="Overdue required courses show on the compliance check." />
                : <p className="text-[14px]">{c.mandatory ? 'Required training' : 'Optional training'} · {TOPICS[c.topic]}</p>}
              <Textarea label="Sources (one per line)" rows={4} value={c.sources} onChange={(e) => setC('sources', e.target.value)} />
            </fieldset>
          </Tile>
          <Tile title="Quiz">
            <p className="text-[14px] text-muted">{activeQs} active questions. Each attempt picks {Math.min(Number(c.quiz_size) || 0, activeQs)} at random; officers need {c.pass_mark}% to pass.</p>
          </Tile>
          {co && c.status !== 'draft' && (
            <div className="flex flex-wrap gap-2">
              {c.status === 'published' && <Button variant="secondary" icon={Undo2} disabled={busy} onClick={() => setStatus('draft', 'Moved back to draft — officers no longer see it')}>Unpublish</Button>}
              {c.status === 'archived' && <Button variant="secondary" icon={Undo2} disabled={busy} onClick={() => setStatus('draft', 'Restored as a draft')}>Restore</Button>}
            </div>
          )}
          {co && c.status !== 'archived' && (
            <Button variant="danger" icon={Archive} disabled={busy} onClick={async () => {
              if (await confirm({ title: 'Archive this course?', body: 'Officers no longer see it. Certificates already issued stay valid.', confirm: 'Archive', danger: true })) {
                await setStatus('archived', 'Archived'); nav(`${base}/team/academy`);
              }
            }}>Archive</Button>
          )}
        </div>
      </div>

      <QuestionSheet q={editQ} sections={st.sections} onClose={() => setEditQ(null)} onSave={(x) => { saveQ(x); setEditQ(null); }}
        onRemove={(key) => { removeQ(key); setEditQ(null); }} />
      {assign && <AssignSheet open courseId={c.id} onClose={() => setAssign(false)} />}
    </Page>
  );
}

function QuickCheckEditor({ value, onChange }) {
  const v = value || { prompt: '', options: ['', ''], answer: 0, explain: '' };
  const set = (k, x) => onChange({ ...v, [k]: x });
  return (
    <details className="rounded-2xl bg-bg px-4 py-3" open={!!value?.prompt}>
      <summary className="cursor-pointer text-[14px] font-semibold">Quick check {value?.prompt ? '' : '(none)'}</summary>
      <div className="mt-3 space-y-3">
        <Input label="Question" value={v.prompt} onChange={(e) => set('prompt', e.target.value)} />
        <OptionsEditor options={v.options} answer={v.answer} onChange={(options, answer) => onChange({ ...v, options, answer })} />
        <Input label="Why (shown after answering)" value={v.explain} onChange={(e) => set('explain', e.target.value)} />
        {value && <Button size="sm" variant="ghost" onClick={() => onChange(null)}>Remove quick check</Button>}
      </div>
    </details>
  );
}

function OptionsEditor({ options, answer, onChange }) {
  return (
    <div>
      <div className="mb-1.5 text-[13px] font-semibold text-muted">Answers — tick the right one</div>
      <div className="space-y-2">
        {options.map((o, i) => (
          <div key={i} className="flex items-center gap-2">
            <input type="radio" className="h-4 w-4" checked={answer === i} onChange={() => onChange(options, i)} aria-label={`Answer ${i + 1} is correct`} />
            <input className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-[15px] outline-none focus:border-blue" value={o}
              onChange={(e) => onChange(options.map((x, j) => (j === i ? e.target.value : x)), answer)} placeholder={`Answer ${i + 1}`} />
            {options.length > 2 && <IconButton icon={Trash2} label="Remove answer" onClick={() => onChange(options.filter((_, j) => j !== i), answer === i ? 0 : answer > i ? answer - 1 : answer)} />}
          </div>
        ))}
      </div>
      {options.length < 6 && <Button className="mt-2" size="sm" variant="ghost" icon={Plus} onClick={() => onChange([...options, ''], answer)}>Add an answer</Button>}
    </div>
  );
}

function QuestionList({ qs, co, onEdit, onAdd }) {
  return (
    <div className="mt-4 border-t border-line pt-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[13px] font-semibold uppercase tracking-wide text-muted">Quiz questions ({qs.length})</div>
        {co && onAdd && <Button size="sm" variant="ghost" icon={Plus} onClick={onAdd}>Add</Button>}
      </div>
      {qs.length ? (
        <ul className="space-y-1.5">
          {qs.map((x) => (
            <li key={x.key}>
              <button type="button" onClick={() => onEdit(x)} className={cx('w-full rounded-xl bg-bg px-3 py-2 text-left text-[14px] hover:bg-blue-soft', !x.active && 'opacity-50')}>
                <span className="font-medium">{x.prompt || 'Untitled question'}</span>
                <span className="block text-[12px] text-muted">✓ {x.options[x.answer]}{x.kind === 'scenario' ? ' · Scenario' : ''}{!x.active ? ' · Turned off' : ''}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="text-[13px] text-faint">None yet.</p>}
    </div>
  );
}

function QuestionSheet({ q: initial, sections, onClose, onSave, onRemove }) {
  const { user } = useAuth();
  const co = user.role === 'company';
  const [x, setX] = useState(initial);
  useEffect(() => setX(initial), [initial]);
  if (!x) return null;
  const set = (k, v) => setX((s) => ({ ...s, [k]: v }));
  const ok = x.prompt.trim() && x.options.filter((o) => o.trim()).length >= 2 && x.options[x.answer]?.trim();
  return (
    <Sheet open onClose={onClose} title={x.id || initial.prompt ? 'Quiz question' : 'New quiz question'}
      footer={co && (
        <>
          {(x.id || initial.prompt) && <Button variant="danger" icon={Trash2} onClick={() => onRemove(x.key)}>Remove</Button>}
          <Button disabled={!ok} onClick={() => onSave(x)}>Done</Button>
        </>
      )}>
      <fieldset disabled={!co} className="space-y-3">
        <Select label="Kind" value={x.kind} onChange={(e) => set('kind', e.target.value)} options={[{ value: 'mcq', label: 'Question' }, { value: 'scenario', label: 'Scenario — what would you do?' }]} />
        <Textarea label="Question" rows={3} value={x.prompt} onChange={(e) => set('prompt', e.target.value)} />
        <OptionsEditor options={x.options} answer={x.answer} onChange={(options, answer) => setX((s) => ({ ...s, options, answer }))} />
        <Textarea label="Explanation (shown after answering)" rows={2} value={x.explain} onChange={(e) => set('explain', e.target.value)} />
        <Select label="Section" value={x.section_id || ''} onChange={(e) => set('section_id', e.target.value || null)} placeholder="None"
          options={sections.map((s, i) => ({ value: s.id || s.key, label: `${i + 1}. ${s.title}` }))} />
        <Toggle checked={x.active} onChange={(v) => set('active', v)} label="Use in the quiz" />
      </fieldset>
      {!co && <p className="mt-3 text-[13px] text-muted">Only company managers can edit courses.</p>}
    </Sheet>
  );
}
