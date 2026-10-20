import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Archive, Save, Send, Undo2 } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Button, date, ErrorBox, Input, Page, Pill, Select, Spinner, Textarea, Tile, useAction, useApi, useConfirm } from '../../ui/index.jsx';
import { CATEGORIES } from '../learn/_parts.jsx';
import { CardView } from '../learn/Card.jsx';

const lines = (s) => s.split('\n').map((x) => x.replace(/^\s*(\d+[.)]|[-•])\s*/, '').trim()).filter(Boolean);
const BLANK = { category: 'situations', title: '', summary: '', steps: [], dont: [], law: '', report_tips: '', escalate: '', tags: [], sources: [], venue_id: null, course_id: null, status: 'draft' };

function toForm(c) {
  return { ...c, steps: (c.steps || []).join('\n'), dont: (c.dont || []).join('\n'), tags: (c.tags || []).join(', '), sources: (c.sources || []).join('\n'), venue_id: c.venue_id || '', course_id: c.course_id || '' };
}
function toCard(f) {
  return { ...f, steps: lines(f.steps), dont: lines(f.dont), sources: lines(f.sources), tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean), venue_id: f.venue_id || null, course_id: f.course_id || null };
}

export default function CardEditor() {
  const { id } = useParams();
  const isNew = id === 'new';
  const { user } = useAuth();
  const co = user.role === 'company';
  const nav = useNavigate();
  const base = `/${user.role}/team/toolbox`;
  const q = useApi('toolbox.get', { id }, { skip: isNew });
  const venues = useApi('venues.list');
  const courses = useApi('academy.courses', {});
  const [f, setF] = useState(isNew ? toForm(BLANK) : null);
  const [dirty, setDirty] = useState(false);
  const [run, busy] = useAction();
  const confirm = useConfirm();
  useEffect(() => { if (q.data) { setF(toForm(q.data)); setDirty(false); } }, [q.data]);

  const back = { to: base, label: 'Toolbox' };
  if (q.error) return <Page title="Card" back={back}><ErrorBox error={q.error} retry={q.reload} /></Page>;
  if (!f) return <Page title="Card" back={back}><Spinner /></Page>;

  const set = (k) => (e) => { setF((s) => ({ ...s, [k]: e.target.value })); setDirty(true); };
  const card = toCard(f);
  const venueName = (venues.data || []).find((v) => v.id === f.venue_id)?.name;
  const courseTitle = (courses.data || []).find((c) => c.id === f.course_id)?.title;
  const fields = () => {
    const c = toCard(f);
    return { id: isNew ? undefined : id, category: c.category, title: c.title, summary: c.summary, steps: c.steps, dont: c.dont, law: c.law, report_tips: c.report_tips, escalate: c.escalate, tags: c.tags, sources: c.sources, venue_id: c.category === 'venue' ? c.venue_id : null, course_id: c.course_id };
  };
  const save = () => run(async () => {
    const r = await api('toolbox.save', fields());
    setDirty(false);
    if (isNew) nav(`${base}/${r.id}`, { replace: true }); else q.reload();
    return r;
  }, f.status === 'published' ? 'Saved — officers see the change now' : 'Saved').catch(() => {});
  const setStatus = (status, msg) => run(async () => {
    let cid = id;
    if (dirty || isNew) cid = (await api('toolbox.save', fields())).id;
    await api('toolbox.setStatus', { id: cid, status });
    setDirty(false);
    if (status === 'archived') nav(base);
    else if (isNew) nav(`${base}/${cid}`, { replace: true }); else q.reload();
  }, msg).catch(() => {});
  const publish = async () => {
    if (!(await confirm({ title: `Publish “${f.title}”?`, body: 'Officers will see it straight away. Make sure the steps are right for your company.', confirm: 'Publish' }))) return;
    setStatus('published', 'Published');
  };
  const ok = f.title.trim() && card.steps.length && (f.category !== 'venue' || f.venue_id);

  return (
    <Page title={f.title || 'New card'} back={back} wide
      subtitle={<span className="flex flex-wrap items-center gap-2">{f.status === 'published' ? <Pill tone="green">Published</Pill> : <Pill tone="blue">Draft</Pill>}{f.review_by && <span className="text-[13px]">Review by {date(f.review_by)}</span>}{dirty && <Pill tone="amber">Unsaved changes</Pill>}</span>}
      actions={co && (
        <>
          <Button variant="secondary" icon={Save} busy={busy} disabled={!dirty || !f.title.trim()} onClick={save}>Save</Button>
          {f.status !== 'published' && <Button icon={Send} disabled={busy || !ok} onClick={publish}>Publish</Button>}
        </>
      )}>
      <div className="grid gap-4 lg:grid-cols-2">
        <Tile title="Edit">
          <fieldset disabled={!co} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Category" value={f.category} onChange={set('category')} options={CATEGORIES.map(({ value, label }) => ({ value, label }))} />
              {f.category === 'venue' && <Select label="Venue" value={f.venue_id} onChange={set('venue_id')} placeholder="Choose a venue" options={(venues.data || []).map((v) => ({ value: v.id, label: v.name }))} />}
            </div>
            <Input label="Title" value={f.title} onChange={set('title')} placeholder="e.g. Choking adult" />
            <Input label="Summary — the one thing to do" value={f.summary} onChange={set('summary')} />
            <Textarea label="Steps (one per line, in order)" rows={8} value={f.steps} onChange={set('steps')} />
            <Textarea label="Don't (one per line)" rows={4} value={f.dont} onChange={set('dont')} />
            <Textarea label="When to call for help" rows={2} value={f.escalate} onChange={set('escalate')} />
            <Textarea label="The law" rows={3} value={f.law} onChange={set('law')} />
            <Textarea label="For the incident report" rows={2} value={f.report_tips} onChange={set('report_tips')} />
            <Input label="Search words (comma separated)" value={f.tags} onChange={set('tags')} />
            <Textarea label="Sources (one per line)" rows={3} value={f.sources} onChange={set('sources')} />
            <Select label="Linked course (optional)" value={f.course_id} onChange={set('course_id')} placeholder="None"
              options={(courses.data || []).filter((c) => c.status === 'published').map((c) => ({ value: c.id, label: c.title }))} />
          </fieldset>
          {co && !isNew && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
              {f.status === 'published' && <Button variant="secondary" icon={Undo2} disabled={busy} onClick={() => setStatus('draft', 'Moved back to draft — officers no longer see it')}>Unpublish</Button>}
              <Button variant="danger" icon={Archive} disabled={busy} onClick={async () => {
                if (await confirm({ title: 'Archive this card?', body: 'Officers will no longer see it.', confirm: 'Archive', danger: true })) setStatus('archived', 'Archived');
              }}>Archive</Button>
            </div>
          )}
        </Tile>
        <div className="min-w-0">
          <div className="mb-2 px-1 text-[13px] font-semibold uppercase tracking-wide text-muted">What officers see</div>
          <div className="lg:sticky lg:top-4">
            <CardView c={{ ...card, venue_name: f.category === 'venue' ? venueName : null, course_title: courseTitle, updated_at: f.updated_at }} />
          </div>
        </div>
      </div>
    </Page>
  );
}
