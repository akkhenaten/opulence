// Officer signing in three steps: read the whole document, sign, then download the signed copy.
// Shared by contracts, policies and pay rises.
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, CheckCircle2, Download, Eraser, FileSignature, ShieldCheck } from 'lucide-react';
import { downloadAction } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { ActionBar, Button, cx, dateTime, Input, Progress, Toggle, useAction, useToast } from '../../ui/index.jsx';
import { DocPaper } from '../../ui/DocPaper.jsx';
import { SignaturePad } from '../../ui/SignaturePad.jsx';

const PdfPages = lazy(() => import('../../ui/PdfPages.jsx'));

/** An uploaded contract: its own pages exactly as uploaded, then the signature page */
function Original({ url, onReady }) {
  if (!url) return null;
  return <Suspense fallback={<div className="skeleton mb-3 rounded-xl" style={{ aspectRatio: '0.707' }} />}><PdfPages src={url} onReady={onReady} className="mb-3" /></Suspense>;
}

const STEPS = ['Read', 'Sign', 'Done'];

const CONSENT = {
  contract: 'I have read this contract and agree to its terms',
  policy: 'I have read and understood this policy and agree to follow it',
  pay_rise: 'I accept this pay rise on these terms',
  venue_pack: 'I have read and understood these instructions and procedures and agree to follow them',
};
const SIGN_LABEL = { pay_rise: 'agreement', venue_pack: 'site pack' };

export function Stepper({ step, steps = STEPS }) {
  return (
    <ol className="mb-4 flex items-center gap-2" aria-label="Signing steps">
      {steps.map((s, i) => (
        <li key={s} className="flex flex-1 items-center gap-2" aria-current={i === step ? 'step' : undefined}>
          <span className={cx('grid h-7 w-7 shrink-0 place-items-center rounded-full text-footnote font-bold transition-colors',
            i < step ? 'bg-green text-white' : i === step ? 'bg-blue text-white' : 'bg-fill-strong text-muted')}>
            {i < step ? <Check size={15} strokeWidth={3} /> : i + 1}
          </span>
          <span className={cx('text-footnote font-semibold', i === step ? 'text-ink' : 'text-muted')}>{s}</span>
          {i < steps.length - 1 && <span className={cx('h-0.5 flex-1 rounded-full', i < step ? 'bg-green' : 'bg-fill-strong')} />}
        </li>
      ))}
    </ol>
  );
}

// How far down the document the reader has scrolled, and whether the end has been seen
export function useReadProgress(paper, end, active) {
  const [pct, setPct] = useState(0);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!active) return undefined;
    const measure = () => {
      const el = paper.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const seen = window.innerHeight - r.top;
      setPct(Math.max(0, Math.min(100, Math.round((seen / r.height) * 100))));
    };
    measure();
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    const io = typeof IntersectionObserver !== 'undefined' && end.current
      ? new IntersectionObserver(([e]) => { if (e.isIntersecting) { setDone(true); setPct(100); } })
      : null;
    if (io) io.observe(end.current); else setDone(true);
    return () => { window.removeEventListener('scroll', measure); window.removeEventListener('resize', measure); io?.disconnect(); };
  }, [active, paper, end]);
  return [done ? 100 : pct, done];
}

/**
 * d: what contracts.get / payAgreements.get return, mapped by the wrapper to
 *   { kind, status, doc, company, officer, reference }
 * sign(signature, name) → promise of the server reply; pdf: [action, body]
 */
