import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Download, FilePlus, FileText, History, ImagePlus, MessageSquareReply, Pencil, RefreshCw, RotateCcw, Sparkles, Trash2, X,
} from 'lucide-react';
import { api, downloadAction } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Button, cx, dateTime, KV, Lightbox, List, Load, Page, Pill, Row, Section, Sheet, Spinner, Textarea, Tile, useAction, useApi, useConfirm, useToast,
} from '../../ui/index.jsx';
import { INCIDENT_STATUS, typeLabel } from '../officer/_parts.jsx';
import { DOC_ACCEPT, fileSize, MAX_FILES, useUploads } from './evidence.jsx';

const yn = (b, ref) => (b ? `Yes${ref ? ` (ref ${ref})` : ''}` : 'No');
const LABELS = {
  type: 'Type', severity: 'Severity', occurred_at: 'Occurred', location: 'Location', description: 'What happened', people_involved: 'People involved',
  injuries: 'Injuries', actions_taken: 'Actions taken', force_used: 'Force used', force_justification: 'Justification for force',
  police_called: 'Police called', police_ref: 'Police reference', ambulance_called: 'Ambulance called', ambulance_ref: 'Ambulance reference',
};

export default function IncidentDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const base = `/${user.role}`;
  const q = useApi('incidents.get', { id });
  const [run, busy] = useAction();
  const pdf = () => run(() => downloadAction('incidents.pdf', { id })).catch(() => {});
  return (
    <Page title={q.data?.ref || 'Incident'} subtitle={q.data && `${typeLabel(q.data.type)} · ${q.data.venue_name}`} back={{ to: `${base}/incidents`, label: 'Incidents' }}
      actions={q.data && <Button variant="secondary" icon={Download} busy={busy} onClick={pdf}>PDF</Button>}>
      <Load q={q}>{(inc) => <Detail inc={inc} reload={q.reload} base={base} />}</Load>
    </Page>
  );
}

