import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Award, BookOpen, BookOpenCheck, ChevronRight, GraduationCap, Layers, Sparkles, Star, WifiOff } from 'lucide-react';
import { useAuth } from '../../auth.jsx';
import { cx, date, dateShort, Empty, List, Load, Page, Pressable, Row, SearchInput, Section, Spinner, Tile, useApi, usePullRefresh } from '../../ui/index.jsx';
import { NotLinked, Progress } from '../officer/_parts.jsx';
import { CATEGORIES, requiredLabel, StatePill, TOPICS, useModules, useToolbox } from './_parts.jsx';
import Suggest from './Suggest.jsx';
import EmergencyEntry from '../guide/emergency/Entry.jsx';
import FlowEntry from '../guide/flow/Entry.jsx';

export default function Learn() {
  const { user } = useAuth();
  const mods = useModules();
  if (!user.officer_id) return <Page title="Learn"><NotLinked /></Page>;
  if (!mods) return <Page title="Learn"><Spinner /></Page>;
  return (
    <Page title="Learn" subtitle="Training, quick guides and what to do">
      {/* Same entries as the Toolbox, shown under the same settings */}
      <EmergencyEntry from="/officer/learn" />
      <FlowEntry from="/officer/learn" />
      {mods.toolbox && <ToolboxPart />}
      {mods.academy && <AcademyPart />}
      {!mods.toolbox && !mods.academy && <Empty icon={GraduationCap} title="Learning is switched off" body="Your company hasn't turned on training or the Toolbox yet." />}
    </Page>
  );
}

function ToolboxPart() {
  const nav = useNavigate();
  const tb = useToolbox();
  const [text, setText] = useState('');
  const [ask, setAsk] = useState(false);
  const cards = tb.cards || [];
  const favs = cards.filter((c) => c.favourite);
  const count = (cat) => cards.filter((c) => c.category === cat).length;
  return (
    <>
      <form onSubmit={(e) => { e.preventDefault(); nav(`/officer/learn/toolbox${text.trim() ? `?q=${encodeURIComponent(text.trim())}` : ''}`); }}
        role="search">
        <SearchInput collapse={false} value={text} onChange={(e) => setText(e.target.value)} placeholder="Search the Toolbox — CPR, ejection, spiking…" />
      </form>
      {tb.offline && <div className="mt-2 flex items-center gap-2 px-1 text-footnote font-semibold text-amber"><WifiOff size={14} /> Offline — showing your saved copy</div>}

      <Pressable card onClick={() => setAsk(true)}
        className="mt-3 flex items-center gap-3 rounded-tile bg-blue p-4 text-white shadow-tile">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/15"><Sparkles size={24} /></span>
        <span className="min-w-0 flex-1"><span className="block text-headline font-bold">What should I do?</span><span className="block text-footnote opacity-80">Describe the situation — Orb finds the right guide</span></span>
        <ChevronRight size={20} className="opacity-70" />
      </Pressable>

      <div className="mt-3 grid grid-cols-2 gap-3">
        {CATEGORIES.filter((c) => c.value !== 'venue' || count('venue')).map((c) => (
          <Tile key={c.value} to={`/officer/learn/toolbox?cat=${c.value}`} className="!p-4">
            <span className={cx('mb-2 grid h-10 w-10 place-items-center rounded-xl', c.tone)}><c.icon size={20} /></span>
            <div className="text-body font-semibold leading-tight">{c.label}</div>
            <div className="text-footnote text-muted">{tb.cards ? `${count(c.value)} guide${count(c.value) === 1 ? '' : 's'}` : '…'}</div>
          </Tile>
        ))}
        <Tile to="/officer/learn/revise" className="!p-4">
          <span className="mb-2 grid h-10 w-10 place-items-center rounded-xl bg-indigo-soft text-indigo"><Layers size={20} /></span>
          <div className="text-body font-semibold leading-tight">Revise</div>
          <div className="text-footnote text-muted">Flip-card practice</div>
        </Tile>
      </div>

      {favs.length > 0 && (
        <Section title="Saved guides" icon={Star} count={favs.length}>
          <List>
            {favs.map((c) => <Row key={c.id} to={`/officer/learn/toolbox/${c.id}`} left={<Star size={18} className="fill-amber text-amber" />} title={c.title} subtitle={c.summary} />)}
          </List>
        </Section>
      )}
      <Suggest open={ask} onClose={() => setAsk(false)} />
    </>
  );
}

function AcademyPart() {
  const q = useApi('academy.my', {});
  const pull = usePullRefresh(q.reload);
  return (
    <>
    {pull}
    <Load q={q} skeleton="rows">
      {({ courses, certificates }) => {
        const mine = courses.filter((c) => c.assignment_id || ['in_progress', 'passed', 'renew', 'expired'].includes(c.state));
        const todo = mine.filter((c) => c.state !== 'passed');
        const done = mine.filter((c) => c.state === 'passed');
        const other = courses.filter((c) => !mine.includes(c));
        return (
          <>
            <Section title="Your training" icon={GraduationCap} action={<span className="text-footnote text-muted">{done.length} of {mine.length} complete</span>}>
              {mine.length ? (
                <List>
                  {[...todo, ...done].map((c) => <CourseRow key={c.id} c={c} />)}
                </List>
              ) : <Empty icon={GraduationCap} title="No training assigned" body="When your manager assigns a course it shows up here. You can take any course below in the meantime." />}
            </Section>
            {other.length > 0 && (
              <Section title="More courses" icon={BookOpen} count={other.length}>
                <List>{other.map((c) => <CourseRow key={c.id} c={c} />)}</List>
              </Section>
            )}
            {certificates.length > 0 && (
              <Section title="My certificates" icon={Award} count={certificates.length}>
                <List>
                  {certificates.map((x) => (
                    <Row key={x.id} to={`/officer/learn/certificates/${x.id}`} left={<span className="grid h-9 w-9 place-items-center rounded-xl bg-green-soft text-green"><Award size={18} /></span>}
                      title={x.title} subtitle={`${x.ref} · ${x.score}% · ${date(x.issued_at)}${x.expires_at ? ` · renew by ${dateShort(x.expires_at)}` : ''}`} />
                  ))}
                </List>
              </Section>
            )}
          </>
        );
      }}
    </Load>
    </>
  );
}

function CourseRow({ c }) {
  const pct = c.sections ? c.done_sections / c.sections : 0;
  const due = c.due_date && c.state !== 'passed' ? `Due ${dateShort(c.due_date)}` : null;
  return (
    <Row to={`/officer/learn/academy/${c.id}`}
      left={<span className={cx('grid h-10 w-10 place-items-center rounded-xl', c.state === 'passed' ? 'bg-green-soft text-green' : 'bg-blue-soft text-blue')}>{c.state === 'passed' ? <Award size={20} /> : <BookOpenCheck size={20} />}</span>}
      title={c.title}
      subtitle={(
        <span className="flex items-center gap-2">
          <span>{[TOPICS[c.topic], requiredLabel(c.mandatory, !!c.assignment_id), due].filter(Boolean).join(' · ')}</span>
          {c.state === 'in_progress' && <Progress value={pct} max={1} className="!w-16" />}
        </span>
      )}
      right={<StatePill state={c.state} />} />
  );
}
