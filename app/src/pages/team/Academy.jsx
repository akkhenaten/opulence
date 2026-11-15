import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Award, BarChart3, Download, GraduationCap, Library, Plus, RotateCcw, Sparkles, UserPlus } from 'lucide-react';
import { api, downloadText } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Avatar, Button, cx, date, Empty, ErrorBox, List, Load, Page, Pill, Pressable, Row, Segmented, Sheet, Spinner, Table, Tile, useAction, useApi } from '../../ui/index.jsx';
import { STATE, StatePill, TOPICS, useModules } from '../learn/_parts.jsx';
import { Refreshers, StaffRecords } from './_training.jsx';
import { AssignSheet, DraftProgress, draftCourse, NewCourseSheet } from './_parts.jsx';

// Training hub: staff records, refreshers due, and the Academy (courses, results, starter library)
export default function Academy() {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const modules = useModules();
  const co = user.role === 'company';
  const academy = modules?.academy !== false;
  const tab = sp.get('tab') || 'records';
  const tabs = [
    { value: 'records', label: 'Staff records', icon: Award }, { value: 'refreshers', label: 'Refreshers due', icon: RotateCcw },
    ...(academy ? [{ value: 'courses', label: 'Courses', icon: GraduationCap }, { value: 'results', label: 'Academy results', icon: BarChart3 }] : []),
    ...(academy && co ? [{ value: 'starter', label: 'Starter library', icon: Library }] : []),
  ];
  return (
    // The training views switch on the tab line, so each list starts high
    <Page title="Training" subtitle="Certificates, refreshers and Academy courses for your staff" wide
      tools={<Segmented value={tab} onChange={(v) => setSp(v === 'records' ? {} : { tab: v }, { replace: true })} options={tabs} />}>
      {tab === 'records' && <StaffRecords />}
      {tab === 'refreshers' && <Refreshers />}
      {tab === 'courses' && academy && <Courses co={co} />}
      {tab === 'results' && academy && <Results />}
      {tab === 'starter' && academy && co && <Starter onDone={() => setSp({ tab: 'courses' }, { replace: true })} />}
    </Page>
  );
}

function courseStatus(c) {
  if (c.status === 'published') return c.review_by && c.review_by < new Date().toISOString().slice(0, 10) ? <Pill tone="amber">Review due</Pill> : <Pill tone="green">Published</Pill>;
  if (c.status === 'archived') return <Pill tone="grey">Archived</Pill>;
  return <Pill tone="blue">Draft</Pill>;
}

function Courses({ co }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const [showArchived, setShowArchived] = useState(false);
  // Archived courses come with the list and fold into one row under it
  const q = useApi('academy.courses', { archived: true });
  const similar = useApi('academy.similar');
  const [add, setAdd] = useState(false);
  const [assign, setAssign] = useState(null);
  const [compare, setCompare] = useState(null);
  const open = (c) => nav(`/${user.role}/team/academy/${c.id}`);
  const twin = new Map();
  for (const [a, b] of similar.data || []) { if (!twin.has(a.id)) twin.set(a.id, [a, b]); if (!twin.has(b.id)) twin.set(b.id, [b, a]); }
  const required = (c) => {
    if (!c.mandatory) return null;
    if (c.assigned) return ` · Required · ${c.assigned} assigned`;
    return <> · Required · nobody assigned yet{c.status === 'published' && <> · <Pressable press className="inline font-semibold text-blue" onClick={(e) => { e.stopPropagation(); setAssign(c.id); }}>Assign</Pressable></>}</>;
  };
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
        {co && <Button icon={Plus} onClick={() => setAdd(true)}>New course</Button>}
      </div>
      <Load q={q}>
        {(all) => {
          const live = all.filter((c) => c.status !== 'archived');
          const archived = all.filter((c) => c.status === 'archived');
          const rows = showArchived ? [...live, ...archived] : live;
          return all.length ? (
            <>
              {rows.length > 0 && <Table rows={rows} onRow={open} columns={[
                { key: 'title', mobile: 'title', label: 'Course', render: (c) => (
                  <div className="min-w-0">
                    <div className="font-semibold">{c.title}</div>
                    <div className="text-caption text-muted">{TOPICS[c.topic]}{required(c)}{c.renew_months ? ` · Renew every ${c.renew_months} months` : ''}</div>
                    {twin.has(c.id) && <Pressable press className="inline text-caption font-semibold text-amber" onClick={(e) => { e.stopPropagation(); setCompare(twin.get(c.id)); }}>Looks similar to {twin.get(c.id)[1].title}</Pressable>}
                  </div>
                ) },
                { key: 'status', mobile: 'value', label: 'Status', render: courseStatus },
                { key: 'content', mobile: 'sub', label: 'Content', render: (c) => <span className={cx('text-footnote', (c.empty_sections || c.questions < 5) && 'text-amber')}>{c.sections} sections · {c.questions} questions{c.empty_sections ? ` · ${c.empty_sections} empty` : ''}</span> },
                { key: 'people', mobile: 'sub', label: 'Officers', render: (c) => <span className="num text-footnote">{c.passed} passed / {c.assigned} assigned</span> },
                { key: 'go', mobile: false, label: '', align: 'right', render: (c) => c.status === 'published' ? <Button size="sm" variant="soft" icon={UserPlus} onClick={(e) => { e.stopPropagation(); setAssign(c.id); }}>Assign</Button> : null },
              ]} />}
              {archived.length > 0 && (
                <Pressable press onClick={() => setShowArchived((x) => !x)} className="mt-3 flex w-full items-center justify-between rounded-tile bg-surface px-4 py-3 text-subhead shadow-tile">
                  <span className="text-muted">{archived.length} archived</span>
                  <span className="font-semibold text-blue">{showArchived ? 'Hide' : 'Show'}</span>
                </Pressable>
              )}
            </>
          ) : (
            <Empty icon={GraduationCap} title="No courses yet" body={co ? 'Create one, or draft the whole starter library with AI.' : 'Your company has not added any courses yet.'}
              action={co && <Button icon={Sparkles} to={`/${user.role}/team/training?tab=starter`}>Open the starter library</Button>} />
          );
        }}
      </Load>
      <NewCourseSheet open={add} onClose={() => setAdd(false)} onCreated={(id) => nav(`/${user.role}/team/academy/${id}`)} />
      {assign && <AssignSheet open courseId={assign} onClose={() => setAssign(null)} onDone={q.reload} />}
      {compare && <CompareSheet pair={compare} onOpen={(c) => { setCompare(null); open(c); }} onClose={() => setCompare(null)} />}
    </>
  );
}

