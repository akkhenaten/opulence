import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Award, BookOpen, ChevronRight, RotateCcw } from 'lucide-react';
import { api } from '../../api.js';
import { Button, cx, dateTime, ErrorBox, Page, Spinner, Tile, useAction } from '../../ui/index.jsx';
import { Progress } from '../officer/_parts.jsx';
import { Options } from './_parts.jsx';

export default function Quiz() {
  const { id } = useParams();
  const nav = useNavigate();
  const [st, setSt] = useState(null);
  const [err, setErr] = useState(null);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState(null);
  const [res, setRes] = useState(null);
  const [result, setResult] = useState(null);
  const [run, busy] = useAction();
  const courseLink = `/officer/learn/academy/${id}`;

  useEffect(() => {
    api('academy.quizStart', { course_id: id }).then((r) => {
      setSt(r);
      // Resume where they left off
      const first = r.questions.findIndex((x) => !(x.id in (r.attempt.answers || {})));
      setI(first === -1 ? r.questions.length : first);
    }).catch(setErr);
  }, [id]);

  if (err) {
    return (
      <Page title="Quiz" back={{ to: courseLink, label: 'Course' }}>
        <ErrorBox error={err} />
        {err.data?.retry_at && <p className="mt-3 text-[14px] text-muted">Read the sections again before your next try.</p>}
      </Page>
    );
  }
  if (!st) return <Page title="Quiz"><Spinner /></Page>;

  const total = st.questions.length;
  const qn = st.questions[i];
  const pick = async (choice) => {
    setPicked(choice);
    try { setRes(await api('academy.quizAnswer', { attempt_id: st.attempt.id, question_id: qn.id, choice })); } catch (e) { setPicked(null); setErr(e); }
  };
  const next = () => { setPicked(null); setRes(null); setI(i + 1); window.scrollTo(0, 0); };
  const submit = () => run(async () => setResult(await api('academy.quizSubmit', { attempt_id: st.attempt.id })));

  if (result) {
    return (
      <Page title={st.course.title} back={{ to: courseLink, label: 'Course' }}>
        <Tile className={cx('text-center', result.passed ? '!bg-green-soft' : '!bg-amber-soft')}>
          <div className={cx('mx-auto mb-3 grid h-16 w-16 place-items-center rounded-full text-white', result.passed ? 'bg-green' : 'bg-amber')}>
            {result.passed ? <Award size={32} /> : <RotateCcw size={30} />}
          </div>
          <div className="display num text-[44px] font-bold">{result.score}%</div>
          <div className="text-[17px] font-bold">{result.passed ? 'You passed' : 'Not this time'}</div>
          <p className="mt-1 text-[15px] text-muted">{result.right} of {result.total} right · pass mark {result.pass_mark}%</p>
          {!result.passed && result.retry_at && <p className="mt-2 text-[14px] font-semibold text-amber">You can try again from {dateTime(result.retry_at)}.</p>}
        </Tile>
        <div className="mt-4 flex flex-wrap gap-2">
          {result.certificate && <Button icon={Award} to={`/officer/learn/certificates/${result.certificate.id}`}>View certificate</Button>}
          <Button variant="secondary" icon={BookOpen} to={courseLink}>Back to the course</Button>
          <Button variant="ghost" onClick={() => nav('/officer/learn')}>Learn</Button>
        </div>
      </Page>
    );
  }

  if (!qn) {
    return (
      <Page title={st.course.title} back={{ to: courseLink, label: 'Course' }}>
        <Tile className="text-center">
          <div className="text-[18px] font-bold">All {total} questions answered</div>
          <p className="mt-1 text-[15px] text-muted">Submit to see your score. You need {st.course.pass_mark}% to pass.</p>
          <Button className="mt-4" size="lg" busy={busy} onClick={submit}>See my result</Button>
        </Tile>
      </Page>
    );
  }

  return (
    <Page title={st.course.title} back={{ to: courseLink, label: 'Course' }}>
      <div className="mb-3 flex items-center gap-3">
        <span className="text-[13px] font-semibold text-muted">Question {i + 1} of {total}</span>
        <Progress value={i + (res ? 1 : 0)} max={total} className="flex-1" />
      </div>
      <Tile>
        {qn.kind === 'scenario' && <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-blue">Scenario</div>}
        <p className="mb-4 text-[17px] font-semibold leading-snug">{qn.prompt}</p>
        <Options options={qn.options} picked={picked} result={res} onPick={pick} disabled={picked != null} />
        {res && (
          <div className={cx('mt-4 rounded-2xl px-4 py-3 text-[14px]', res.correct ? 'bg-green-soft text-green' : 'bg-amber-soft text-amber')}>
            <strong>{res.correct ? 'Right. ' : 'Not quite. '}</strong>{res.explain}
            {!res.correct && res.section_id && <Link to={`${courseLink}?sid=${res.section_id}`} className="mt-1 block font-semibold underline">Read “{res.section_title}” again</Link>}
          </div>
        )}
      </Tile>
      {res && <div className="mt-4 flex justify-end"><Button onClick={next}>{i + 1 < total ? 'Next question' : 'Finish'} <ChevronRight size={16} /></Button></div>}
    </Page>
  );
}