function Detail({ inc, reload, base }) {
  const { user } = useAuth();
  const isMgr = user.role === 'company' || user.role === 'security';
  const isOfficer = user.role === 'officer';
  const canEdit = isOfficer && inc.status !== 'closed' && (inc.status === 'changes_requested' || inc.reported_by === user.id);
  const [lightbox, setLightbox] = useState(null);
  const [version, setVersion] = useState(null);
  const [prefill, setPrefill] = useState(null);
  const canAdd = isMgr || (isOfficer && inc.status !== 'closed');
  const images = inc.attachments.filter((a) => a.mime?.startsWith('image/'));
  const files = inc.attachments.filter((a) => !a.mime?.startsWith('image/'));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-3">
        <StatusBanner inc={inc} isOfficer={isOfficer} />
        {canEdit && (
          <Button size="lg" icon={Pencil} className="w-full" variant={inc.status === 'changes_requested' ? 'primary' : 'secondary'} to={`${base}/incidents/${inc.id}/edit`}>
            {inc.status === 'changes_requested' ? 'Edit and resubmit' : 'Edit report'}
          </Button>
        )}

        <Tile>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Pill status={inc.severity}>{inc.severity === 'critical' ? 'Critical' : `${inc.severity[0].toUpperCase()}${inc.severity.slice(1)} severity`}</Pill>
            <Pill status={inc.status}>{INCIDENT_STATUS[inc.status]}</Pill>
            {inc.version > 1 && <Pill tone="grey">Version {inc.version}</Pill>}
            {isMgr && inc.ai_assisted && <Pill tone="blue"><Sparkles size={14} />AI-assisted</Pill>}
          </div>
          <KV items={[
            ['Occurred', dateTime(inc.occurred_at)],
            ['Venue', inc.venue_name],
            ['Location', inc.location],
            ['Officer', inc.officer_name],
            inc.reported_by_name && inc.reported_by_name !== inc.officer_name && ['Reported by', inc.reported_by_name],
            ['Submitted', dateTime(inc.created_at)],
          ]} />
        </Tile>

        <Section title="What happened" className="!mt-4"><Tile><p className="whitespace-pre-line text-body leading-relaxed">{inc.description}</p></Tile></Section>

        {(inc.people_involved || inc.injuries) && (
          <Section title="People" className="!mt-4">
            <Tile><KV items={[['People involved', inc.people_involved && <span className="whitespace-pre-line">{inc.people_involved}</span>], ['Injuries', inc.injuries ? <span className="whitespace-pre-line">{inc.injuries}</span> : 'None recorded']]} /></Tile>
          </Section>
        )}

        <Section title="Actions and emergency services" className="!mt-4">
          <Tile>
            <KV items={[
              ['Actions taken', inc.actions_taken && <span className="whitespace-pre-line">{inc.actions_taken}</span>],
              ['Force used', inc.force_used ? <span className="font-semibold text-red">Yes</span> : 'No'],
              inc.force_used && ['Justification for force', <span key="j" className="whitespace-pre-line">{inc.force_justification}</span>],
              ['Police', yn(inc.police_called, inc.police_ref)],
              ['Ambulance', yn(inc.ambulance_called, inc.ambulance_ref)],
            ]} />
          </Tile>
        </Section>

        {inc.witnesses.length > 0 && (
          <Section title={`Witnesses (${inc.witnesses.length})`} className="!mt-4">
            <List>
              {inc.witnesses.map((w) => (
                <div key={w.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{w.name}</span>
                    {user.role !== 'venue' && w.contact && <span className="truncate text-footnote text-muted">{w.contact}</span>}
                  </div>
                  {w.statement && <p className="mt-1 whitespace-pre-line text-subhead text-muted">{w.statement}</p>}
                </div>
              ))}
            </List>
          </Section>
        )}

        {(inc.attachments.length > 0 || canAdd || inc.removed?.length > 0) && (
          <Attachments inc={inc} images={images} files={files} canAdd={canAdd} reload={reload} openImage={setLightbox} />
        )}
      </div>

      <aside className="space-y-3">
        {isMgr && <ReviewPanel inc={inc} reload={reload} prefill={prefill} clearPrefill={() => setPrefill(null)} />}
        {isMgr && inc.attachments.length > 0 && <EvidenceReview inc={inc} onRequest={(text) => setPrefill(text)} />}
        {inc.versions.length > 0 && (
          <Section title="History" className="!mt-0 lg:!mt-0">
            <List>
              {[...inc.versions].reverse().map((v) => (
                <Row key={v.id} left={<History size={18} className="text-muted" />} title={`Version ${v.version}${v.version === 1 ? ' (original)' : ''}`}
                  subtitle={[dateTime(v.created_at), v.edited_by_name].filter(Boolean).join(' · ')}
                  onClick={isMgr ? () => setVersion(v) : undefined} chevron={isMgr} />
              ))}
            </List>
            <p className="mt-2 px-1 text-caption text-muted">Every edit is kept. The original report cannot be changed.</p>
          </Section>
        )}
      </aside>

      <Lightbox photos={images} index={lightbox} onClose={() => setLightbox(null)} download />
      <VersionSheet v={version} onClose={() => setVersion(null)} hideContacts={user.role === 'venue'} />
    </div>
  );
}

