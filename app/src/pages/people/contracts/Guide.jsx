// Guide: the pack's questions by section. Prefilled values wait for the manager to confirm them; nothing prints until confirmed.
import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Scale } from 'lucide-react';
import { Button, cx, date, Input, Segmented, Select, Textarea } from '../../../ui/index.jsx';
import { SOURCE } from './_shared.jsx';

const YESNO = [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }];
const TYPED = new Set(['text', 'textarea', 'money', 'number']);

function shown(qn, v) {
  if (v == null || v === '') return '';
  if (qn.type === 'date') return date(v);
  if (qn.type === 'money') return `£${Number(v).toFixed(2)}`;
  if (qn.type === 'choice') return qn.options?.find((o) => o.value === v)?.label || v;
  if (qn.type === 'yesno') return v === 'yes' ? 'Yes' : 'No';
  return String(v);
}

/** One question. Typed fields keep their own text and save after a pause; choices save at once. */
function Question({ qn, a, onAnswer }) {
  const server = a?.value ?? '';
  const [text, setText] = useState(String(server));
  const focused = useRef(false);
  const timer = useRef(null);
  // Follow the saved value unless the manager is typing in this field
  useEffect(() => { if (!focused.current) setText(String(server)); }, [server]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const commit = (val) => { clearTimeout(timer.current); if (String(val) !== String(server)) onAnswer(qn.id, { value: val === '' ? null : val }); };
  const typed = (val) => { setText(val); clearTimeout(timer.current); timer.current = setTimeout(() => commit(val), 700); };
  const pending = a && !a.confirmed && a.value != null && a.value !== '';
  const label = (
    <span className="inline-flex items-center gap-1.5">
      {qn.label}{qn.required === false && <span className="font-normal text-faint">(optional)</span>}
      {a?.confirmed && <CheckCircle2 size={14} className="text-green" aria-label="Confirmed" />}
    </span>
  );
  const common = {
    label, hint: qn.help,
    onFocus: () => { focused.current = true; }, onBlur: () => { focused.current = false; commit(text); },
  };

  let field;
  if (qn.type === 'note') return <div id={`q-${qn.id}`} className="rounded-2xl bg-bg px-4 py-3 text-footnote text-muted transition-shadow">{qn.help || qn.label}</div>;
  if (qn.type === 'textarea') field = <Textarea {...common} rows={3} value={text} onChange={(e) => typed(e.target.value)} maxLength={4000} />;
  else if (TYPED.has(qn.type)) {
    field = (
      <Input {...common} value={text} onChange={(e) => typed(e.target.value)} maxLength={500}
        inputMode={qn.type === 'money' || qn.type === 'number' ? 'decimal' : undefined} placeholder={qn.type === 'money' ? '£' : qn.placeholder} />
    );
  } else if (qn.type === 'date') {
    field = <Input {...common} type="date" value={text} onChange={(e) => { setText(e.target.value); commit(e.target.value); }} />;
  } else {
    const options = qn.type === 'yesno' ? YESNO : (qn.options || []).map((o) => ({ value: o.value, label: o.label }));
    const short = options.length <= 3 && options.every((o) => o.label.length <= 22);
    field = short ? (
      <div>
        <div className="mb-1.5 text-footnote font-semibold text-muted">{label}</div>
        <Segmented value={server} onChange={(x) => onAnswer(qn.id, { value: x })} options={options} />
        {qn.help && <p className="mt-1.5 text-caption text-faint">{qn.help}</p>}
      </div>
    ) : (
      <Select label={label} hint={qn.help} value={server} placeholder="Choose…" options={options} onChange={(e) => onAnswer(qn.id, { value: e.target.value || null })} />
    );
  }
  return (
    <div id={`q-${qn.id}`} className="rounded-xl transition-shadow">
      {field}
      {pending && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 rounded-xl bg-amber-soft px-3 py-2 text-footnote">
          <span className="min-w-0 flex-1">From {SOURCE[a.source] || 'your records'}: <b>{shown(qn, a.value)}</b>. Not printed until you confirm it.</span>
          <Button size="sm" variant="secondary" onClick={() => onAnswer(qn.id, { confirmed: true })}>Confirm</Button>
        </div>
      )}
    </div>
  );
}

