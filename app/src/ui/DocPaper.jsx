// A signed document drawn as paper on screen, laid out like the PDF: brand header, key facts, numbered clauses,
// the pay-rise terms panel and the two signature boxes. Always light, also in the Control Room style.
import { forwardRef } from 'react';
import { useAuth } from '../auth.jsx';
import { cx, date, dateTime } from './index.jsx';

const Runs = ({ runs }) => runs.map((r, i) => (r.bold ? <strong key={i} className="font-semibold">{r.text}</strong> : <span key={i}>{r.text}</span>));

/** Clauses from the server's parse(): heading, clause, para, bullet, break */
export function Blocks({ blocks, color, preview }) {
  let numbered = false;
  return blocks.map((b, i) => {
    if (b.type === 'heading') {
      numbered = true;
      return (
        <h3 key={i} className="mt-6 flex gap-3 text-callout font-bold leading-snug first:mt-0">
          <span className="num w-8 shrink-0" style={{ color }}>{b.number}</span><span className="min-w-0"><Runs runs={b.runs} /></span>
        </h3>
      );
    }
    if (b.type === 'clause') {
      return (
        <p key={i} className="mt-2.5 flex gap-3 text-subhead leading-relaxed first:mt-0">
          <span className="num w-8 shrink-0 text-muted">{b.number}</span><span className="min-w-0"><Runs runs={b.runs} /></span>
        </p>
      );
    }
    if (b.type === 'bullet') {
      return (
        <p key={i} className={cx('mt-1.5 flex gap-2.5 text-subhead leading-relaxed', numbered && 'pl-11')}>
          <span aria-hidden="true" style={{ color }}>•</span><span className="min-w-0"><Runs runs={b.runs} /></span>
        </p>
      );
    }
    if (b.type === 'break') {
      return preview
        ? <div key={i} className="my-6 flex items-center gap-3 text-caption font-semibold uppercase text-faint"><span className="h-px flex-1 border-t border-dashed border-line" />New page<span className="h-px flex-1 border-t border-dashed border-line" /></div>
        : <div key={i} className="my-6 border-t border-line" />;
    }
    return <p key={i} className="mt-3 text-subhead leading-relaxed first:mt-0"><Runs runs={b.runs} /></p>;
  });
}

function SignBox({ label, s, sub, waiting = 'Awaiting signature' }) {
  return (
    <div className="flex min-w-0 flex-col rounded-xl border border-line p-4">
      <div className="text-caption font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="my-2 grid h-20 place-items-center">
        {s?.png ? <img src={s.png} alt={`Signature of ${s.name}`} className="max-h-20 max-w-full object-contain" />
          : <span className="text-subhead italic text-faint">{waiting}</span>}
      </div>
      <div className="border-t border-line pt-2">
        <div className="truncate text-subhead font-semibold">{s?.name || sub?.name || '—'}</div>
        <div className="truncate text-footnote text-muted">{[s?.title ?? sub?.title, s?.at && dateTime(s.at)].filter(Boolean).join(' · ') || ' '}</div>
      </div>
    </div>
  );
}

/**
 * doc: { typeLabel, title, reference, issuedAt, version, officerName, blocks, terms?, ack? }
 * signers: { company: {name,title,png,at}|null, officer: {name,png,at}|null }
 * `end` is placed after the signature boxes so the reader can tell when the whole document has been seen.
 */
export const DocPaper = forwardRef(function DocPaper({ doc, signers = {}, status, preview, className, children }, end) {
  const { brand } = useAuth();
  const color = brand.color || '#0A6CFF';
  const facts = [
    ['Reference', doc.reference || '—'],
    ['Issued', doc.issuedAt ? date(doc.issuedAt) : '—'],
    ['Between', `${brand.name} and ${doc.officerName || 'the officer'}`],
    ...(doc.version ? [['Version', `v${doc.version}`]] : []),
  ];
  const watermark = status === 'draft' ? 'Draft' : preview ? 'Preview' : status === 'void' ? 'Void' : status === 'superseded' ? 'Replaced' : null;
  return (
    <article className={cx('bg-paper relative overflow-hidden rounded-2xl border border-line text-ink shadow-tile', className)}>
      {watermark && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden">
          <span className="-rotate-[30deg] select-none text-[64px] font-black uppercase tracking-widest text-ink/[0.05] sm:text-[96px]">{watermark}</span>
        </div>
      )}
      <header className="px-5 pt-6 sm:px-10 sm:pt-9">
        <div className="flex items-start justify-between gap-4">
          {brand.logo_url
            ? <img src={brand.logo_url} alt={brand.name} className="h-9 max-w-[45%] object-contain object-left" />
            : <div className="text-headline font-bold">{brand.name}</div>}
          <div className="text-right text-caption font-bold uppercase tracking-[0.12em]" style={{ color }}>{doc.typeLabel}</div>
        </div>
        <h2 className="display mt-5 text-title2 font-bold leading-tight">{doc.title}</h2>
        <div className="mt-3 h-0.5 rounded-full" style={{ background: color }} />
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-bg p-3.5 sm:grid-cols-4">
          {facts.map(([k, v]) => (
            <div key={k} className={cx('min-w-0', k === 'Between' && 'col-span-2 sm:col-span-1')}>
              <dt className="text-caption font-semibold uppercase tracking-wide text-muted">{k}</dt>
              <dd className={cx('mt-0.5 text-footnote font-semibold', k === 'Reference' && 'num')}>{v}</dd>
            </div>
          ))}
        </dl>
      </header>

      {doc.terms && (
        <div className="mx-5 mt-5 grid gap-x-6 gap-y-2 rounded-xl border p-4 sm:mx-10 sm:grid-cols-2" style={{ borderColor: color }}>
          {[...doc.terms.left, ...doc.terms.right].map(([k, v, strong]) => (
            <div key={k} className="flex items-baseline justify-between gap-3 text-subhead">
              <span className="text-muted">{k}</span><span className={cx('num text-right', strong ? 'text-headline font-bold' : 'font-semibold')} style={strong ? { color } : undefined}>{v}</span>
            </div>
          ))}
          {doc.terms.conditions?.length > 0 && (
            <div className="border-t border-line pt-2 text-footnote text-muted sm:col-span-2">
              Starts once these goals are met: {doc.terms.conditions.map((g) => g.title).join(', ')}
            </div>
          )}
        </div>
      )}

      <div className="px-5 py-6 sm:px-10">
        {doc.blocks?.length ? <Blocks blocks={doc.blocks} color={color} preview={preview} /> : <p className="text-subhead italic text-faint">Start typing the wording…</p>}
      </div>

      <footer className="px-5 pb-6 sm:px-10 sm:pb-9">
        {doc.ack && <p className="mb-3 rounded-xl bg-bg px-3.5 py-2.5 text-subhead font-semibold">{doc.ack}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <SignBox label={`For ${brand.name}`} s={signers.company} waiting="No company signature yet" />
          <SignBox label="Officer" s={signers.officer} sub={{ name: doc.officerName }} />
        </div>
        {children}
        <div ref={end} className="h-px" />
      </footer>
    </article>
  );
});