function StatusBanner({ inc, isOfficer }) {
  if (inc.status === 'changes_requested') {
    return (
      <div className="flex gap-3 rounded-tile bg-amber-soft p-4 text-amber">
        <AlertTriangle size={24} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="text-callout font-bold">{isOfficer ? 'More detail needed' : 'Changes requested'}</div>
          {inc.review_comment && <p className="mt-0.5 whitespace-pre-line text-subhead font-medium">{inc.review_comment}</p>}
          <div className="mt-1 text-caption opacity-80">{[inc.reviewed_by_name, inc.reviewed_at && dateTime(inc.reviewed_at)].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
    );
  }
  if (inc.status === 'closed') {
    return (
      <div className="flex gap-3 rounded-tile bg-surface p-4 shadow-tile">
        <CheckCircle2 size={24} className="mt-0.5 shrink-0 text-green" />
        <div className="min-w-0">
          <div className="text-callout font-bold">Closed</div>
          {inc.review_comment && <p className="mt-0.5 whitespace-pre-line text-subhead text-muted">{inc.review_comment}</p>}
          <div className="mt-1 text-caption text-faint">{[inc.reviewed_by_name, inc.reviewed_at && dateTime(inc.reviewed_at)].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
    );
  }
  return null;
}

function ReviewPanel({ inc, reload, prefill, clearPrefill }) {
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const [mode, setMode] = useState(null); // changes_requested | close
  const [comment, setComment] = useState('');
  useEffect(() => {
    if (!prefill) return;
    setComment((c) => (c.trim() ? `${c.trim()}\n${prefill}` : prefill));
    setMode('changes_requested');
    clearPrefill();
  }, [prefill]); // eslint-disable-line react-hooks/exhaustive-deps
  const decide = (decision, c = '') => run(() => api('incidents.review', { id: inc.id, decision, comment: c }),
    { close: 'Incident closed', changes_requested: 'Sent back to the officer', reopen: 'Incident reopened' }[decision])
    .then(() => { setMode(null); setComment(''); reload(); }).catch(() => {});
  const reopen = async () => { if (await confirm({ title: 'Reopen this incident?', body: 'It will go back to the review queue.', confirm: 'Reopen' })) decide('reopen'); };

  return (
    <Tile title="Review">
      {inc.status === 'closed' ? (
        <Button variant="secondary" icon={RotateCcw} className="w-full" busy={busy} onClick={reopen}>Reopen</Button>
      ) : (
        <div className="grid gap-2">
          <p className="text-footnote text-muted">{inc.status === 'changes_requested' ? 'Waiting for the officer to update the report.' : 'Check the report, then close it or ask the officer for more detail.'}</p>
          <Button icon={CheckCircle2} className="w-full" onClick={() => setMode('close')}>Close incident</Button>
          <Button variant="secondary" icon={MessageSquareReply} className="w-full" onClick={() => setMode('changes_requested')}>Request changes</Button>
        </div>
      )}
      <Sheet open={!!mode} onClose={() => setMode(null)} title={mode === 'close' ? 'Close incident' : 'Request changes'} size="sm"
        footer={<><Button variant="secondary" onClick={() => setMode(null)}>Cancel</Button><Button busy={busy} disabled={mode === 'changes_requested' && !comment.trim()} onClick={() => decide(mode, comment.trim())}>{mode === 'close' ? 'Close incident' : 'Send to officer'}</Button></>}>
        <Textarea label={mode === 'close' ? 'Closing note (optional)' : 'What needs changing?'} rows={4} value={comment} onChange={(e) => setComment(e.target.value)}
          placeholder={mode === 'close' ? 'e.g. Reviewed with the venue manager. No further action.' : 'e.g. Please add the police CAD number and describe the hold used.'} />
        {mode === 'changes_requested' && <p className="mt-2 text-footnote text-muted">{inc.officer_name || 'The officer'} will get a notification and email.</p>}
      </Sheet>
    </Tile>
  );
}

function Attachments({ inc, images, files, canAdd, reload, openImage }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [run, busy] = useAction();
  const lib = useRef(null);
  const doc = useRef(null);
  const uploads = useUploads({ existingCount: inc.attachments.length, toast });
  const pick = (e) => { const fs = [...(e.target.files || [])]; e.target.value = ''; if (fs.length) uploads.add(fs); };
  const pending = uploads.items.length > 0;
  const save = () => run(() => api('incidents.addAttachments', { id: inc.id, attachments: uploads.attachments }), 'Files added')
    .then(() => { uploads.items.forEach((x) => uploads.remove(x.uid)); reload(); }).catch(() => {});
  const remove = async (a) => {
    if (!(await confirm({ title: `Remove ${a.name || 'this file'}?`, body: 'It comes off the report and the PDF. The report history keeps a note that it was removed.', confirm: 'Remove', danger: true }))) return;
    run(() => api('incidents.removeAttachment', { id: a.id }), 'File removed').then(reload).catch(() => {});
  };
  const meta = (a) => [fileSize(a.size_bytes), a.uploaded_by_name, dateTime(a.created_at)].filter(Boolean).join(' · ');
  const full = inc.attachments.length + uploads.items.length >= MAX_FILES;
  return (
    <Section title={`Photos and files (${inc.attachments.length})`} className="!mt-4"
      action={canAdd && !full && (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" icon={ImagePlus} onClick={() => lib.current?.click()}>Photo</Button>
          <Button size="sm" variant="ghost" icon={FilePlus} onClick={() => doc.current?.click()}>File</Button>
        </div>
      )}>
      <input ref={lib} type="file" accept="image/*" multiple className="hidden" onChange={pick} />
      <input ref={doc} type="file" accept={DOC_ACCEPT} multiple className="hidden" onChange={pick} />
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((a, i) => (
            <div key={a.id} className="group relative aspect-square overflow-hidden rounded-2xl bg-bg shadow-tile">
              <button type="button" onClick={() => openImage(i)} className="block h-full w-full" title={meta(a)}>
                <img src={a.url} alt={a.name || 'Incident photo'} loading="lazy" className="h-full w-full object-cover transition hover:scale-105" />
              </button>
              {a.can_remove && (
                <button type="button" aria-label={`Remove ${a.name || 'photo'}`} disabled={busy} onClick={() => remove(a)}
                  className="absolute right-1 top-1 grid h-8 w-8 place-items-center rounded-full bg-ink/70 text-white"><Trash2 size={16} /></button>
              )}
            </div>
          ))}
        </div>
      )}
      {files.length > 0 && (
        <List className="mt-2">
          {files.map((a) => (
            <Row key={a.id} left={<FileText size={20} className="text-muted" />} title={<a href={a.url} target="_blank" rel="noopener noreferrer" className="hover:text-blue">{a.name || 'File'}</a>} subtitle={meta(a)}
              right={(
                <div className="flex gap-1">
                  <a href={a.url} target="_blank" rel="noopener noreferrer" aria-label={`Open ${a.name || 'file'}`} className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-bg"><Download size={16} /></a>
                  {a.can_remove && <button type="button" aria-label={`Remove ${a.name || 'file'}`} disabled={busy} onClick={() => remove(a)} className="grid h-9 w-9 place-items-center rounded-full text-muted hover:bg-red-soft hover:text-red"><Trash2 size={16} /></button>}
                </div>
              )} />
          ))}
        </List>
      )}
      {images.length > 0 && <p className="mt-2 px-1 text-caption text-muted">{images.length} photo{images.length > 1 ? 's' : ''} · added by {[...new Set(images.map((a) => a.uploaded_by_name).filter(Boolean))].join(', ') || 'the officer'}</p>}
      {!inc.attachments.length && !pending && <p className="rounded-2xl bg-bg px-4 py-3 text-subhead text-muted">No photos or files yet.</p>}
      {pending && (
        <div className="mt-3 rounded-2xl border border-line p-3">
          <ul className="space-y-1 text-subhead">
            {uploads.items.map((x) => (
              <li key={x.uid} className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate">{x.name}</span>
                <span className={cx('shrink-0 text-caption', x.status === 'error' ? 'text-red' : 'text-muted')}>{x.status === 'uploading' ? 'Uploading…' : x.status === 'error' ? 'Failed' : fileSize(x.size)}</span>
                <button type="button" aria-label={`Remove ${x.name}`} onClick={() => uploads.remove(x.uid)} className="text-muted"><X size={16} /></button>
              </li>
            ))}
          </ul>
          <Button className="mt-3 w-full" busy={busy} disabled={uploads.uploading || !uploads.done.length} onClick={save}>
            {uploads.uploading ? 'Uploading…' : `Add ${uploads.done.length} to the report`}
          </Button>
        </div>
      )}
      {inc.removed?.length > 0 && (
        <p className="mt-2 px-1 text-caption text-muted">
          Removed: {inc.removed.map((r) => `${r.name || 'file'} (${[r.removed_by_name, dateTime(r.removed_at)].filter(Boolean).join(', ')})`).join('; ')}
        </p>
      )}
    </Section>
  );
}

