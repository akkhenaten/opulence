import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Download, FileText, History, MessageSquareReply, Pencil, RotateCcw, X,
} from 'lucide-react';
import { api, downloadAction } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Button, cx, dateTime, KV, List, Load, Page, Pill, Row, Section, Sheet, Spinner, Textarea, Tile, useAction, useApi, useConfirm,
} from '../../ui/index.jsx';
import { INCIDENT_STATUS, typeLabel } from '../officer/_parts.jsx';

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

        <Section title="What happened" className="!mt-4"><Tile><p className="whitespace-pre-line text-[15px] leading-relaxed">{inc.description}</p></Tile></Section>

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
                    {user.role !== 'venue' && w.contact && <span className="truncate text-[13px] text-muted">{w.contact}</span>}
                  </div>
                  {w.statement && <p className="mt-1 whitespace-pre-line text-[14px] text-muted">{w.statement}</p>}
                </div>
              ))}
            </List>
          </Section>
        )}

        {inc.attachments.length > 0 && (
          <Section title={`Photos and files (${inc.attachments.length})`} className="!mt-4">
            {images.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {images.map((a, i) => (
                  <button key={a.id} type="button" onClick={() => setLightbox(i)} className="aspect-square overflow-hidden rounded-2xl bg-bg shadow-tile">
                    <img src={a.url} alt={a.name || 'Incident photo'} loading="lazy" className="h-full w-full object-cover transition hover:scale-105" />
                  </button>
                ))}
              </div>
            )}
            {files.length > 0 && (
              <List className="mt-2">
                {files.map((a) => <Row key={a.id} left={<FileText size={20} className="text-muted" />} title={a.name || 'File'} onClick={() => window.open(a.url, '_blank', 'noopener')} chevron />)}
              </List>
            )}
          </Section>
        )}
      </div>

      <aside className="space-y-3">
        {isMgr && <ReviewPanel inc={inc} reload={reload} />}
        {inc.versions.length > 0 && (
          <Section title="History" className="!mt-0 lg:!mt-0">
            <List>
              {[...inc.versions].reverse().map((v) => (
                <Row key={v.id} left={<History size={18} className="text-muted" />} title={`Version ${v.version}${v.version === 1 ? ' (original)' : ''}`}
                  subtitle={[dateTime(v.created_at), v.edited_by_name].filter(Boolean).join(' · ')}
                  onClick={isMgr ? () => setVersion(v) : undefined} chevron={isMgr} />
              ))}
            </List>
            <p className="mt-2 px-1 text-[12px] text-muted">Every edit is kept. The original report cannot be changed.</p>
          </Section>
        )}
      </aside>

      {lightbox != null && <Lightbox images={images} index={lightbox} setIndex={setLightbox} />}
      <VersionSheet v={version} onClose={() => setVersion(null)} hideContacts={user.role === 'venue'} />
    </div>
  );
}

function StatusBanner({ inc, isOfficer }) {
  if (inc.status === 'changes_requested') {
    return (
      <div className="flex gap-3 rounded-tile bg-amber-soft p-4 text-amber">
        <AlertTriangle size={22} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <div className="text-[16px] font-bold">{isOfficer ? 'More detail needed' : 'Changes requested'}</div>
          {inc.review_comment && <p className="mt-0.5 whitespace-pre-line text-[14px] font-medium">{inc.review_comment}</p>}
          <div className="mt-1 text-[12px] opacity-80">{[inc.reviewed_by_name, inc.reviewed_at && dateTime(inc.reviewed_at)].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
    );
  }
  if (inc.status === 'closed') {
    return (
      <div className="flex gap-3 rounded-tile bg-surface p-4 shadow-tile">
        <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-green" />
        <div className="min-w-0">
          <div className="text-[16px] font-bold">Closed</div>
          {inc.review_comment && <p className="mt-0.5 whitespace-pre-line text-[14px] text-muted">{inc.review_comment}</p>}
          <div className="mt-1 text-[12px] text-faint">{[inc.reviewed_by_name, inc.reviewed_at && dateTime(inc.reviewed_at)].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
    );
  }
  return null;
}

function ReviewPanel({ inc, reload }) {
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const [mode, setMode] = useState(null); // changes_requested | close
  const [comment, setComment] = useState('');
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
          <p className="text-[13px] text-muted">{inc.status === 'changes_requested' ? 'Waiting for the officer to update the report.' : 'Check the report, then close it or ask the officer for more detail.'}</p>
          <Button icon={CheckCircle2} className="w-full" onClick={() => setMode('close')}>Close incident</Button>
          <Button variant="secondary" icon={MessageSquareReply} className="w-full" onClick={() => setMode('changes_requested')}>Request changes</Button>
        </div>
      )}
      <Sheet open={!!mode} onClose={() => setMode(null)} title={mode === 'close' ? 'Close incident' : 'Request changes'} size="sm"
        footer={<><Button variant="secondary" onClick={() => setMode(null)}>Cancel</Button><Button busy={busy} disabled={mode === 'changes_requested' && !comment.trim()} onClick={() => decide(mode, comment.trim())}>{mode === 'close' ? 'Close incident' : 'Send to officer'}</Button></>}>
        <Textarea label={mode === 'close' ? 'Closing note (optional)' : 'What needs changing?'} rows={4} value={comment} onChange={(e) => setComment(e.target.value)}
          placeholder={mode === 'close' ? 'e.g. Reviewed with the venue manager. No further action.' : 'e.g. Please add the police CAD number and describe the hold used.'} />
        {mode === 'changes_requested' && <p className="mt-2 text-[13px] text-muted">{inc.officer_name || 'The officer'} will get a notification and email.</p>}
      </Sheet>
    </Tile>
  );
}