export default function SignFlow({ d, sign, pdf, onSigned, onDownload, doneNote, defaultName }) {
  const signed = !!d.officer?.at;
  const open = d.status === 'sent';
  const [step, setStep] = useState(signed ? 2 : 0);
  const paper = useRef(null);
  const end = useRef(null);
  // With an uploaded PDF the end only counts once its pages are laid out
  const [pages, setPages] = useState(0);
  const [pct, seenEnd] = useReadProgress(paper, end, open && step === 0 && (!d.pdfUrl || pages > 0));
  const read = seenEnd && (!d.pdfUrl || pages > 0);
  const [run, busy] = useAction();
  const download = () => run(() => (onDownload ? onDownload() : downloadAction(...pdf))).catch(() => {});
  useEffect(() => { window.scrollTo({ top: 0 }); }, [step]);

  // Withdrawn or replaced: the document is shown, but there is nothing to do
  if (!open && !signed) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl bg-bg px-4 py-3 text-subhead text-muted">
          {d.status === 'superseded'
            ? 'This version has been replaced by a newer one. Check your notifications for the new version to sign.'
            : 'The office withdrew this document. It no longer needs signing.'}
        </div>
        <Original url={d.pdfUrl} />
        <DocPaper doc={d.doc} signers={{ company: d.company }} status={d.status} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Stepper step={step} />

      {step === 0 && (
        <>
          <div className="sticky top-[calc(56px+env(safe-area-inset-top))] z-20 -mx-[var(--px)] mb-3 bg-bg/90 px-[var(--px)] py-2 backdrop-blur-xl">
            <div className="flex items-center justify-between gap-3 text-footnote">
              <span className="font-semibold">{read ? 'You have reached the end' : 'Read to the end to continue'}</span>
              <span className="num text-muted">{pct}%</span>
            </div>
            <Progress value={pct} max={100} className="mt-1.5" />
          </div>
          <div ref={paper}>
            <Original url={d.pdfUrl} onReady={setPages} />
            <DocPaper ref={end} doc={d.doc} signers={{ company: d.company, officer: null }} />
          </div>
          <ActionBar tone="light">
            <span className="text-subhead font-semibold">{read ? 'Ready to sign' : `${pct}% read`}</span>
            <Button icon={FileSignature} disabled={!read} onClick={() => setStep(1)}>Continue to sign</Button>
          </ActionBar>
        </>
      )}

      {step === 1 && <SignStep d={d} sign={sign} defaultName={defaultName} back={() => setStep(0)} done={() => { setStep(2); onSigned?.(); }} />}

      {step === 2 && (
        <div className="space-y-4">
          <div className="anim-pop rounded-tile bg-surface p-6 text-center shadow-tile">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-green-soft text-green"><CheckCircle2 size={30} /></div>
            <h2 className="display mt-3 text-title2 font-bold">Signed</h2>
            <p className="mt-1 text-subhead text-muted">{d.officer?.name} · {dateTime(d.officer?.at)}</p>
            <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-bg px-3.5 py-1.5 text-footnote">
              <ShieldCheck size={15} className="text-green" /><span className="text-muted">Reference</span><span className="num font-semibold">{d.reference}</span>
            </div>
            <p className="mx-auto mt-3 max-w-sm text-footnote text-muted">{doneNote || 'A sealed copy with both signatures and a signing certificate is saved in your Documents.'}</p>
            {(pdf || onDownload) && <Button size="lg" icon={Download} busy={busy} className="mt-4 w-full sm:w-auto" onClick={download}>Download signed PDF</Button>}
          </div>
          <Original url={d.pdfUrl} />
          <DocPaper doc={d.doc} signers={{ company: d.company, officer: d.officer }} status={d.status} />
        </div>
      )}
    </div>
  );
}

export function SignStep({ d, sign, back, done, defaultName, children }) {
  const { user } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(defaultName ?? user?.name ?? '');
  const [agree, setAgree] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const pad = useRef(null);
  const [run, busy] = useAction();
  const ok = name.trim().length > 2 && agree && hasInk;
  const go = () => {
    const signature = pad.current?.toDataURL();
    if (!signature) { toast('Please sign in the box', 'error'); return; }
    run(() => sign(signature, name.trim()), 'Signed. Thank you.').then(done).catch(() => {});
  };
  return (
    <div className="rounded-tile bg-surface p-5 shadow-tile sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-caption font-semibold uppercase tracking-wide text-muted">{d.doc.typeLabel}</div>
          <h2 className="text-headline font-bold leading-snug">{d.doc.title}</h2>
          <div className="num text-footnote text-muted">{d.reference}</div>
        </div>
        {back && <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={back}>Read again</Button>}
      </div>
      {children}
      <Input className="mt-4" label="Full name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} />
      <div className="mt-4 flex items-center justify-between">
        <span className="text-footnote font-semibold text-muted">Your signature</span>
        <Button variant="ghost" size="sm" icon={Eraser} disabled={!hasInk} onClick={() => pad.current?.clear()}>Clear</Button>
      </div>
      <SignaturePad handle={pad} onInk={setHasInk} className="[&_canvas]:h-52 sm:[&_canvas]:h-56" />
      <div className="mt-4 rounded-2xl bg-bg px-3">
        <Toggle checked={agree} onChange={setAgree} label={CONSENT[d.kind] || CONSENT.contract}
          hint="Your electronic signature is as binding as signing on paper. We record your name, signature, time, IP address and device." />
      </div>
      <Button size="lg" className="mt-4 w-full" icon={FileSignature} busy={busy} disabled={!ok} onClick={go}>Sign {SIGN_LABEL[d.kind] || d.kind}</Button>
    </div>
  );
}
