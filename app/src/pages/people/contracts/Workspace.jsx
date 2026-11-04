// Contract drafting workspace: Guide and Clauses on the left, the live PDF and the review findings on the right.
// Every change autosaves; the server recomposes the document and its findings each time.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, Eye, FileStack, Send, X } from 'lucide-react';
import { api } from '../../../api.js';
import {
  Button, cx, ErrorBox, IconButton, Segmented, Select, Sheet, Spinner, useAction, useApi, useScrollLock, useToast,
} from '../../../ui/index.jsx';
import { DocPaper } from '../../../ui/DocPaper.jsx';
import { SETUP_LINK, useWide } from '../_esign.jsx';
import Guide from './Guide.jsx';
import ClauseList from './ClauseList.jsx';
import AskAi from './AskAi.jsx';
import ReviewList from './ReviewList.jsx';
import ContractFile from './ContractFile.jsx';
import { flash, JURISDICTIONS, SEVERITY, useDraftPdf } from './_shared.jsx';

const BACK = '/company/people/contracts?view=drafts';

// Patches merge per key so quick edits to different questions travel in one save
function merge(a, b) {
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object'
      ? (k === 'assessment' ? { ...out[k], ...v, answers: { ...out[k].answers, ...v.answers } } : { ...out[k], ...v })
      : v;
  }
  return out;
}

function SendSheet({ v, onClose, onSent }) {
  const signers = useApi('esign.signatories');
  const [signer, setSigner] = useState('');
  const [run, busy] = useAction();
  const { party, draft, result, pack } = v;
  const sig = signers.data;
  const signerId = signer || sig?.default_signatory_id || sig?.signatories[0]?.id || '';
  const row = sig?.signatories.find((s) => s.id === signerId);
  // A business, or an officer without a login, signs from a one-time link in their email
  const byLink = party?.kind === 'organisation' || (party?.kind === 'officer' && !party.has_login);
  const noEmail = byLink && !party?.email;
  const send = () => run(() => api('contracts.draft.send', { id: draft.id, signatory_id: signerId || null, link: byLink || undefined }),
    (x) => (x.via === 'link' ? (x.emailed ? `Signing link emailed to ${x.email} · ${x.reference}` : x.warning) : `Sent · ${x.reference}`)).then(onSent).catch(() => {});
  return (
    <Sheet open onClose={onClose} title="Approve and send" size="lg"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button icon={Send} busy={busy} disabled={!row || noEmail} onClick={send}>{byLink ? 'Email signing link' : 'Send for signature'}</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-bg px-4 py-3 text-footnote">
            <div className="text-muted">To</div>
            <div className="text-subhead font-semibold">{party?.name}</div>
            {byLink && party.email && <p className="mt-1 text-muted">{party.kind === 'organisation' ? `Signed by ${party.signatory || 'their signatory'} · ` : 'No app login, so they sign from a link · '}<span className="font-semibold text-ink">{party.email}</span></p>}
            {noEmail && <p className="mt-1 text-amber">{party.kind === 'organisation' ? `Add the email address of the person who signs for ${party.name} first.` : `${party.name} has no email address on their profile, so a signing link cannot be sent.`}</p>}
          </div>
          <div>
            <div className="mb-1.5 text-footnote font-semibold text-muted">Signs for the company</div>
            {sig && !sig.signatories.length ? (
              <div className="rounded-2xl bg-amber-soft px-4 py-3 text-footnote">
                A saved company signature is needed. <Link to={SETUP_LINK} className="font-semibold text-blue">Set up your signature →</Link>
              </div>
            ) : (
              <Select value={signerId} onChange={(e) => setSigner(e.target.value)}
                options={(sig?.signatories || []).map((s) => ({ value: s.id, label: `${s.name}${s.title ? ` · ${s.title}` : ''}${s.id === sig.default_signatory_id ? ' (default)' : ''}` }))} />
            )}
          </div>
        </div>
        {!result.legal && (
          <p className="rounded-2xl bg-amber-soft px-4 py-3 text-footnote">
            Not every clause is recorded as legally reviewed. The wording is approved for use by your company, and the signed copy keeps a record of each clause's status.
          </p>
        )}
        <DocPaper doc={{ typeLabel: pack.doc_title, title: draft.title, reference: 'Given when sent', issuedAt: new Date(), officerName: party?.name, blocks: result.blocks }}
          signers={{ company: row ? { name: row.name, title: row.title, png: row.png } : null }} />
        <p className="text-footnote text-muted">{byLink
          ? 'They get an email with a one-time link that works for 14 days. They read and sign in the browser without an account, and can download the sealed copy for 30 days. A reminder goes after 3 and 7 days.'
          : `${party?.name} gets a notification and an email, reads it on their phone and signs. Unsigned contracts get a reminder after 3 and 7 days.`}</p>
      </div>
    </Sheet>
  );
}