/** Status assessment (self-employed, PSC, labour provider): based on how the work really happens, recorded with a reason */
function Assessment({ pack, draft, result, onPatch }) {
  const a = pack.assessment;
  const s = draft.assessment || {};
  const ans = s.answers || {};
  const [reason, setReason] = useState(s.reason || '');
  useEffect(() => setReason(s.reason || ''), [s.reason]);
  const results = (k) => [...new Set((a.outcomes?.[k] || []).map((o) => o.result))].map((r) => ({ value: r, label: r.replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) }));
  const sug = result.suggested || {};
  return (
    <section id="assessment" className="rounded-2xl bg-surface p-4 shadow-tile transition-shadow">
      <h3 className="flex items-center gap-2 text-headline font-bold"><Scale size={18} className="text-blue" />{a.title || 'Status assessment'}</h3>
      {a.intro && <p className="mt-1 text-footnote text-muted">{a.intro}</p>}
      <div className="mt-3 space-y-4">
        {(a.questions || []).map((qn) => (
          <div key={qn.id}>
            <div className="text-subhead font-semibold">{qn.label}</div>
            {qn.help && <p className="text-caption text-faint">{qn.help}</p>}
            <div className="mt-1.5 flex flex-wrap gap-2">
              {(qn.options || []).map((o) => (
                <button key={o.value} type="button" aria-pressed={ans[qn.id] === o.value} onClick={() => onPatch({ assessment: { answers: { [qn.id]: ans[qn.id] === o.value ? null : o.value } } })}
                  className={cx('pressable min-h-9 rounded-full border px-3.5 py-1.5 text-left text-footnote font-semibold', ans[qn.id] === o.value ? 'border-blue bg-blue text-white' : 'border-line bg-surface')}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 rounded-xl bg-bg p-3 text-footnote">
        {sug.complete
          ? <>The answers suggest <b>{(sug.employment || 'unresolved').replace(/_/g, ' ')}</b> for employment rights and <b>{(sug.tax || 'unresolved').replace(/_/g, ' ')}</b> for tax. The decision and the reason are yours.</>
          : 'Answer every question to see what the answers suggest.'}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Select label="Employment-rights status you recorded" value={s.employment || ''} placeholder="Not decided" options={results('employment')}
          onChange={(e) => onPatch({ assessment: { employment: e.target.value || null } })} />
        <Select label="Tax status you recorded" value={s.tax || ''} placeholder="Not decided" options={results('tax')}
          onChange={(e) => onPatch({ assessment: { tax: e.target.value || null } })} />
      </div>
      <Textarea className="mt-3" label="Reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={2000}
        onBlur={() => reason !== (s.reason || '') && onPatch({ assessment: { reason } })} placeholder="How the work really happens, in a few sentences" />
      {s.assessed_by && <p className="mt-2 text-caption text-faint">Last recorded by {s.assessed_by}</p>}
    </section>
  );
}

export default function Guide({ v, onAnswer, onPatch }) {
  const { pack, draft, result } = v;
  const visible = new Set(result.visible || []);
  const qs = (pack.questions || []).filter((qn) => visible.has(qn.id));
  const sections = (pack.sections || []).map((s) => ({ ...s, qs: qs.filter((qn) => qn.section === s.id) })).filter((s) => s.qs.length);
  const done = (s) => s.qs.filter((qn) => qn.type === 'note' || draft.answers[qn.id]?.confirmed || (qn.required === false && !draft.answers[qn.id])).length;
  return (
    <div className="space-y-4 pb-6">
      <nav className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1" aria-label="Sections">
        {pack.assessment && (
          <button type="button" onClick={() => document.getElementById('assessment')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className="pressable shrink-0 rounded-full border border-line bg-surface px-3 py-1.5 text-caption font-semibold">Assessment</button>
        )}
        {sections.map((s) => {
          const n = done(s);
          return (
            <button key={s.id} type="button" onClick={() => document.getElementById(`sec-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className={cx('pressable shrink-0 rounded-full border px-3 py-1.5 text-caption font-semibold', n === s.qs.length ? 'border-green/30 bg-green-soft text-green' : 'border-line bg-surface')}>
              {s.title} <span className="num">{n}/{s.qs.length}</span>
            </button>
          );
        })}
      </nav>

      <section className="rounded-2xl bg-surface p-4 shadow-tile">
        <h3 className="text-headline font-bold">This document</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <DocField label="Title" value={draft.title} onSave={(x) => onPatch({ title: x })} />
          <DocField label="Takes effect" type="date" value={draft.effective_date || ''} onSave={(x) => onPatch({ effective_date: x || null })}
            hint="Used to check law that comes into force later" />
        </div>
      </section>

      {pack.assessment && <Assessment pack={pack} draft={draft} result={result} onPatch={onPatch} />}

      {sections.map((s) => (
        <section key={s.id} id={`sec-${s.id}`} className="scroll-mt-2 rounded-2xl bg-surface p-4 shadow-tile transition-shadow">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-headline font-bold">{s.title}</h3>
            <span className="num text-footnote text-muted">{done(s)} / {s.qs.length}</span>
          </div>
          {s.intro && <p className="mt-0.5 text-footnote text-muted">{s.intro}</p>}
          <div className="mt-3 space-y-4">
            {s.qs.map((qn) => <Question key={qn.id} qn={qn} a={draft.answers[qn.id]} onAnswer={onAnswer} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

function DocField({ label, value, onSave, type, hint }) {
  const [x, setX] = useState(value);
  useEffect(() => setX(value), [value]);
  return <Input label={label} hint={hint} type={type} value={x} maxLength={200} onChange={(e) => { setX(e.target.value); if (type === 'date') onSave(e.target.value); }} onBlur={() => type !== 'date' && x !== value && onSave(x)} />;
}
