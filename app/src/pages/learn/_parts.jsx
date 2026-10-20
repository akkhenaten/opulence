import { Fragment, useEffect, useState } from 'react';
import { HeartPulse, MessageSquareWarning, Scale, Building2, GraduationCap } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { cx, Pill } from '../../ui/index.jsx';

export const TOPICS = { law: 'UK law', operations: 'Operations', first_aid: 'First aid' };
export const CATEGORIES = [
  { value: 'first_aid', label: 'First aid', icon: HeartPulse, tone: 'bg-red-soft text-red' },
  { value: 'situations', label: 'Situations', icon: MessageSquareWarning, tone: 'bg-amber-soft text-amber' },
  { value: 'law', label: 'Law at a glance', icon: Scale, tone: 'bg-blue-soft text-blue' },
  { value: 'venue', label: 'Venue procedures', icon: Building2, tone: 'bg-[#EEF0F3] text-ink' },
];
export const category = (v) => CATEGORIES.find((c) => c.value === v) || { label: v, icon: GraduationCap, tone: 'bg-bg text-ink' };

export const STATE = {
  passed: { label: 'Passed', tone: 'green' },
  overdue: { label: 'Overdue', tone: 'red' },
  renew: { label: 'Renew soon', tone: 'amber' },
  expired: { label: 'Expired', tone: 'red' },
  failed: { label: 'Not passed yet', tone: 'amber' },
  in_progress: { label: 'In progress', tone: 'blue' },
  assigned: { label: 'To do', tone: 'blue' },
  not_started: { label: 'Not started', tone: 'grey' },
  none: { label: '—', tone: 'grey' },
};
export const StatePill = ({ state }) => <Pill tone={STATE[state]?.tone}>{STATE[state]?.label || state}</Pill>;

// Where the Learn pages live for this person: officers have their own tab, managers preview under Team
export function useLearnBase() {
  const { user } = useAuth();
  return user.role === 'officer' ? '/officer/learn' : `/${user.role}/team`;
}

// "**bold**" inside a line
function inline(text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : <Fragment key={i}>{p}</Fragment>));
}

/** Renders the lesson format the AI writes: paragraphs, "### " headings, "- " bullets, **bold**. */
export function Lesson({ text, className }) {
  const blocks = [];
  let list = null;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (/^[-•*] /.test(line)) { (list ||= []).push(line.slice(2)); continue; }
    if (list) { blocks.push({ list }); list = null; }
    if (!line) continue;
    if (line.startsWith('#')) blocks.push({ h: line.replace(/^#+\s*/, '') });
    else blocks.push({ p: line });
  }
  if (list) blocks.push({ list });
  return (
    <div className={cx('space-y-3 text-[16px] leading-relaxed', className)}>
      {blocks.map((b, i) => (b.h ? <h3 key={i} className="pt-2 text-[17px] font-bold">{inline(b.h)}</h3>
        : b.list ? <ul key={i} className="list-disc space-y-1 pl-5">{b.list.map((x, j) => <li key={j}>{inline(x)}</li>)}</ul>
          : <p key={i}>{inline(b.p)}</p>))}
    </div>
  );
}

/** Option buttons for a quiz or quick check; shows right/wrong once `result` is known. */
export function Options({ options, picked, result, onPick, disabled }) {
  return (
    <div className="space-y-2">
      {options.map((o, i) => {
        const answered = result != null;
        const right = answered && i === result.answer;
        const wrong = answered && i === picked && !result.correct;
        return (
          <button key={i} type="button" disabled={disabled || answered} onClick={() => onPick(i)}
            className={cx('flex w-full items-start gap-3 rounded-2xl border px-4 py-3 text-left text-[15px] transition',
              right ? 'border-green bg-green-soft' : wrong ? 'border-red bg-red-soft' : picked === i ? 'border-blue bg-blue-soft' : 'border-line bg-surface hover:border-blue/50',
              answered && !right && !wrong && 'opacity-60')}>
            <span className={cx('grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-bold', right ? 'bg-green text-white' : wrong ? 'bg-red text-white' : 'bg-bg text-muted')}>{String.fromCharCode(65 + i)}</span>
            <span className="min-w-0 flex-1">{o}</span>
          </button>
        );
      })}
    </div>
  );
}

const CACHE = 'orb.toolbox';

/** Published Toolbox cards, cached on the phone so they open with no signal. */
export function useToolbox() {
  const [st, setSt] = useState(() => {
    const c = JSON.parse(localStorage.getItem(CACHE) || 'null');
    return { cards: c?.cards || null, offline: false, loading: true, error: null };
  });
  const load = async () => {
    try {
      const r = await api('toolbox.list', {});
      localStorage.setItem(CACHE, JSON.stringify({ cards: r.cards, version: r.version, saved_at: new Date().toISOString() }));
      setSt({ cards: r.cards, offline: false, loading: false, error: null });
    } catch (e) {
      setSt((s) => ({ ...s, loading: false, offline: e.status === 0 && !!s.cards, error: s.cards && e.status === 0 ? null : e }));
    }
  };
  useEffect(() => { load(); }, []);
  const setFavourite = (id, on) => setSt((s) => {
    const cards = s.cards?.map((c) => (c.id === id ? { ...c, favourite: on } : c));
    const c = JSON.parse(localStorage.getItem(CACHE) || 'null');
    if (c) localStorage.setItem(CACHE, JSON.stringify({ ...c, cards }));
    return { ...s, cards };
  });
  return { ...st, reload: load, setFavourite };
}

export const searchCards = (cards, text) => {
  const t = text.trim().toLowerCase();
  if (!t) return cards;
  const words = t.split(/\s+/);
  return cards.filter((c) => {
    const hay = [c.title, c.summary, ...(c.tags || []), ...(c.steps || [])].join(' ').toLowerCase();
    return words.every((w) => hay.includes(w));
  });
};

/** Which optional modules are switched on (missing = on). */
export function useModules() {
  const [m, setM] = useState(null);
  useEffect(() => { api('settings.get', {}).then((s) => setM(s.modules || {})).catch(() => setM({})); }, []);
  return m && { academy: m.academy !== false, toolbox: m.toolbox !== false, everyday: m.everyday !== false };
}