function Lightbox({ images, index, setIndex }) {
  const n = images.length;
  const prev = () => setIndex((index - 1 + n) % n);
  const next = () => setIndex((index + 1) % n);
  const [touch, setTouch] = useState(null);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') setIndex(null); if (e.key === 'ArrowLeft') prev(); if (e.key === 'ArrowRight') next(); };
    document.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  });
  const a = images[index];
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black/95 text-white" style={{ animation: 'fade .15s' }} role="dialog" aria-modal="true"
      onTouchStart={(e) => setTouch(e.touches[0].clientX)} onTouchEnd={(e) => { if (touch == null) return; const dx = e.changedTouches[0].clientX - touch; if (dx > 50) prev(); if (dx < -50) next(); setTouch(null); }}>
      <div className="flex items-center justify-between px-4 py-3 safe-t">
        <span className="text-[14px] font-semibold opacity-80">{index + 1} of {n}</span>
        <div className="flex gap-2">
          <a href={a.url} target="_blank" rel="noopener noreferrer" className="grid h-10 w-10 place-items-center rounded-full bg-white/10" aria-label="Open original"><Download size={18} /></a>
          <button type="button" onClick={() => setIndex(null)} className="grid h-10 w-10 place-items-center rounded-full bg-white/10" aria-label="Close"><X size={20} /></button>
        </div>
      </div>
      <div className="relative flex flex-1 items-center justify-center px-2 pb-6" onClick={(e) => e.target === e.currentTarget && setIndex(null)}>
        <img src={a.url} alt={a.name || ''} className="max-h-full max-w-full rounded-lg object-contain" />
        {n > 1 && (
          <>
            <button type="button" onClick={prev} className="absolute left-3 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 sm:grid" aria-label="Previous"><ChevronLeft /></button>
            <button type="button" onClick={next} className="absolute right-3 top-1/2 hidden h-12 w-12 -translate-y-1/2 place-items-center rounded-full bg-white/10 sm:grid" aria-label="Next"><ChevronRight /></button>
          </>
        )}
      </div>
    </div>
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
      {v && <p className="-mt-1 mb-4 text-[14px] text-muted">{[dateTime(v.created_at), v.edited_by_name].filter(Boolean).join(' · ')}</p>}
      {q.loading && !q.data ? <Spinner /> : q.error ? <p className="text-red">{q.error.message}</p> : data ? (
        <>
          <KV items={Object.keys(LABELS).filter((k) => k in data).map((k) => [LABELS[k], fmt(k, data[k])])} />
          {data.witnesses?.length > 0 && (
            <div className="mt-5">
              <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-faint">Witnesses</div>
              <List inset>
                {data.witnesses.map((w, i) => (
                  <div key={i} className={cx('px-4 py-3')}>
                    <div className="font-semibold">{w.name}{!hideContacts && w.contact ? <span className="ml-2 text-[13px] font-normal text-muted">{w.contact}</span> : null}</div>
                    {w.statement && <p className="mt-0.5 text-[14px] text-muted">{w.statement}</p>}
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