function EvidenceReview({ inc, onRequest }) {
  const [state, setState] = useState({ data: inc.ai_summary || null, stale: inc.ai_summary_stale, loading: false, error: null });
  const load = (force) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    api('incidents.aiReview', { id: inc.id, force })
      .then((data) => setState({ data, stale: false, loading: false, error: null }))
      .catch((e) => setState((s) => ({ ...s, loading: false, error: e.message })));
  };
  const d = state.data;
  const byId = Object.fromEntries(inc.attachments.map((a, i) => [a.id, { ...a, n: i + 1 }]));
  return (
    <Tile title={<span className="inline-flex items-center gap-1.5"><Sparkles size={16} className="text-blue" />Evidence review</span>}
      action={d && !d.error && <Button size="sm" variant="ghost" icon={RefreshCw} busy={state.loading} onClick={() => load(true)}>Refresh</Button>}>
      {state.error && <p className="mb-2 rounded-xl bg-amber-soft px-3 py-2 text-footnote text-amber">{state.error}</p>}
      {(!d || d.error) ? (
        <div className="grid gap-2">
          <p className="text-footnote text-muted">{d?.error ? 'The last review could not finish.' : 'AI reads the photos and files and checks them against the written report.'}</p>
          <Button variant="secondary" icon={Sparkles} busy={state.loading} onClick={() => load(!!d)}>Review evidence</Button>
        </div>
      ) : (
        <div className="space-y-3 text-subhead">
          {state.stale && <p className="rounded-xl bg-bg px-3 py-2 text-caption text-muted">The report or its files changed since this review. It refreshes by itself shortly, or tap Refresh.</p>}
          {d.summary && <p className="leading-relaxed">{d.summary}</p>}
          {d.mismatches?.length > 0 && (
            <div>
              <div className="mb-1 text-caption font-semibold uppercase tracking-wide text-red">Doesn't match the report</div>
              <ul className="space-y-1.5">{d.mismatches.map((m) => <Finding key={m} text={m} onRequest={onRequest} />)}</ul>
            </div>
          )}
          {d.missing?.length > 0 && (
            <div>
              <div className="mb-1 text-caption font-semibold uppercase tracking-wide text-amber">Missing from the report</div>
              <ul className="space-y-1.5">{d.missing.map((m) => <Finding key={m} text={m} onRequest={onRequest} />)}</ul>
            </div>
          )}
          {d.captions?.length > 0 && (
            <details className="rounded-xl bg-bg px-3 py-2">
              <summary className="cursor-pointer text-footnote font-semibold">What each file shows ({d.captions.length})</summary>
              <ul className="mt-2 space-y-1.5 text-footnote">
                {d.captions.map((c) => <li key={c.attachment_id || c.text}><span className="font-semibold">{byId[c.attachment_id] ? `${byId[c.attachment_id].n}. ${byId[c.attachment_id].name || 'File'}` : 'File'}:</span> {c.text}</li>)}
              </ul>
            </details>
          )}
          {d.skipped?.length > 0 && <p className="text-caption text-muted">Not read: {d.skipped.join(', ')}</p>}
          <p className="text-caption text-faint">AI can be wrong. Check the photos yourself before acting.</p>
        </div>
      )}
    </Tile>
  );
}

