// One site-pack document (assignment instructions or a procedure) drawn as paper, plus the shared status labels.
import { forwardRef } from 'react';
import { useAuth } from '../../auth.jsx';
import { Blocks } from '../../ui/DocPaper.jsx';
import { cx, date, Pill } from '../../ui/index.jsx';
import { inkColor } from '../../ui/style.js';

export const PACK_TONE = { none: 'grey', current: 'green', resign: 'amber', refresher: 'amber', unsigned: 'red' };
export const PACK_LABEL = { none: 'No pack', current: 'Current', resign: 'Needs re-sign', refresher: 'Refresher due', unsigned: 'Not signed' };
export const PackPill = ({ status, className }) => <Pill tone={PACK_TONE[status]} className={className}>{PACK_LABEL[status] || status}</Pill>;

export const KIND_LABEL = { instructions: 'Assignment instructions', procedure: 'Procedure' };
export const docKind = (d) => (d.kind === 'instructions' ? 'Assignment instructions' : d.scope === 'general' ? 'Company procedure' : 'Site procedure');

export const PackPaper = forwardRef(function PackPaper({ doc, status, className, children }, end) {
  const { brand } = useAuth();
  const color = inkColor(brand.color);
  return (
    <article className={cx('bg-paper relative overflow-hidden rounded-2xl border border-line text-ink shadow-tile', className)}>
      {status === 'draft' && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden">
          <span className="-rotate-[30deg] select-none text-[64px] font-black uppercase tracking-widest text-ink/[0.05] sm:text-[96px]">Draft</span>
        </div>
      )}
      <header className="px-5 pt-6 sm:px-10 sm:pt-9">
        <div className="text-caption font-bold uppercase tracking-[0.12em]" style={{ color }}>{docKind(doc)}</div>
        <h2 className="display mt-2 text-title2 font-bold leading-tight">{doc.title}</h2>
        <div className="mt-1 text-footnote text-muted">
          {[doc.version ? `Version ${doc.version}` : 'Not published yet', doc.published_at && `published ${date(doc.published_at)}`].filter(Boolean).join(' · ')}
        </div>
        <div className="mt-3 h-0.5 rounded-full" style={{ background: color }} />
      </header>
      <div className="px-5 py-6 sm:px-10">
        {doc.blocks?.length ? <Blocks blocks={doc.blocks} color={color} /> : <p className="text-subhead italic text-faint">Nothing written yet.</p>}
      </div>
      {children && <footer className="px-5 pb-6 sm:px-10">{children}</footer>}
      <div ref={end} className="h-px" />
    </article>
  );
});
