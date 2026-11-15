import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Award, BookOpen, Check, ChevronLeft, ChevronRight, CircleHelp, ClipboardCheck, MessageCircleQuestion } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Button, cx, date, dateTime, Load, Page, Pill, Pressable, Sheet, Tile, useApi } from '../../ui/index.jsx';
import Chat from '../../ui/Chat.jsx';
import { Progress } from '../officer/_parts.jsx';
import { Lesson, Options, requiredLabel, TOPICS } from './_parts.jsx';
import { Blocks, HeroImage } from './_blocks.jsx';

export default function Course() {
  const { id } = useParams();
  const { user } = useAuth();
  const q = useApi('academy.course', { id });
  const officer = user.role === 'officer';
  const back = officer ? { to: '/officer/learn', label: 'Learn' } : { to: `/${user.role}/team/academy/${id}`, label: 'Editor' };
  return (
    <Load q={q}>
      {(d) => (
        <Page title={d.course.title} subtitle={[TOPICS[d.course.topic], officer ? requiredLabel(d.course.mandatory, d.assigned) : d.course.mandatory && 'Required', d.due_date && `Due ${date(d.due_date)}`].filter(Boolean).join(' · ')} back={back}>
          {!officer && <div className="mb-3 rounded-2xl bg-amber-soft px-4 py-2.5 text-subhead font-semibold text-amber">Preview — this is what officers see{d.course.status !== 'published' && ' once it is published'}.</div>}
          <Body d={d} officer={officer} reload={q.reload} />
        </Page>
      )}
    </Load>
  );
}

