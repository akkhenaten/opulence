// Upload a ready-made contract: a PDF is kept exactly as it is with a signature page added; a Word file is converted
// to wording that can be checked and edited. Then (optionally) the AI checks it, and it is sent to sign or filed as
// already signed on paper.
import { lazy, Suspense, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileCheck2, FileText, FileUp, Send, Sparkles } from 'lucide-react';
import { api, upload } from '../../../api.js';
import { Button, cx, Input, Load, Pill, Segmented, Select, Sheet, Spinner, Textarea, Toggle, useAction, useApi, useConfirm, useToast } from '../../../ui/index.jsx';
import { SETUP_LINK } from '../_esign.jsx';
import { PartyPicker } from './StartSheet.jsx';
import { SEVERITY } from './_shared.jsx';

const PdfPages = lazy(() => import('../../../ui/PdfPages.jsx'));

const STEPS = ['File', 'Who and what', 'Check', 'Send'];
const ENGAGEMENTS = [
  { value: '', label: 'Not recorded' }, { value: 'employee', label: 'Employee' }, { value: 'worker', label: 'Worker (casual / zero hours)' },
  { value: 'self_employed', label: 'Self-employed' }, { value: 'psc', label: 'Through their own company' }, { value: 'agency_worker', label: 'Agency worker' },
  { value: 'labour_provider', label: 'Labour provider' }, { value: 'subcontractor', label: 'Subcontractor' },
];
const PARTIES = [{ value: 'person', label: 'A person' }, { value: 'organisation', label: 'A business' }];
const today = () => new Date().toISOString().slice(0, 10);
const blobUrl = (b64) => URL.createObjectURL(new Blob([Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))], { type: 'application/pdf' }));

function FileStep({ file, onFile }) {
  const [run, busy] = useAction();
  const [over, setOver] = useState(false);
  const take = (f) => {
    if (!f) return;
    if (!/\.(pdf|docx)$/i.test(f.name)) { run(() => Promise.reject(new Error('Upload a PDF or a Word (.docx) file'))).catch(() => {}); return; }
    run(async () => {
      const key = await upload(f, 'contract');
      return { ...(await api('contracts.upload.prepare', { key })), name: f.name };
    }).then(onFile).catch(() => {});
  };
  return (
    <div className="space-y-3">
      <label onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); take(e.dataTransfer.files?.[0]); }}
        className={cx('pressable flex cursor-pointer flex-col items-center gap-2 rounded-2xl border-2 border-dashed px-4 py-10 text-center', over ? 'border-blue bg-blue-soft' : 'border-line bg-bg')}>
        {busy ? <Spinner className="py-0" /> : <FileUp size={28} className="text-blue" />}
        <span className="text-subhead font-semibold">{busy ? 'Reading the file…' : file ? 'Choose a different file' : 'Choose a PDF or Word file'}</span>
        <span className="text-footnote text-muted">Up to 20 MB. A PDF is sent exactly as it is; a Word file is turned into wording you can check.</span>
        <input type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="sr-only" disabled={busy}
          onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }} />
      </label>
      {file && (
        <div className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-tile">
          <FileText size={20} className="shrink-0 text-blue" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-subhead font-semibold">{file.name}</div>
            <div className="text-footnote text-muted">{file.kind === 'pdf' ? `PDF · ${file.pages} page${file.pages === 1 ? '' : 's'} · kept as uploaded` : 'Word · converted to wording'}</div>
          </div>
          <Pill tone="green">Ready</Pill>
        </div>
      )}
    </div>
  );
}

