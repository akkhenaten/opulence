import { useParams } from 'react-router-dom';
import { BookOpen, FilePenLine, Phone, Scale, ShieldAlert, Star, X } from 'lucide-react';
import { api } from '../../api.js';
import { Button, cx, date, Empty, Page, Spinner, Tile } from '../../ui/index.jsx';
import { category, useToolbox } from './_parts.jsx';

export default function Card() {
  const { id } = useParams();
  const tb = useToolbox();
  const c = tb.cards?.find((x) => x.id === id);
  const back = { to: '/officer/learn/toolbox', label: 'Toolbox' };
  if (!c) return <Page title="Guide" back={back}>{tb.loading ? <Spinner /> : <Empty title="Guide not found" body="It may have been withdrawn by your company." />}</Page>;
  const fav = () => { tb.setFavourite(c.id, !c.favourite); api('toolbox.favourite', { id: c.id, on: !c.favourite }).catch(() => {}); };
  return (
    <Page title={c.title} back={back}
      actions={<Button variant={c.favourite ? 'soft' : 'secondary'} icon={Star} onClick={fav}>{c.favourite ? 'Saved' : 'Save'}</Button>}>
      <CardView c={c} officer />
    </Page>
  );
}

/** The guide itself; also used as the preview in the manager's editor. */
export function CardView({ c, officer }) {
  const k = category(c.category);
  const steps = c.steps || [];
  const dont = c.dont || [];
  return (
    <div className="space-y-3">
      <div className={cx('flex items-start gap-3 rounded-tile p-4', k.tone)}>
        <k.icon size={24} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="text-caption font-semibold uppercase tracking-wide opacity-80">{k.label}{c.venue_name ? ` · ${c.venue_name}` : ''}</div>
          <div className="text-headline font-bold leading-snug">{c.summary}</div>
        </div>
      </div>
      {c.category === 'first_aid' && (
        <a href="tel:999" className="flex items-center gap-3 rounded-tile bg-red px-4 py-3 text-white">
          <Phone size={18} /><span className="flex-1 text-body font-bold">Emergency? Call 999 first</span><span className="text-footnote opacity-80">Tap to call</span>
        </a>
      )}
      {steps.length > 0 && (
        <Tile title="What to do">
          <ol className="space-y-3">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-3 text-callout leading-snug">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue text-footnote font-bold text-white">{i + 1}</span>
                <span className="pt-0.5">{s}</span>
              </li>
            ))}
          </ol>
        </Tile>
      )}
      {dont.length > 0 && (
        <Tile title="Don't">
          <ul className="space-y-2">
            {dont.map((s, i) => <li key={i} className="flex gap-3 text-body"><X size={18} className="mt-0.5 shrink-0 text-red" />{s}</li>)}
          </ul>
        </Tile>
      )}
      {c.escalate && <Tile title="When to call for help" icon={ShieldAlert}><p className="text-body leading-relaxed">{c.escalate}</p></Tile>}
      {c.law && <Tile title="The law" icon={Scale}><p className="text-body leading-relaxed">{c.law}</p></Tile>}
      {c.report_tips && (
        <Tile title="For your incident report" icon={FilePenLine}>
          <p className="text-body leading-relaxed">{c.report_tips}</p>
          {officer && <Button className="mt-3" size="sm" variant="soft" icon={FilePenLine} to="/officer/incidents/new">Report an incident</Button>}
        </Tile>
      )}
      {officer && c.course_title && c.course_id && <Button variant="secondary" icon={BookOpen} to={`/officer/learn/academy/${c.course_id}`}>Course: {c.course_title}</Button>}
      {officer && c.course_id && !c.course_title && <p className="px-1 text-footnote text-muted">Course no longer available · any certificate you earned from it stays valid</p>}
      <div className="px-1 text-caption text-faint">
        {(c.sources || []).length > 0 && <div>Sources: {c.sources.join('; ')}</div>}
        <div>Approved by your company{c.updated_at ? ` · updated ${date(c.updated_at)}` : ''}. Guidance only — follow your training, your supervisor and the 999 call handler.</div>
      </div>
    </div>
  );
}