// Two courses that look like the same course, side by side, to keep one and archive the other
function CompareSheet({ pair, onOpen, onClose }) {
  return (
    <Sheet open onClose={onClose} title="Courses that look the same" size="lg">
      <p className="mb-3 text-subhead text-muted">Officers may be assigned either. Open one to compare the lessons, then archive the one you don&apos;t need: certificates already earned stay valid.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {pair.map((c) => (
          <Tile key={c.id} title={c.title}>
            <div className="text-footnote text-muted">{TOPICS[c.topic]} · {c.status === 'published' ? 'Published' : 'Draft'}</div>
            <div className="num mt-1 text-footnote">{c.sections} lessons · {c.assigned} assigned · {c.passed} passed</div>
            <Button size="sm" variant="secondary" className="mt-3" onClick={() => onOpen(c)}>Open</Button>
          </Tile>
        ))}
      </div>
    </Sheet>
  );
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function Results() {
  const { user } = useAuth();
  const nav = useNavigate();
  const q = useApi('academy.results');
  const [assign, setAssign] = useState(false);
  if (q.loading && !q.data) return <Spinner />;
  if (q.error) return <ErrorBox error={q.error} retry={q.reload} />;
  const { courses, rows, missed } = q.data;
  if (!courses.length) return <Empty icon={GraduationCap} title="No published courses yet" body="Results appear here once a course is published." />;

  const csv = () => {
    const head = ['Officer', ...courses.flatMap((c) => [`${c.title} — status`, `${c.title} — score`, `${c.title} — due`])];
    const lines = rows.map((r) => [`${r.officer.first_name} ${r.officer.last_name}`, ...courses.flatMap((c) => {
      const x = r.cells[c.id];
      return [STATE[x.state]?.label || '', x.score ?? '', x.due_date || ''];
    })]);
    downloadText(`training-results-${new Date().toISOString().slice(0, 10)}.csv`, [head, ...lines].map((l) => l.map(csvCell).join(',')).join('\n'));
  };
  const totals = courses.map((c) => ({ c, passed: rows.filter((r) => r.cells[c.id].state === 'passed').length, overdue: rows.filter((r) => r.cells[c.id].state === 'overdue').length }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" icon={Download} iconOnly="phone" onClick={csv}>Download CSV</Button>
        <Button icon={UserPlus} onClick={() => setAssign(true)}>Assign training</Button>
      </div>
      <div className="overflow-x-auto rounded-tile border border-hairline bg-surface shadow-tile">
        <table className="w-full min-w-[640px] text-footnote">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="sticky left-0 z-10 bg-surface px-4 py-3 text-caption font-semibold uppercase tracking-wide text-faint">Officer</th>
              {totals.map(({ c, passed, overdue }) => (
                <th key={c.id} className="min-w-[130px] px-3 py-3 align-bottom font-semibold">
                  <Pressable press className="text-left hover:text-blue" onClick={() => nav(`/${user.role}/team/academy/${c.id}`)}>{c.title}</Pressable>
                  <div className="text-caption2 font-normal text-muted">{passed} passed{overdue ? ` · ${overdue} overdue` : ''}{c.mandatory ? ' · Required' : ''}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.officer.id} className="border-b border-line last:border-0">
                <td className="sticky left-0 z-10 bg-surface px-4 py-2.5">
                  <Pressable press className="flex items-center gap-2 text-left font-semibold hover:text-blue" onClick={() => nav(`/${user.role}/staff/${r.officer.id}?tab=training`)}>
                    <Avatar name={`${r.officer.first_name} ${r.officer.last_name}`} src={[r.officer.photo_thumb_url, r.officer.photo_url]} size={28} />
                    <span className="whitespace-nowrap">{r.officer.first_name} {r.officer.last_name}</span>
                  </Pressable>
                </td>
                {courses.map((c) => {
                  const x = r.cells[c.id];
                  const body = (
                    <>
                      <StatePill state={x.state} />
                      <div className="mt-0.5 text-caption2 text-muted">
                        {x.score != null ? `${x.score}%` : ''}{x.tries > 1 ? ` · ${x.tries} tries` : ''}
                        {x.due_date && x.state !== 'passed' ? ` · due ${date(x.due_date)}` : ''}
                        {x.expires_at && x.state === 'passed' ? ` · to ${date(x.expires_at)}` : ''}
                      </div>
                    </>
                  );
                  return (
                    <td key={c.id} className="px-3 py-2.5 align-top">
                      {x.certificate_id ? <Pressable press className="text-left" onClick={() => nav(`/${user.role}/team/certificates/${x.certificate_id}`)}>{body}</Pressable> : body}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Tile title="Questions most often answered wrong">
        {missed.length ? (
          <List>
            {missed.map((m) => <Row key={m.id} title={m.prompt} subtitle={m.course_title} right={<span className="num text-footnote font-semibold text-red">{Math.round((m.wrong / m.answered) * 100)}% wrong</span>} />)}
          </List>
        ) : <p className="text-subhead text-muted">Nothing yet — this fills in as officers take quizzes. It shows where a lesson may need to be clearer.</p>}
      </Tile>
      <AssignSheet open={assign} courses={courses} onClose={() => setAssign(false)} onDone={q.reload} />
    </div>
  );
}

function Starter({ onDone }) {
  const q = useApi('academy.starterTopics');
  const [picked, setPicked] = useState(null);
  const [p, setP] = useState(null);
  const [log, setLog] = useState([]);
  const [run, busy] = useAction();
  const topics = q.data || [];
  const sel = picked ?? topics.filter((t) => !t.exists).map((t) => t.title);
  const toggle = (title) => setPicked(sel.includes(title) ? sel.filter((x) => x !== title) : [...sel, title]);
  const go = () => run(async () => {
    const list = topics.filter((t) => sel.includes(t.title));
    for (const [i, t] of list.entries()) {
      try {
        await draftCourse(t, (s) => setP({ step: i * 10 + Math.round((s.step / s.of) * 10), of: list.length * 10, label: `${i + 1} of ${list.length}: ${s.label === 'Done' ? t.title : s.label}` }));
        setLog((l) => [...l, { title: t.title, ok: true }]);
      } catch (e) {
        setLog((l) => [...l, { title: t.title, ok: false, error: e.message }]);
        if (e.status === 429) break;
      }
    }
    setP(null); setPicked(null); q.reload();
  }, 'Drafts ready — read each one, then publish').catch(() => setP(null));

  return (
    <div className="max-w-3xl space-y-4">
      <Tile tone="soft">
        <p className="text-body leading-relaxed">Tick the courses you want and the AI drafts each one: lessons, quick checks and quiz questions, naming its sources. They are saved as <b>drafts</b> — read and correct each one before you publish it. First aid courses are awareness only and point officers to certified training.</p>
        <p className="mt-2 text-footnote text-muted">Each course takes about a minute and uses AI credits from your monthly allowance.</p>
      </Tile>
      <Load q={q}>
        {() => (
          <List>
            {topics.map((t) => (
              <label key={t.title} className="flex cursor-pointer items-start gap-3 px-4 py-3">
                <input type="checkbox" className="mt-1 h-4 w-4" disabled={busy} checked={sel.includes(t.title)} onChange={() => toggle(t.title)} />
                <span className="min-w-0 flex-1">
                  <span className="block text-body font-semibold">{t.title}</span>
                  <span className="block text-footnote text-muted">{TOPICS[t.topic]}{t.notes ? ` · ${t.notes}` : ''}</span>
                </span>
                {t.exists && <Pill tone="grey">Already added</Pill>}
              </label>
            ))}
          </List>
        )}
      </Load>
      <DraftProgress p={p} />
      {log.length > 0 && (
        <div className="space-y-1 text-subhead">
          {log.map((l) => <div key={l.title} className={l.ok ? 'text-green' : 'text-red'}>{l.ok ? '✓' : '✕'} {l.title}{l.error ? ` — ${l.error}` : ''}</div>)}
        </div>
      )}
      <div className="flex gap-2">
        <Button icon={Sparkles} busy={busy} disabled={!sel.length} onClick={go}>Draft {sel.length || ''} course{sel.length === 1 ? '' : 's'}</Button>
        {log.length > 0 && !busy && <Button variant="secondary" onClick={onDone}>See the courses</Button>}
      </div>
    </div>
  );
}