function CheckResult({ r }) {
  return (
    <div className="space-y-3">
      <p className="rounded-2xl bg-bg px-4 py-3 text-subhead">{r.summary}</p>
      {r.particulars.length > 0 && (
        <div>
          <div className="mb-1.5 text-footnote font-semibold text-muted">What it says</div>
          <dl className="grid gap-x-4 gap-y-1.5 rounded-2xl bg-surface p-3 text-footnote shadow-tile sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            {r.particulars.map((p, i) => <div key={i} className="contents"><dt className="text-muted">{p.label}</dt><dd className="font-semibold">{p.value}</dd></div>)}
          </dl>
        </div>
      )}
      {['blocker', 'review', 'note'].map((sev) => {
        const list = r.findings.filter((f) => f.severity === sev);
        if (!list.length) return null;
        const S = SEVERITY[sev];
        return (
          <div key={sev}>
            <div className={cx('mb-1.5 flex items-center gap-1.5 text-footnote font-semibold', S.text)}><S.icon size={15} />{S.label} · {list.length}</div>
            <ul className="space-y-1.5">
              {list.map((f, i) => (
                <li key={i} className={cx('rounded-xl px-3 py-2 text-footnote', S.soft)}>
                  {f.section && <b>{f.section}: </b>}{f.text}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      {!r.findings.length && <p className="text-footnote text-muted">Nothing flagged.</p>}
      <p className="text-caption text-faint">An AI reading, not legal advice. It may miss things; you decide whether to send.</p>
    </div>
  );
}

export default function UploadSheet({ onClose, onDone, officer }) {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [kind, setKind] = useState('person');
  const [party, setParty] = useState(officer || null);
  const [f, setF] = useState({ title: '', engagement_type: '', start_date: '', end_date: '', paper: false, signed_on: today(), signed_name: '', save_template: false });
  const [body, setBody] = useState('');
  const [packId, setPackId] = useState('');
  const [check, setCheck] = useState(null);
  const [signer, setSigner] = useState('');
  const [preview, setPreview] = useState(null);
  const packs = useApi('contracts.packs');
  const signers = useApi('esign.signatories');
  const [run, busy] = useAction();
  const [runCheck, checking] = useAction();
  const confirm = useConfirm();
  const toast = useToast();
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? e.target.value : e });

  const word = file?.kind === 'word';
  const paper = f.paper && !word;
  const sig = signers.data;
  const signerId = signer || sig?.default_signatory_id || sig?.signatories?.[0]?.id || '';
  const who = party ? (kind === 'organisation' ? { organisation_id: party.id } : { officer_id: party.id }) : {};
  const base = () => ({
    key: file.key, title: f.title.trim(), ...who, ...(word ? { body } : {}),
    engagement_type: f.engagement_type || undefined, start_date: f.start_date || undefined, end_date: f.end_date || undefined,
  });

  const onFile = (x) => {
    setFile(x); setCheck(null); setPreview(null);
    if (x.kind === 'word') setBody(x.body);
    if (!f.title) setF((p) => ({ ...p, title: x.name.replace(/\.(pdf|docx)$/i, '').replace(/[_-]+/g, ' ').trim().slice(0, 200) }));
  };

  // Final step: the exact PDF that will be sent
  useEffect(() => {
    if (step !== 3 || paper || !file || !party) return undefined;
    let live = true;
    let url;
    setPreview(null);
    api('contracts.upload.preview', base()).then((r) => { if (live) { url = blobUrl(r.pdf); setPreview({ url }); } })
      .catch((e) => live && setPreview({ error: e.message }));
    return () => { live = false; if (url) URL.revokeObjectURL(url); };
  }, [step, paper]); // eslint-disable-line react-hooks/exhaustive-deps

  const doCheck = () => runCheck(() => api('contracts.upload.check', { key: file.key, pack_id: packId || undefined, ...(word ? { body } : {}) })).then(setCheck).catch(() => {});

  const send = async (link) => {
    const ai_check = check || undefined;
    if (paper) {
      const r = await run(() => api('contracts.upload.fileSigned', { ...base(), signed_on: f.signed_on, signed_name: f.signed_name.trim() || undefined, ai_check }), (x) => `Filed as signed · ${x.reference}`).catch(() => null);
      if (r) { onDone?.(); onClose(); }
      return;
    }
    try {
      const r = await api('contracts.upload.send', { ...base(), signatory_id: signerId || null, save_template: f.save_template, ai_check, link });
      if (r.via === 'link' && !r.emailed) toast(r.warning, 'error');
      else toast(r.via === 'link' ? `Signing link emailed to ${r.email} · ${r.reference}` : `Sent · ${r.reference}`);
      onDone?.(); onClose();
    } catch (e) {
      if (e.data?.needs_link && !link) {
        if (await confirm({ title: `${party.name} has no app login`, body: 'Email them a signing link instead? They sign in the browser without an account.', confirm: 'Email a link' })) send(true);
        return;
      }
      toast(e.message, 'error');
    }
  };

  const canNext = [
    !!file,
    !!party && !!f.title.trim() && (!word || !!body.trim()) && (!paper || !!f.signed_on),
    true,
  ][step];
  const sendLabel = paper ? 'File as signed' : 'Send for signature';

  return (
    <Sheet open onClose={onClose} title={`Upload a contract · ${STEPS[step]}`} size="lg"
      footer={<>
        {step > 0 ? <Button variant="secondary" onClick={() => setStep(step - 1)}>Back</Button> : <Button variant="secondary" onClick={onClose}>Cancel</Button>}
        {step < 3
          ? <Button disabled={!canNext} onClick={() => setStep(step + 1)}>{step === 2 && !check ? 'Skip' : 'Next'}</Button>
          : <Button icon={paper ? FileCheck2 : Send} busy={busy} disabled={!paper && !signerId} onClick={() => send(false)}>{sendLabel}</Button>}
      </>}>
      <div className="mb-4 flex gap-1.5" aria-hidden="true">{STEPS.map((s, i) => <span key={s} className={cx('h-1 flex-1 rounded-full', i <= step ? 'bg-blue' : 'bg-fill-strong')} />)}</div>

      {step === 0 && <FileStep file={file} onFile={onFile} />}

      {step === 1 && (
        <div className="space-y-5">
          {!officer && (
            <section>
              <h3 className="mb-2 text-headline font-bold">Who signs it?</h3>
              <Segmented className="mb-2" value={kind} onChange={(v) => { setKind(v); setParty(null); }} options={PARTIES} />
              <PartyPicker pack={{ party: kind }} value={party} onChange={setParty} />
            </section>
          )}
          <section className="grid gap-3 sm:grid-cols-2">
            <Input label="Title" value={f.title} onChange={set('title')} maxLength={200} className="sm:col-span-2" />
            <Select label="Engagement type" hint="Recorded on the profile once signed" value={f.engagement_type} onChange={set('engagement_type')} options={ENGAGEMENTS} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Starts" hint="Optional" type="date" value={f.start_date} onChange={set('start_date')} />
              <Input label="Ends" hint="Fixed term only" type="date" value={f.end_date} onChange={set('end_date')} />
            </div>
          </section>
          {word && (
            <section>
              <Textarea label="Wording" hint="Converted from Word. Headings start with #, bullets with -, bold is **like this**. Check it reads correctly." rows={12} value={body} onChange={(e) => setBody(e.target.value)} maxLength={100000} />
            </section>
          )}
          {!word && (
            <section className="rounded-2xl bg-bg px-3">
              <Toggle checked={f.paper} onChange={set('paper')} label="Already signed on paper" hint="File the signed scan on their profile. Nothing is sent." />
              {f.paper && (
                <div className="grid gap-3 pb-3 sm:grid-cols-2">
                  <Input label="Signed on" type="date" max={today()} value={f.signed_on} onChange={set('signed_on')} />
                  <Input label="Signed by" hint="Optional" value={f.signed_name} onChange={set('signed_name')} maxLength={120} placeholder={party?.name} />
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-2xl bg-bg p-4">
            <Sparkles size={18} className="mt-0.5 shrink-0 text-blue" />
            <p className="text-footnote text-muted">Optional. Contracts AI reads the document and lists what it says and what looks missing or risky for the type of agreement you pick. It uses the Contracts AI allowance.</p>
          </div>
          <Load q={packs}>
            {(d) => (
              <Select label="Check it as" value={packId} onChange={(e) => setPackId(e.target.value)}
                options={[{ value: '', label: 'A UK contract (general check)' }, ...d.packs.map((p) => ({ value: p.id, label: p.title }))]} />
            )}
          </Load>
          <Button variant={check ? 'secondary' : 'primary'} icon={Sparkles} busy={checking} onClick={doCheck}>{check ? 'Check again' : 'Check with Contracts AI'}</Button>
          {checking && <p className="text-footnote text-muted">Reading the document. Long files take up to a minute.</p>}
          {check && !checking && <CheckResult r={check} />}
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-footnote text-muted">
            <span>{paper ? 'Signed by' : 'To'} <b className="text-ink">{party?.name}</b></span>
            {paper && <span>on <b className="text-ink">{f.signed_on}</b></span>}
            {check && <span>AI check: {check.findings.filter((x) => x.severity === 'blocker').length} blockers, {check.findings.filter((x) => x.severity === 'review').length} to review</span>}
          </div>
          {paper ? (
            <p className="rounded-2xl bg-bg px-4 py-3 text-subhead">The scan is stored as the signed contract{kind === 'person' ? ` on ${party?.name}'s profile` : ''}, marked "Signed on paper". {f.engagement_type ? 'The engagement type is recorded.' : ''}</p>
          ) : (
            <>
              <Load q={signers}>
                {(d) => (d.signatories.length ? (
                  <Select label="Signs for the company" value={signerId} onChange={(e) => setSigner(e.target.value)}
                    options={d.signatories.map((s) => ({ value: s.id, label: `${s.name}${s.title ? ` · ${s.title}` : ''}${s.id === d.default_signatory_id ? ' (default)' : ''}` }))} />
                ) : (
                  <div className="rounded-2xl bg-amber-soft px-4 py-3 text-subhead">
                    <div className="font-semibold">A saved company signature is needed</div>
                    <Link to={SETUP_LINK} onClick={onClose} className="mt-2 inline-flex font-semibold text-blue">Set up your signature →</Link>
                  </div>
                ))}
              </Load>
              <div className="rounded-2xl bg-bg px-3">
                <Toggle checked={f.save_template} onChange={set('save_template')} label="Save as a reusable template" hint="Send it to others later from Send a template" />
              </div>
              <div>
                <div className="mb-1.5 text-footnote font-semibold text-muted">What they will sign</div>
                {!preview ? <Spinner /> : preview.error
                  ? <p className="rounded-2xl bg-red-soft px-4 py-3 text-footnote">{preview.error}</p>
                  : <Suspense fallback={<Spinner />}><PdfPages src={preview.url} /></Suspense>}
              </div>
            </>
          )}
        </div>
      )}
    </Sheet>
  );
}