export default function Workspace() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const wide = useWide();
  const [v, setV] = useState(null);
  const [error, setError] = useState(null);
  const [rev, setRev] = useState(0);
  const [save, setSave] = useState('saved');
  const [left, setLeft] = useState('guide');
  const [tab, setTab] = useState('guide');
  const [reviewOpen, setReviewOpen] = useState(true);
  const [file, setFile] = useState(false);
  const [sending, setSending] = useState(false);
  const [approving, setApproving] = useState(false);
  const pending = useRef({});
  const timer = useRef(null);
  const seq = useRef(0);
  useScrollLock(true);

  const take = useCallback((x) => { setV(x); setRev((r) => r + 1); }, []);
  useEffect(() => {
    api('contracts.draft.get', { id }).then((x) => {
      if (x.draft.status !== 'draft') { nav(BACK, { replace: true }); return; }
      take(x);
    }).catch(setError);
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    const patch = pending.current;
    if (!Object.keys(patch).length) return null;
    pending.current = {};
    const n = ++seq.current;
    setSave('saving');
    try {
      const x = await api('contracts.draft.save', { id, ...patch });
      if (n === seq.current) { take(x); setSave('saved'); }
      return x;
    } catch (e) {
      if (n === seq.current) setSave('error');
      toast(e.message, 'error');
      throw e;
    }
  }, [id, take, toast]);

  // now: save straight away and let the caller see an error (wording edits); otherwise batch for a moment
  const patch = useCallback((p, { now } = {}) => {
    pending.current = merge(pending.current, p);
    setSave('pending');
    clearTimeout(timer.current);
    if (now) return flush();
    timer.current = setTimeout(() => flush().catch(() => {}), 350);
    return Promise.resolve();
  }, [flush]);
  const onAnswer = useCallback((qid, a) => patch({ answers: { [qid]: a } }), [patch]);
  const onAck = useCallback((fid, a) => patch({ acks: { [fid]: a } }), [patch]);
  useEffect(() => () => { clearTimeout(timer.current); if (Object.keys(pending.current).length) api('contracts.draft.save', { id, ...pending.current }).catch(() => {}); }, [id]);

  const onChat = useCallback((chat) => setV((x) => ({ ...x, draft: { ...x.draft, chat } })), []);
  const applyProposal = useCallback(async (p) => {
    try {
      await flush();
      take(await api('contracts.draft.save', { id, ...p.patch, proposal_id: p.id }));
      toast('Applied');
    } catch (e) { toast(e.message, 'error'); }
  }, [id, flush, take, toast]);

  const close = async () => { await flush().catch(() => {}); nav(BACK); };
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && !file && !sending && close();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  });

  const pdf = useDraftPdf(id, rev, wide && !!v);

  const approveAll = async () => {
    setApproving(true);
    try {
      await flush();
      take(await api('contracts.draft.approveAll', { id }));
      toast('Approved for use by your company');
    } catch (e) { toast(e.message, 'error'); } finally { setApproving(false); }
  };

  const jump = (j) => {
    if (!j) return;
    const toLeft = j.slot || j.clause ? 'clauses' : 'guide';
    if (wide) setLeft(toLeft); else setTab(toLeft);
    flash(j.question ? `q-${j.question}` : j.assessment ? 'assessment' : j.slot ? `slot-${j.slot}` : j.clause ? `clause-${j.clause}` : `sec-${j.section}`);
  };

  const shell = (children) => createPortal(
    <div className="anim-fade fixed inset-0 z-50 flex flex-col bg-bg safe-t" role="dialog" aria-modal="true" aria-label="Contract draft">{children}</div>,
    document.body,
  );
  if (error) return shell(<div className="p-6"><ErrorBox error={error} /><Button className="mt-4" variant="secondary" to={BACK}>Back to contracts</Button></div>);
  if (!v) return shell(<Spinner className="flex-1" />);

  const { draft, result, party, pack } = v;
  const counts = Object.fromEntries(['blocker', 'review', 'note'].map((s) => [s, result.findings.filter((f) => f.severity === s && !(s === 'review' && f.ack)).length]));
  const saveWord = { saved: 'All changes saved', pending: 'Editing…', saving: 'Saving…', error: 'Not saved' }[save];
  const notReady = counts.blocker ? `${counts.blocker} blocker${counts.blocker === 1 ? '' : 's'} to clear` : counts.review ? `${counts.review} item${counts.review === 1 ? '' : 's'} to acknowledge` : null;

  const pane = wide ? left : tab;
  const leftPane = pane === 'guide' ? <Guide v={v} onAnswer={onAnswer} onPatch={patch} />
    : pane === 'ai' ? <AskAi v={v} onChat={onChat} onApply={applyProposal} onJump={jump} />
      : <ClauseList v={v} onPatch={patch} onApproveAll={approveAll} approving={approving} />;
  const review = <ReviewList findings={result.findings} onJump={jump} onAck={onAck} />;
  const paper = (
    <DocPaper preview={result.legal} status={result.legal ? undefined : 'draft'}
      doc={{ typeLabel: pack.doc_title, title: draft.title, reference: 'Given when sent', issuedAt: new Date(), officerName: party?.name, blocks: result.blocks }} signers={{ company: null }} />
  );

  return shell(
    <>
      <header className="flex items-center gap-2 border-b border-line bg-surface/90 py-2.5 backdrop-blur-xl safe-x [--px:0.75rem] sm:[--px:1.25rem]">
        <IconButton icon={X} label="Close" onClick={close} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-headline font-bold">{draft.title}</div>
          <div className="truncate text-caption text-muted">{party?.name} · {pack.title} · {JURISDICTIONS[draft.jurisdiction]}</div>
        </div>
        <span className={cx('hidden text-caption sm:inline', save === 'error' ? 'text-red' : 'text-muted')} aria-live="polite">{saveWord}</span>
      </header>

      {!wide && (
        <div className="border-b border-line bg-surface py-2 safe-x [--px:0.75rem]">
          <Segmented full value={tab} onChange={setTab} options={[
            { value: 'guide', label: 'Guide' }, { value: 'clauses', label: 'Clauses' }, { value: 'ai', label: 'AI' }, { value: 'preview', label: 'Preview' },
            { value: 'review', label: counts.blocker + counts.review ? `Review · ${counts.blocker + counts.review}` : 'Review' },
          ]} />
        </div>
      )}

      {wide ? (
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="flex min-h-0 flex-col">
            <div className="px-6 pt-4"><Segmented value={left} onChange={setLeft} options={[{ value: 'guide', label: 'Guide' }, { value: 'clauses', label: 'Clauses' }, { value: 'ai', label: 'Ask AI' }]} /></div>
            <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-4">{leftPane}</div>
          </div>
          <div className="flex min-h-0 flex-col border-l border-line bg-fill-strong/40">
            <div className="flex items-center justify-between gap-2 px-5 pb-2 pt-4 text-footnote text-muted">
              <span className="inline-flex items-center gap-1.5"><Eye size={15} />{result.legal ? 'Preview' : 'Draft pending legal review'}</span>
              {(pdf.loading || save !== 'saved') && <span>Updating…</span>}
            </div>
            <div className="min-h-0 flex-1 px-5">
              {pdf.url
                ? <iframe key={pdf.url} title="Contract preview" src={`${pdf.url}#toolbar=0&view=FitH`} className="h-full w-full rounded-xl border border-line bg-paper" />
                : pdf.error ? <ErrorBox error={{ message: pdf.error }} /> : <Spinner />}
            </div>
            <div className={cx('mt-3 border-t border-line bg-surface', reviewOpen ? 'max-h-[42%]' : '')}>
              <button type="button" onClick={() => setReviewOpen((o) => !o)} className="pressable flex w-full items-center gap-3 px-5 py-2.5 text-left text-subhead font-semibold">
                Review
                {['blocker', 'review', 'note'].map((s) => counts[s] > 0 && <span key={s} className={cx('num text-footnote', SEVERITY[s].text)}>{counts[s]} {SEVERITY[s].one.toLowerCase()}{counts[s] > 1 && s !== 'review' ? 's' : ''}</span>)}
                <ChevronDown size={16} className={cx('ml-auto text-muted transition-transform', reviewOpen && 'rotate-180')} />
              </button>
              {reviewOpen && <div className="max-h-[calc(42dvh-44px)] overflow-y-auto px-5 pb-4">{review}</div>}
            </div>
          </div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pt-4 safe-x [--px:1rem]">
          {['guide', 'clauses', 'ai'].includes(tab) ? leftPane : tab === 'preview' ? <div className="pb-6">{paper}</div> : <div className="pb-6">{review}</div>}
        </div>
      )}

      <footer className="flex flex-wrap items-center gap-2 border-t border-line bg-surface pb-[calc(0.6rem+env(safe-area-inset-bottom))] pt-2.5 safe-x [--px:0.75rem] sm:[--px:1.25rem]">
        <span className={cx('mr-auto min-w-0 text-footnote', notReady ? 'text-muted' : 'font-semibold text-green')}>
          {notReady ? <button type="button" className="underline-offset-2 hover:underline" onClick={() => (wide ? setReviewOpen(true) : setTab('review'))}>{notReady}</button> : 'Ready to send'}
          <span className="text-muted sm:hidden"> · {saveWord}</span>
        </span>
        <Button variant="secondary" icon={FileStack} onClick={() => flush().catch(() => {}).then(() => setFile(true))}>Contract file</Button>
        <Button icon={Send} disabled={!result.ready || save === 'saving'} title={notReady || undefined} onClick={() => flush().then(() => setSending(true)).catch(() => {})}>Approve &amp; send</Button>
      </footer>

      {file && <ContractFile v={v} onClose={() => setFile(false)} />}
      {sending && <SendSheet v={v} onClose={() => setSending(false)} onSent={() => nav('/company/people/contracts', { replace: true })} />}
    </>,
  );
}
