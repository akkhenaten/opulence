// Manager side of signed documents: your saved signature, the template editor with live preview,
// the send sheet, status pills and the contract viewer
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  Bell, Bold, ChevronDown, Eraser, Eye, FileSignature, FileText, Heading, History, List as ListIcon, PenLine, Plus, ScrollText, Send, SeparatorHorizontal, TrendingUp, X,
} from 'lucide-react';
import { api, downloadAction } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Button, Check, cx, date, dateTime, Empty, IconButton, Input, List, Load, Pill, Row, SearchInput, Section, Segmented, Select, Sheet, Spinner, Tile, Toggle,
  useAction, useApi, useConfirm, useScrollLock, useToast,
} from '../../ui/index.jsx';
import { SignaturePad } from '../../ui/SignaturePad.jsx';
import { DocPaper } from '../../ui/DocPaper.jsx';

const PdfPages = lazy(() => import('../../ui/PdfPages.jsx'));

export const SETUP_LINK = '/company/settings?tab=templates';
const CATS = [
  { value: 'contract', label: 'Contracts', one: 'Contract', icon: FileSignature },
  { value: 'policy', label: 'Policies', one: 'Policy', icon: ScrollText },
  { value: 'pay_rise', label: 'Pay rise', one: 'Pay rise agreement', icon: TrendingUp },
];
const CAT = Object.fromEntries(CATS.map((c) => [c.value, c]));

/** Status pill for a contract, policy or pay rise row */
export function docStatus(r) {
  if (r.status === 'sent') return r.opened_at ? ['Opened', 'blue'] : ['Awaiting', 'amber'];
  return {
    signed: ['Signed', 'green'], applied: ['In effect', 'green'], void: ['Void', 'grey'], superseded: ['Replaced', 'grey'], draft: ['Draft', 'grey'], signed_paper: ['Signed on paper', 'green'],
  }[r.status] || [r.status, 'grey'];
}
export const DocPill = ({ r }) => { const [l, t] = docStatus(r); return <Pill tone={t}>{l}</Pill>; };

/** One-tap nudge for a document waiting for a signature */
export function RemindButton({ type, r, onDone }) {
  const [run, busy] = useAction();
  if (r.status !== 'sent') return null;
  const recent = r.last_reminded_at && Date.now() - new Date(r.last_reminded_at) < 3600e3;
  return (
    <Button size="sm" variant="ghost" icon={Bell} busy={busy} disabled={recent} title={recent ? 'A reminder went out in the last hour' : undefined}
      onClick={() => run(() => api('esign.remind', { type, id: r.id }), 'Reminder sent').then(onDone).catch(() => {})}>
      {recent ? 'Reminded' : 'Remind'}
    </Button>
  );
}

/* ---------------- Your signature + default signatory ---------------- */

export function SigningTile() {
  const mine = useApi('esign.mySignature.get');
  const list = useApi('esign.signatories');
  const [editing, setEditing] = useState(false);
  const [run] = useAction();
  const confirm = useConfirm();
  const reload = () => { mine.reload(); list.reload(); };
  const remove = async () => {
    if (!(await confirm({ title: 'Remove your saved signature?', body: 'Documents already sent keep it. New documents need another manager\'s signature.', confirm: 'Remove', danger: true }))) return;
    await run(() => api('esign.mySignature.remove'), 'Signature removed');
    reload();
  };
  const setDefault = (id) => run(() => api('settings.update', { default_signatory_id: id || null }), 'Default signatory saved').then(list.reload).catch(() => {});
  const sig = mine.data?.signature;
  return (
    <div className="mb-6 grid gap-4 lg:grid-cols-2">
      <Tile title="Your signature" icon={PenLine}>
        <Load q={mine}>
          {() => (sig && !editing ? (
            <div>
              <div className="bg-paper grid h-28 place-items-center rounded-2xl border border-line p-3"><img src={sig.png} alt="Your saved signature" className="max-h-full max-w-full object-contain" /></div>
              <div className="mt-2 text-subhead font-semibold">{sig.name}</div>
              <div className="text-footnote text-muted">{[sig.title, `saved ${date(sig.updated_at)}`].filter(Boolean).join(' · ')}</div>
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" icon={PenLine} onClick={() => setEditing(true)}>Draw again</Button>
                <Button size="sm" variant="danger" onClick={remove}>Remove</Button>
              </div>
            </div>
          ) : <SignatureForm sig={sig} onCancel={sig ? () => setEditing(false) : null} onSaved={() => { setEditing(false); reload(); }} />)}
        </Load>
        <p className="mt-3 text-caption text-faint">Signs for the company when you send a contract, policy or pay rise. It is copied onto each document when it is sent.</p>
      </Tile>
      <Tile title="Default company signatory" icon={FileSignature} id="signatory" className="scroll-mt-20">
        <Load q={list}>
          {(d) => (d.signatories.length ? (
            <>
              <Select label="Signs when nobody else is chosen" value={d.default_signatory_id || ''} onChange={(e) => setDefault(e.target.value)}
                placeholder="Whoever sends the document" options={d.signatories.map((s) => ({ value: s.id, label: `${s.name}${s.title ? ` · ${s.title}` : ''}` }))} />
              <p className="mt-2 text-footnote text-muted">{d.signatories.length} manager{d.signatories.length === 1 ? ' has' : 's have'} a saved signature. Automatic re-sends of a policy use this person.</p>
            </>
          ) : <p className="text-subhead text-muted">No manager has saved a signature yet. Save yours to start sending documents.</p>)}
        </Load>
      </Tile>
    </div>
  );
}