function Body({ d, officer, reload }) {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const [tutor, setTutor] = useState(false);
  const [done, setDone] = useState(() => new Set(d.done_sections));
  const total = d.sections.length;
  const sid = d.sections.findIndex((x) => x.id === sp.get('sid'));
  const s = sid >= 0 ? sid : sp.get('s');
  const idx = s == null ? null : Math.max(0, Math.min(total - 1, Number(s)));
  const go = (i) => { setSp(i == null ? {} : { s: String(i) }, { replace: false }); window.scrollTo(0, 0); };
  const allRead = done.size >= total;

  const markDone = async (sec) => {
    if (!done.has(sec.id)) {
      setDone((x) => new Set([...x, sec.id]));
      if (officer) api('academy.sectionDone', { course_id: d.course.id, section_id: sec.id }).catch(() => {});
    }
  };

  const tutorBtn = <Button variant="soft" icon={MessageCircleQuestion} onClick={() => setTutor(true)}>Ask the tutor</Button>;
  const tutorSheet = (
    <Sheet open={tutor} onClose={() => setTutor(false)} title="Course tutor" size="lg">
      <Chat action="academy.tutor" extra={{ course_id: d.course.id }} storageKey={`orb.tutor.${d.course.id}`} placeholder="Ask about this course…" className="-mx-5 min-h-[50dvh]"
        prompts={['Explain this in simple words', 'Give me an example', 'What is the most important thing to remember?']}
        empty={<>
          <div className="text-callout font-semibold">Ask anything about this course</div>
          <p className="mx-auto mt-1 max-w-sm text-subhead text-muted">The tutor only answers from this course. For anything else, check the Toolbox or ask your manager.</p>
        </>} />
    </Sheet>
  );

  if (idx != null && d.sections[idx]) {
    const sec = d.sections[idx];
    return (
      <>
        <div className="mb-3 flex items-center gap-3">
          <span className="text-footnote font-semibold text-muted">Section {idx + 1} of {total}</span>
          <Progress value={idx + 1} max={total} className="flex-1" />
        </div>
        <Tile>
          <HeroImage key={`i${sec.id}`} blocks={sec.blocks} />
          <h2 className="mb-3 text-title2 font-bold leading-tight">{sec.title}</h2>
          <Lesson text={sec.body} />
          <Blocks key={sec.id} blocks={sec.blocks} />
        </Tile>
        {sec.quick_check && <QuickCheck key={sec.id} sec={sec} />}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Button variant="secondary" icon={ChevronLeft} onClick={() => go(idx === 0 ? null : idx - 1)}>{idx === 0 ? 'Overview' : 'Back'}</Button>
          {tutorBtn}
          <Button onClick={() => { markDone(sec); go(idx + 1 < total ? idx + 1 : null); }}>{idx + 1 < total ? 'Next section' : 'Finish'} <ChevronRight size={16} /></Button>
        </div>
        {tutorSheet}
      </>
    );
  }

  const next = d.sections.findIndex((x) => !done.has(x.id));
  const cert = d.certificate;
  return (
    <>
      {d.course.summary && <p className="mb-4 text-callout leading-relaxed text-muted">{d.course.summary}</p>}
      {cert && (
        <Tile className="mb-3 !bg-green-soft" to={officer ? `/officer/learn/certificates/${cert.id}` : undefined}>
          <div className="flex items-center gap-3 text-green">
            <Award size={26} />
            <div><div className="font-bold">Passed with {cert.score}%</div><div className="text-footnote">Certificate {cert.ref}{cert.expires_at ? ` · renew by ${date(cert.expires_at)}` : ''}</div></div>
          </div>
        </Tile>
      )}
      <div className="mb-3 flex items-center gap-3">
        <span className="text-footnote font-semibold text-muted">{done.size} of {total} sections read</span>
        <Progress value={done.size} max={Math.max(1, total)} className="flex-1" />
      </div>
      <Tile pad={false} className="overflow-hidden">
        <ol className="divide-y divide-line">
          {d.sections.map((x, i) => (
            <li key={x.id}>
              <Pressable onClick={() => go(i)} className="flex items-center gap-3 px-4 py-3.5">
                <span className={cx('grid h-8 w-8 shrink-0 place-items-center rounded-full text-footnote font-bold', done.has(x.id) ? 'bg-green text-white' : 'bg-bg text-muted')}>{done.has(x.id) ? <Check size={16} /> : i + 1}</span>
                <span className="min-w-0 flex-1 text-body font-semibold">{x.title}</span>
                <ChevronRight size={18} className="text-faint" />
              </Pressable>
            </li>
          ))}
        </ol>
      </Tile>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button icon={BookOpen} onClick={() => go(next === -1 ? 0 : next)}>{done.size === 0 ? 'Start' : next === -1 ? 'Read again' : 'Continue'}</Button>
        {tutorBtn}
      </div>

      <Tile className="mt-4" title="Final quiz" icon={ClipboardCheck}>
        <p className="text-body">{Math.min(d.course.quiz_size, d.questions)} questions · pass mark {d.course.pass_mark}%{d.last_attempt ? ` · last score ${d.last_attempt.score}%` : ''}</p>
        {d.retry_at ? (
          <p className="mt-2 text-subhead font-semibold text-amber">You can retake the quiz from {dateTime(d.retry_at)}. Go over the sections again in the meantime.</p>
        ) : !allRead && !cert ? (
          <p className="mt-2 text-subhead text-muted"><CircleHelp size={14} className="mr-1 inline" />Read every section first — the questions come from them.</p>
        ) : null}
        {officer && (
          <Button className="mt-3" disabled={!!d.retry_at || (!allRead && !cert)} onClick={() => nav(`/officer/learn/academy/${d.course.id}/quiz`)}>
            {cert ? 'Retake the quiz' : 'Take the quiz'}
          </Button>
        )}
        {!officer && <Pill className="mt-3" tone="grey">Officers take the quiz from their app</Pill>}
      </Tile>
      {tutorSheet}
    </>
  );
}

function QuickCheck({ sec }) {
  const [picked, setPicked] = useState(null);
  const [res, setRes] = useState(null);
  useEffect(() => { setPicked(null); setRes(null); }, [sec.id]);
  const pick = async (i) => {
    setPicked(i);
    try { setRes(await api('academy.check', { section_id: sec.id, choice: i })); } catch { setPicked(null); }
  };
  return (
    <Tile className="mt-3" title="Quick check" icon={CircleHelp}>
      <p className="mb-3 text-callout font-semibold">{sec.quick_check.prompt}</p>
      <Options options={sec.quick_check.options} picked={picked} result={res} onPick={pick} />
      {res && <p className={cx('mt-3 rounded-2xl px-4 py-3 text-subhead', res.correct ? 'bg-green-soft text-green' : 'bg-amber-soft text-amber')}><strong>{res.correct ? 'Right. ' : 'Not quite. '}</strong>{res.explain}</p>}
    </Tile>
  );
}
