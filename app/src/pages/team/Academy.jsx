import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Download, GraduationCap, Plus, Sparkles, UserPlus } from 'lucide-react';
import { api, downloadText } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Avatar, Button, cx, date, Empty, ErrorBox, List, Load, Page, Pill, Pressable, Row, Spinner, Table, Tabs, Tile, useAction, useApi } from '../../ui/index.jsx';
import { STATE, StatePill, TOPICS } from '../learn/_parts.jsx';
import { AssignSheet, DraftProgress, draftCourse, NewCourseSheet } from './_parts.jsx';

export default function Academy() {
  const { user } = useAuth();
  const [sp, setSp] = useSearchParams();
  const co = user.role === 'company';
  const tab = sp.get('tab') || 'courses';
  const tabs = [{ value: 'courses', label: 'Courses' }, { value: 'results', label: 'Results' }, ...(co ? [{ value: 'starter', label: 'Starter library' }] : [])];
  return (
    <Page title="Academy" subtitle="Training for your officers, with quizzes and certificates" wide>
      <Tabs tabs={tabs} value={tab} onChange={(v) => setSp(v === 'courses' ? {} : { tab: v }, { replace: true })} />
      {tab === 'courses' && <Courses co={co} />}
      {tab === 'results' && <Results />}
      {tab === 'starter' && co && <Starter onDone={() => setSp({}, { replace: true })} />}
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
  const [archived, setArchived] = useState(false);
  const q = useApi('academy.courses', { archived });
  const [add, setAdd] = useState(false);
  const [assign, setAssign] = useState(null);
  const open = (c) => nav(`/${user.role}/team/academy/${c.id}`);
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-subhead text-muted"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} /> Show archived</label>
        {co && <Button icon={Plus} onClick={() => setAdd(true)}>New course</Button>}
      </div>
      <Load q={q}>
        {(rows) => rows.length ? (
          <Table rows={rows} onRow={open} columns={[
            { key: 'title', label: 'Course', render: (c) => <div className="min-w-0"><div className="font-semibold">{c.title}</div><div className="text-caption text-muted">{TOPICS[c.topic]}{c.mandatory ? ' · Required' : ''}{c.renew_months ? ` · Renew every ${c.renew_months} months` : ''}</div></div> },
            { key: 'status', label: 'Status', render: courseStatus },
            { key: 'content', label: 'Content', render: (c) => <span className={cx('text-footnote', (c.empty_sections || c.questions < 5) && 'text-amber')}>{c.sections} sections · {c.questions} questions{c.empty_sections ? ` · ${c.empty_sections} empty` : ''}</span> },
            { key: 'people', label: 'Officers', render: (c) => <span className="num text-footnote">{c.passed} passed / {c.assigned} assigned</span> },
            { key: 'go', label: '', align: 'right', render: (c) => c.status === 'published' ? <Button size="sm" variant="soft" icon={UserPlus} onClick={(e) => { e.stopPropagation(); setAssign(c.id); }}>Assign</Button> : null },
          ]} />
        ) : (
          <Empty icon={GraduationCap} title="No courses yet" body={co ? 'Create one, or draft the whole starter library with AI.' : 'Your company has not added any courses yet.'}
            action={co && <Button icon={Sparkles} to={`/${user.role}/team/academy?tab=starter`}>Open the starter library</Button>} />
        )}
      </Load>
      <NewCourseSheet open={add} onClose={() => setAdd(false)} onCreated={(id) => nav(`/${user.role}/team/academy/${id}`)} />
      {assign && <AssignSheet open courseId={assign} onClose={() => setAssign(null)} onDone={q.reload} />}
    </>
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
        <Button variant="secondary" icon={Download} onClick={csv}>Download CSV</Button>
        <Button icon={UserPlus} onClick={() => setAssign(true)}>Assign training</Button>
      </div>
      <div className="overflow-x-auto rounded-tile border border-black/[0.04] bg-surface shadow-tile">
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
                    <Avatar name={`${r.officer.first_name} ${r.officer.last_name}`} size={28} />
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