function Finding({ text, onRequest }) {
  return (
    <li className="flex items-start gap-2">
      <span className="min-w-0 flex-1">{text}</span>
      <button type="button" onClick={() => onRequest(text)} className="shrink-0 rounded-lg px-2 py-0.5 text-caption font-semibold text-blue hover:bg-blue-soft">Ask officer</button>
    </li>
  );
}

function VersionSheet({ v, onClose, hideContacts }) {
  const q = useApi('incidents.version', { id: v?.id }, { skip: !v });
  const d = q.data?.data;
  const data = typeof d === 'string' ? JSON.parse(d) : d;
  const fmt = (k, val) => {
    if (k === 'occurred_at') return val && dateTime(val);
    if (typeof val === 'boolean') return val ? 'Yes' : 'No';
    if (k === 'type') return typeLabel(val);
    return val ? <span className="whitespace-pre-line">{String(val)}</span> : null;
  };
  return (
    <Sheet open={!!v} onClose={onClose} title={v ? `Version ${v.version}` : ''} size="lg">
      {v && <p className="-mt-1 mb-4 text-subhead text-muted">{[dateTime(v.created_at), v.edited_by_name].filter(Boolean).join(' · ')}</p>}
      {q.loading && !q.data ? <Spinner /> : q.error ? <p className="text-red">{q.error.message}</p> : data ? (
        <>
          <KV items={Object.keys(LABELS).filter((k) => k in data).map((k) => [LABELS[k], fmt(k, data[k])])} />
          {data.witnesses?.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 text-caption font-semibold uppercase tracking-wide text-faint">Witnesses</div>
              <List inset>
                {data.witnesses.map((w, i) => (
                  <div key={i} className={cx('px-4 py-3')}>
                    <div className="font-semibold">{w.name}{!hideContacts && w.contact ? <span className="ml-2 text-footnote font-normal text-muted">{w.contact}</span> : null}</div>
                    {w.statement && <p className="mt-0.5 text-subhead text-muted">{w.statement}</p>}
                  </div>
                ))}
              </List>
            </div>
          )}
        </>
      ) : null}
    </Sheet>
  );
}