function SignatureForm({ sig, onCancel, onSaved }) {
  const { user } = useAuth();
  const [name, setName] = useState(sig?.name || user?.name || '');
  const [title, setTitle] = useState(sig?.title || '');
  const [ink, setInk] = useState(false);
  const pad = useRef(null);
  const [run, busy] = useAction();
  const save = () => run(() => api('esign.mySignature.save', { name: name.trim(), title: title.trim(), png: pad.current?.toDataURL() }), 'Signature saved').then(onSaved).catch(() => {});
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Name as signed" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        <Input label="Job title" placeholder="e.g. Operations Manager" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-footnote font-semibold text-muted">Draw your signature</span>
        <Button variant="ghost" size="sm" icon={Eraser} disabled={!ink} onClick={() => pad.current?.clear()}>Clear</Button>
      </div>
      <SignaturePad handle={pad} onInk={setInk} max={280000} />
      <div className="flex justify-end gap-2">
        {onCancel && <Button variant="secondary" onClick={onCancel}>Cancel</Button>}
        <Button busy={busy} disabled={!ink || name.trim().length < 2} onClick={save}>Save signature</Button>
      </div>
    </div>
  );
}

/* ---------------- Templates ---------------- */

export function TemplatesTab() {
  const q = useApi('contracts.templates');
  const [editing, setEditing] = useState(null);
  // Set-up and the send sheet link here with focus=signatory
  const focus = new URLSearchParams(window.location.search).get('focus');
  useEffect(() => {
    if (focus !== 'signatory') return;
    const t = setTimeout(() => document.getElementById('signatory')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
    return () => clearTimeout(t);
  }, [focus]);
  return (
    <>
      <SigningTile />
      <Load q={q}>
        {(rows) => (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div className="max-w-xl">
                <p className="text-subhead text-muted">Wording for contracts, policies and pay rises sent for e-signature. Signed documents always keep the version they were signed on.</p>
                <Button size="sm" variant="link" to="/company/people/contracts">Issued contracts →</Button>
              </div>
              <Button icon={Plus} onClick={() => setEditing({ category: 'contract' })}>New template</Button>
            </div>
            {CATS.map((c) => {
              const list = rows.filter((t) => t.category === c.value);
              if (!list.length && c.value === 'pay_rise') return null;
              return (
                <Section key={c.value} title={c.label} icon={c.icon} count={list.length} action={c.value === 'policy' && <Button size="sm" variant="ghost" icon={Plus} onClick={() => setEditing({ category: 'policy' })}>New policy</Button>}>
                  {list.length ? (
                    <List>
                      {list.map((t) => (
                        <Row key={t.id} onClick={() => setEditing(t)} chevron left={<c.icon size={20} className="text-blue" />}
                          title={t.title}
                          subtitle={[`v${t.version}`, `updated ${date(t.updated_at)}`, c.value === 'policy' && t.asked ? `${t.signed} / ${t.asked} signed` : null, t.on_older ? `${t.on_older} on an older version` : null].filter(Boolean).join(' · ')}
                          right={t.system ? <Pill tone="blue">Always on</Pill> : t.active ? <Pill tone="green">Active</Pill> : <Pill tone="grey">Archived</Pill>} />
                      ))}
                    </List>
                  ) : <Empty icon={c.icon} title={`No ${c.label.toLowerCase()} yet`} body={c.value === 'policy' ? 'Policies are sent to many officers at once and each one signs to say they have read it.' : undefined} />}
                </Section>
              );
            })}
            {editing && <TemplateEditor t={editing} onClose={() => setEditing(null)} onDone={q.reload} />}
          </>
        )}
      </Load>
    </>
  );
}

// Wrap the selection, or insert at the cursor, keeping focus in the textarea
export function edit(ta, set, fn) {
  const { selectionStart: a, selectionEnd: b, value } = ta;
  const [text, caret] = fn(value.slice(0, a), value.slice(a, b), value.slice(b));
  set(text);
  requestAnimationFrame(() => { ta.focus(); ta.setSelectionRange(caret, caret); });
}
export const lineStart = (pre) => (pre && !pre.endsWith('\n') ? '\n' : '');

/** Lazy debounced preview: blocks for phones, the real PDF for wide screens */
function usePreview(input, wide) {
  const [out, setOut] = useState({ loading: true });
  const key = JSON.stringify(input);
  useEffect(() => {
    let live = true;
    setOut((o) => ({ ...o, loading: true }));
    const t = setTimeout(async () => {
      try {
        const r = await api('esign.preview', { ...input, blocks_only: !wide });
        if (!live) return;
        const url = r.pdf ? URL.createObjectURL(new Blob([Uint8Array.from(atob(r.pdf), (ch) => ch.charCodeAt(0))], { type: 'application/pdf' })) : null;
        setOut((o) => { if (o.url) URL.revokeObjectURL(o.url); return { ...r, url, loading: false }; });
      } catch (e) {
        if (live) setOut((o) => ({ ...o, loading: false, error: e.message }));
      }
    }, 600);
    return () => { live = false; clearTimeout(t); };
  }, [key, wide]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => out.url && URL.revokeObjectURL(out.url), []); // eslint-disable-line react-hooks/exhaustive-deps
  return out;
}

export const useWide = () => {
  const m = typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)');
  const [wide, setWide] = useState(!!m?.matches);
  useEffect(() => {
    if (!m) return undefined;
    const f = () => setWide(m.matches);
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return wide;
};

function TemplateEditor({ t, onClose, onDone }) {
  const isNew = !t.id;
  const [category, setCategory] = useState(t.category || 'contract');
  const [title, setTitle] = useState(t.title || '');
  const [body, setBody] = useState(t.body || '');
  const [active, setActive] = useState(t.active !== false);
  const [view, setView] = useState('write');
  const [history, setHistory] = useState(false);
  const ph = useApi('esign.placeholders');
  const wide = useWide();
  const ta = useRef(null);
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const toast = useToast();
  useScrollLock(true);
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);

  const showPreview = wide || view === 'preview';
  const pv = usePreview({ category, title, body, version: isNew ? 1 : t.version + (title !== t.title || body !== t.body ? 1 : 0) }, wide);
  const changed = isNew || title !== t.title || body !== t.body || active !== (t.active !== false);
  const wording = !isNew && (title !== t.title || body !== t.body);

  const tool = (kind) => edit(ta.current, setBody, (pre, sel, post) => {
    if (kind === 'bold') { const s = sel || 'bold text'; return [`${pre}**${s}**${post}`, pre.length + s.length + 4]; }
    if (kind === 'page') { const s = `${lineStart(pre)}\n---page---\n\n`; return [pre + s + post, pre.length + s.length]; }
    const mark = kind === 'heading' ? '# ' : '- ';
    const s = `${lineStart(pre)}${kind === 'heading' ? '\n' : ''}${mark}${sel || (kind === 'heading' ? 'Heading' : '')}`;
    return [pre + s + post, pre.length + s.length];
  });
  const insert = (key) => key && edit(ta.current, setBody, (pre, _s, post) => [`${pre}{{${key}}}${post}`, pre.length + key.length + 4]);

  const save = async () => {
    let resign = false;
    if (wording && category === 'policy' && t.asked > 0) {
      resign = await confirm({
        title: 'Ask everyone to sign the new version?',
        body: `${t.asked} officer${t.asked === 1 ? ' has' : 's have'} this policy. Re-signing replaces their current copy with v${t.version + 1} and sends it to each of them. Keeping signatures leaves their signed copy as it is; only new sends get v${t.version + 1}.`,
        confirm: 'Ask everyone to re-sign', cancel: 'Keep existing signatures',
      });
    }
    const r = await run(() => api('contracts.saveTemplate', { id: t.id, category, title: title.trim(), body, active, resign }),
      (x) => (x.resent ? `Saved as v${x.version}. Sent to ${x.resent} officer${x.resent === 1 ? '' : 's'} to re-sign.` : wording || isNew ? `Saved as v${x.version}` : 'Template saved'))
      .catch((e) => { if (e.data?.setup) toast('Save your signature at the top of this page first', 'error'); return null; });
    if (!r) return;
    onDone();
    onClose();
  };

  const placeholders = (ph.data || []).filter((p) => category === 'pay_rise' || !['rate', 'current_rate', 'conditions'].includes(p.key));
  const typeLabel = { contract: 'Contract', policy: 'Policy', pay_rise: 'Pay rise agreement' }[category];

  return createPortal(
    <div className="anim-fade fixed inset-0 z-50 flex flex-col bg-bg safe-t" role="dialog" aria-modal="true" aria-label={isNew ? 'New template' : `Edit ${t.title}`}>
      <header className="flex items-center gap-2 border-b border-line bg-surface/90 px-3 py-2.5 backdrop-blur-xl safe-x sm:px-5">
        <IconButton icon={X} label="Close" onClick={onClose} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-headline font-bold">{isNew ? `New ${CAT[category].one.toLowerCase()}` : t.title}</div>
          <div className="text-caption text-muted">{isNew ? 'Version 1' : `Version ${t.version}${wording ? ` → saving makes v${t.version + 1}` : ''}`}</div>
        </div>
        {!wide && <Segmented value={view} onChange={setView} options={[{ value: 'write', label: 'Write', icon: PenLine }, { value: 'preview', label: 'Preview', icon: Eye }]} iconOnly="phone" />}
        <Button busy={busy} disabled={!title.trim() || !body.trim() || !changed || pv.unknown?.length > 0} onClick={save}>Save</Button>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className={cx('min-h-0 flex-col overflow-y-auto px-4 py-4 safe-x sm:px-6', showPreview && !wide ? 'hidden' : 'flex')}>
          {isNew && (
            <Segmented className="mb-3" value={category} onChange={setCategory} options={CATS.filter((c) => c.value !== 'pay_rise').map((c) => ({ value: c.value, label: c.one, icon: c.icon }))} />
          )}
          <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={category === 'policy' ? 'e.g. Health and safety policy' : 'e.g. Contractor agreement'} maxLength={200} />

          <div className="sticky top-0 z-10 -mx-1 mt-4 flex flex-wrap items-center gap-1 rounded-xl border border-line bg-surface p-1 shadow-sm">
            <Button size="sm" variant="ghost" icon={Heading} onClick={() => tool('heading')} title="Numbered section heading">Heading</Button>
            <IconButton size="sm" icon={Bold} label="Bold" onClick={() => tool('bold')} />
            <IconButton size="sm" icon={ListIcon} label="Bullet point" onClick={() => tool('bullet')} />
            <IconButton size="sm" icon={SeparatorHorizontal} label="New page" onClick={() => tool('page')} />
            <span className="mx-1 h-6 w-px bg-line" />
            <label className="relative">
              <span className="sr-only">Insert a field</span>
              <select value="" onChange={(e) => insert(e.target.value)}
                className="h-9 appearance-none rounded-lg bg-blue-soft pl-3 pr-8 text-footnote font-semibold text-blue outline-none focus:ring-2 focus:ring-blue/30">
                <option value="">Insert field…</option>
                {placeholders.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              </select>
              <ChevronDown size={14} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-blue" />
            </label>
          </div>

          <textarea ref={ta} value={body} onChange={(e) => setBody(e.target.value)} spellCheck
            aria-label="Wording" placeholder={'# Engagement\nThe Contractor will provide security services to {{company}}…\n\n# Fees\n- Paid weekly in arrears'}
            className="mt-2 min-h-[50dvh] w-full flex-1 resize-none rounded-xl border border-line bg-surface p-4 font-mono text-subhead leading-relaxed outline-none transition focus:border-blue focus:ring-4 focus:ring-blue/10" />

          {pv.unknown?.length > 0 && (
            <div className="mt-2 rounded-xl bg-red-soft px-3.5 py-2.5 text-footnote text-red" role="alert">
              {pv.unknown.map((k) => `{{${k}}}`).join(', ')} {pv.unknown.length === 1 ? "isn't a field the app knows" : "aren't fields the app knows"}. Use <b>Insert field</b> to pick one.
            </div>
          )}
          <p className="mt-2 text-caption text-faint"># Heading makes numbered sections (1, 1.1, 1.2…). - starts a bullet. **text** is bold. Fields in {'{{ }}'} are filled for each officer when sent.</p>

          {!isNew && !t.system && <div className="mt-3 rounded-2xl bg-surface px-3"><Toggle checked={active} onChange={setActive} label="Active" hint="Archived templates can't be sent" /></div>}

          {!isNew && t.versions?.length > 0 && (
            <div className="mt-3 rounded-2xl bg-surface">
              <button type="button" onClick={() => setHistory((h) => !h)} className="pressable flex w-full items-center gap-2 px-4 py-3 text-left text-subhead font-semibold">
                <History size={17} className="text-muted" />Version history<span className="text-muted">({t.versions.length})</span>
                <ChevronDown size={16} className={cx('ml-auto text-muted transition-transform', history && 'rotate-180')} />
              </button>
              {history && (
                <ul className="divide-y divide-sep border-t border-sep">
                  {t.versions.map((v) => (
                    <li key={v.version} className="flex items-center gap-3 px-4 py-2.5">
                      <span className="num w-9 text-footnote font-bold">v{v.version}</span>
                      <div className="min-w-0 flex-1 text-footnote">
                        <div className="truncate font-semibold">{v.title}</div>
                        <div className="text-muted">{dateTime(v.created_at)}{v.created_by_name ? ` · ${v.created_by_name}` : ''}</div>
                      </div>
                      {v.version === t.version
                        ? <Pill tone="green">Current</Pill>
                        : <Button size="sm" variant="ghost" onClick={() => { setTitle(v.title); setBody(v.body); }}>Use this wording</Button>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {showPreview && (
          <div className="relative min-h-0 overflow-y-auto border-line bg-fill-strong/40 p-3 safe-x sm:p-5 lg:border-l">
            <div className="mb-2 flex items-center justify-between gap-2 text-footnote text-muted">
              <span className="inline-flex items-center gap-1.5"><Eye size={15} />Preview with sample details</span>
              {pv.loading && <span>Updating…</span>}
            </div>
            {wide
              ? (pv.url
                ? <iframe key={pv.url} title="PDF preview" src={`${pv.url}#toolbar=0&view=FitH`} className="h-[calc(100%-28px)] min-h-[60dvh] w-full rounded-xl border border-line bg-paper" />
                : <Spinner />)
              : (pv.blocks
                ? <DocPaper preview doc={{ typeLabel, title: title || 'Untitled', reference: 'PREVIEW', issuedAt: new Date(), version: isNew ? 1 : t.version, officerName: pv.values?.officer, blocks: pv.blocks, ack: category === 'policy' ? 'I have read and understood this policy and agree to follow it.' : null }}
                    signers={{ company: null }} />
                : <Spinner />)}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/* ---------------- Send ---------------- */

/** Send a contract to one officer, or a policy to several; `o` fixes the officer (profile tab) */
export function SendDocSheet({ o: given, onClose, onDone }) {
  const tpl = useApi('contracts.templates');
  const signers = useApi('esign.signatories');
  const officers = useApi('officers.list', { status: 'active' }, { skip: !!given });
  const ph = useApi('esign.placeholders');
  const [step, setStep] = useState(0);
  const [tplId, setTplId] = useState('');
  const [picked, setPicked] = useState(given ? [given.id] : []);
  const [all, setAll] = useState(false);
  const [find, setFind] = useState('');
  const [values, setValues] = useState({});
  const [signer, setSigner] = useState('');
  const [check, setCheck] = useState(null);
  const [run, busy] = useAction();

  const sendable = (tpl.data || []).filter((t) => t.active && t.category !== 'pay_rise');
  const t = sendable.find((x) => x.id === tplId) || null;
  const policy = t?.category === 'policy';
  const roster = officers.data || [];
  const ids = all ? roster.map((x) => x.id) : picked;
  const first = given || roster.find((x) => x.id === ids[0]);
  const sig = signers.data;
  const signerId = signer || sig?.default_signatory_id || sig?.signatories[0]?.id || '';
  const signerRow = sig?.signatories.find((s) => s.id === signerId);

  // A contract goes to one officer: keep only the first pick when switching from a policy
  useEffect(() => { if (t && !policy) { setAll(false); setPicked((p) => p.slice(0, 1)); } }, [t, policy]);

  // Details step: which fields are filled from the officer's record and which still need a value
  useEffect(() => {
    if (step < 1 || !t || !first) return undefined;
    let live = true;
    const h = setTimeout(() => api('esign.preview', { category: t.category, title: t.title, body: t.body, officer_id: first.id, values, signatory_id: signerId || null, version: t.version, blocks_only: true })
      .then((r) => live && setCheck(r)).catch(() => {}), 300);
    return () => { live = false; clearTimeout(h); };
  }, [step, t?.id, first?.id, JSON.stringify(values), signerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = (k) => (ph.data || []).find((p) => p.key === k)?.label || k;
  const asked = useMemo(() => Object.keys(values), [values]);
  const fields = [...new Set([...(check?.missing || []), ...asked])].filter((k) => !['signatory', 'signatory_title'].includes(k));
  const stillMissing = (check?.missing || []).filter((k) => !['signatory', 'signatory_title'].includes(k));

  const send = async () => {
    const r = await run(() => api('contracts.send', {
      template_id: t.id, ...(all ? { all_active: true } : { officer_ids: ids }), values, signatory_id: signerId || null,
    }), (x) => (x.sent ? `Sent to ${x.sent} officers` : `Sent · ${x.reference}`)).catch((e) => { if (e.data?.setup) setStep(1); return null; });
    if (!r) return;
    onDone();
    onClose();
  };

  const STEP_TITLES = ['Who and what', 'Details', 'Check and send'];
  const canNext = step === 0 ? !!t && ids.length > 0 : step === 1 ? !!signerRow : true;
  const shown = roster.filter((x) => !find || `${x.first_name} ${x.last_name}`.toLowerCase().includes(find.toLowerCase()));

  return (
    <Sheet open onClose={onClose} title={`Send ${t ? CAT[t.category].one.toLowerCase() : 'for signature'} · ${STEP_TITLES[step]}`} size="lg"
      footer={<>
        {step > 0 ? <Button variant="secondary" onClick={() => setStep(step - 1)}>Back</Button> : <Button variant="secondary" onClick={onClose}>Cancel</Button>}
        {step < 2
          ? <Button disabled={!canNext} onClick={() => setStep(step + 1)}>Next</Button>
          : <Button icon={Send} busy={busy} onClick={send}>{ids.length > 1 ? `Send to ${ids.length} officers` : 'Send for signature'}</Button>}
      </>}>
      <div className="mb-4 flex gap-1.5" aria-hidden="true">{STEP_TITLES.map((s, i) => <span key={s} className={cx('h-1 flex-1 rounded-full', i <= step ? 'bg-blue' : 'bg-fill-strong')} />)}</div>
      <Load q={tpl}>
        {() => (!sendable.length ? <Empty title="No active templates" body="Add one in Settings → Templates." /> : (
          <>
            {step === 0 && (
              <div className="space-y-4">
                <div>
                  <div className="mb-1.5 text-footnote font-semibold text-muted">Document</div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {sendable.map((x) => {
                      const Icon = CAT[x.category].icon;
                      return (
                        <button key={x.id} type="button" onClick={() => setTplId(x.id)} aria-pressed={x.id === tplId}
                          className={cx('pressable flex items-start gap-3 rounded-2xl border p-3 text-left', x.id === tplId ? 'border-blue bg-blue-soft ring-2 ring-blue/15' : 'border-line bg-surface')}>
                          <Icon size={20} className="mt-0.5 shrink-0 text-blue" />
                          <span className="min-w-0">
                            <span className="block truncate text-subhead font-semibold">{x.title}</span>
                            <span className="block text-caption text-muted">{CAT[x.category].one} · v{x.version}</span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
                {!given && t && (
                  <div>
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-footnote font-semibold text-muted">{policy ? 'Officers' : 'Officer'}</span>
                      {policy && <span className="num text-footnote text-muted">{ids.length} chosen</span>}
                    </div>
                    {policy && <div className="mb-2 rounded-2xl bg-bg px-3"><Toggle checked={all} onChange={setAll} label={`All active officers (${roster.length})`} /></div>}
                    {!all && (
                      <Load q={officers}>
                        {() => (
                          <>
                            <SearchInput value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find an officer" />
                            <List className="mt-2 max-h-72 overflow-y-auto">
                              {shown.map((x) => {
                                const on = picked.includes(x.id);
                                const pick = () => setPicked(policy ? (on ? picked.filter((p) => p !== x.id) : [...picked, x.id]) : [x.id]);
                                return (
                                  <Row key={x.id} onClick={pick} title={`${x.first_name} ${x.last_name}`} subtitle={x.user_id ? null : 'No app login yet'}
                                    left={<Check checked={on} onChange={pick} round={!policy} label={`${x.first_name} ${x.last_name}`} />} />
                                );
                              })}
                            </List>
                          </>
                        )}
                      </Load>
                    )}
                  </div>
                )}
                {given && <p className="text-footnote text-muted">To {given.first_name} {given.last_name}{given.user_id ? '' : ' (they can sign once they have an app login)'}.</p>}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <div className="mb-1.5 text-footnote font-semibold text-muted">Details for this document</div>
                  {!check ? <Spinner className="py-6" /> : fields.length ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {fields.map((k) => (
                        <Input key={k} label={label(k)} value={values[k] ?? ''} onChange={(e) => setValues({ ...values, [k]: e.target.value })}
                          error={stillMissing.includes(k) ? 'Missing — prints as a blank line' : null} />
                      ))}
                    </div>
                  ) : <p className="rounded-2xl bg-bg px-4 py-3 text-subhead text-muted">Everything is filled from {ids.length > 1 ? "each officer's" : `${first?.first_name}'s`} record.</p>}
                  {ids.length > 1 && fields.length > 0 && <p className="mt-2 text-caption text-faint">Checked against {first?.first_name} {first?.last_name}. Values you type here are used for everyone.</p>}
                </div>
                <div>
                  <div className="mb-1.5 text-footnote font-semibold text-muted">Signs for the company</div>
                  <Load q={signers}>
                    {(d) => (d.signatories.length ? (
                      <Select value={signerId} onChange={(e) => setSigner(e.target.value)}
                        options={d.signatories.map((s) => ({ value: s.id, label: `${s.name}${s.title ? ` · ${s.title}` : ''}${s.id === d.default_signatory_id ? ' (default)' : ''}` }))} />
                    ) : null)}
                  </Load>
                  {signers.data?.signatories.length > 0 && !signers.data.default_signatory_id && (
                    <p className="mt-1.5 text-footnote text-muted">No default signatory is set, so the person chosen here signs.{' '}
                      <Link to={`${SETUP_LINK}&focus=signatory`} onClick={onClose} className="font-semibold text-blue">Set a default →</Link></p>
                  )}
                  <Load q={signers}>
                    {(d) => (d.signatories.length ? null : (
                      <div className="rounded-2xl bg-amber-soft px-4 py-3 text-subhead">
                        <div className="font-semibold">A saved company signature is needed</div>
                        <p className="mt-0.5 text-muted">Draw yours once and it is added to every document you send.</p>
                        <Link to={SETUP_LINK} onClick={onClose} className="mt-2 inline-flex font-semibold text-blue">Set up your signature →</Link>
                      </div>
                    ))}
                  </Load>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-footnote text-muted">
                  <span>To <b className="text-ink">{ids.length > 1 ? `${ids.length} officers` : `${first?.first_name} ${first?.last_name}`}</b></span>
                  <span>Signed for the company by <b className="text-ink">{signerRow?.name}</b></span>
                  {stillMissing.length > 0 && <span className="text-amber">{stillMissing.length} blank field{stillMissing.length === 1 ? '' : 's'}</span>}
                </div>
                {!check ? <Spinner /> : (
                  <DocPaper preview doc={{
                    typeLabel: CAT[t.category].one, title: t.title, reference: 'Given when sent', issuedAt: new Date(), version: t.version,
                    officerName: check.values?.officer, blocks: check.blocks, ack: policy ? 'I have read and understood this policy and agree to follow it.' : null,
                  }} signers={{ company: signerRow ? { name: signerRow.name, title: signerRow.title, png: signerRow.png } : null }} />
                )}
                <p className="text-footnote text-muted">{ids.length > 1 ? 'Each officer' : first?.first_name} gets a notification and an email, reads it on their phone and signs. Unsigned documents get a reminder after 3 and 7 days.</p>
              </div>
            )}
          </>
        ))}
      </Load>
    </Sheet>
  );
}

/* ---------------- Viewer ---------------- */

const EVENT = {
  sent: 'Sent', emailed: 'Emailed', opened: 'Opened', signed: 'Signed', sealed: 'Sealed', reminded: 'Reminder sent', voided: 'Voided', superseded: 'Replaced by a new version',
  link: 'Signing link emailed', filed: 'Filed as signed on paper',
};

/** Signing by email link: who it went to, and a fresh link (optionally to a corrected address) */
function LinkPanel({ x, onDone }) {
  const links = useApi('contracts.links', { id: x.id });
  const [email, setEmail] = useState('');
  const [run, busy] = useAction();
  const last = links.data?.[0];
  const resend = () => run(() => api('contracts.link.resend', { id: x.id, email: email.trim() || undefined }), (r) => `New signing link emailed to ${r.email}`)
    .then(() => { setEmail(''); links.reload(); onDone(); }).catch(() => {});
  return (
    <div className="rounded-2xl bg-bg p-4">
      <div className="mb-1 text-footnote font-semibold uppercase tracking-wide text-muted">Signing link</div>
      {last ? (
        <p className="text-footnote">
          Sent to <span className="font-semibold">{last.email}</span> · {last.state === 'active' ? `works until ${date(last.expires_at)}` : last.state}
        </p>
      ) : <p className="text-footnote text-muted">No link sent yet.</p>}
      {x.status === 'sent' && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
          <Input className="flex-1" label="Send to a different address (optional)" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={last?.email || x.party?.signatory_email || ''} />
          <Button variant="secondary" icon={Send} busy={busy} onClick={resend}>Resend link</Button>
        </div>
      )}
      {x.status === 'sent' && <p className="mt-2 text-caption text-muted">A new link replaces the old one, which stops working.</p>}
    </div>
  );
}

export function Timeline({ events }) {
  if (!events?.length) return null;
  return (
    <ol className="space-y-2.5">
      {events.map((e, i) => (
        <li key={i} className="flex gap-3 text-footnote">
          <span className={cx('mt-1.5 h-2 w-2 shrink-0 rounded-full', e.kind === 'signed' || e.kind === 'sealed' ? 'bg-green' : e.kind === 'voided' ? 'bg-red' : 'bg-blue')} />
          <div className="min-w-0">
            <span className="font-semibold">{EVENT[e.kind] || e.kind}</span>
            {e.actor_name && <span className="text-muted"> · {e.actor_name}</span>}
            <div className="text-muted">{dateTime(e.at)}{e.ip ? ` · ${e.ip}` : ''}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function ContractView({ id, onClose }) {
  const q = useApi('contracts.get', { id });
  const [run, busy] = useAction();
  const c = q.data;
  return (
    <Sheet open onClose={onClose} title={c ? `${c.title}` : 'Document'} size="lg"
      footer={c && <><span className="mr-auto num text-footnote text-muted">{c.reference}</span><Button variant="secondary" icon={FileText} busy={busy} onClick={() => run(() => downloadAction('contracts.pdf', { id })).catch(() => {})}>PDF</Button></>}>
      <Load q={q}>
        {(x) => (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2"><DocPill r={x} />{x.template_version && <span className="text-footnote text-muted">Version {x.template_version}</span>}
              {x.party && <span className="text-footnote text-muted">{x.party.name}{x.party.signatory_name ? ` · signs: ${x.party.signatory_name}` : ''}</span>}</div>
            {x.signer_kind === 'outside' && <LinkPanel x={x} onDone={q.reload} />}
            {x.pdf_url && <Suspense fallback={<Spinner />}><PdfPages src={x.pdf_url} /></Suspense>}
            {x.blocks.length > 0 && <DocPaper status={x.status} doc={{
              typeLabel: CAT[x.category]?.one || 'Contract', title: x.title, reference: x.reference, issuedAt: x.sent_at || x.created_at, version: x.template_version,
              officerName: x.officer_name, blocks: x.blocks, ack: x.ack,
            }} signers={{ company: x.company, officer: x.signed_at ? { name: x.signed_name, png: x.signature, at: x.signed_at } : null }} />}
            <div className="rounded-2xl bg-bg p-4">
              <div className="mb-2 text-footnote font-semibold uppercase tracking-wide text-muted">Signing timeline</div>
              <Timeline events={x.events} />
            </div>
          </div>
        )}
      </Load>
    </Sheet>
  );
}
