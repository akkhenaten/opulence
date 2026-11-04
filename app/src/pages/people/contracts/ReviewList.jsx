// Review findings: Blockers stop sending, Needs review items are acknowledged with a note, Notes are for information
import { useState } from 'react';
import { ArrowRight, CheckCircle2, ExternalLink } from 'lucide-react';
import { Button, cx, dateTime, Input } from '../../../ui/index.jsx';
import { SEVERITY } from './_shared.jsx';

function Finding({ f, onJump, onAck, readOnly }) {
  const [acking, setAcking] = useState(false);
  const [note, setNote] = useState('');
  const S = SEVERITY[f.severity];
  return (
    <li className="flex gap-2.5 px-3 py-2.5">
      <S.icon size={16} className={cx('mt-0.5 shrink-0', f.ack ? 'text-green' : S.text)} />
      <div className="min-w-0 flex-1 text-footnote">
        <p className={cx(f.ack && 'text-muted')}>{f.message}</p>
        {f.ack && (
          <p className="mt-0.5 inline-flex items-center gap-1 text-caption text-green">
            <CheckCircle2 size={12} />Acknowledged by {f.ack.by} · {dateTime(f.ack.at)}{f.ack.note ? ` · ${f.ack.note}` : ''}
          </p>
        )}
        {!readOnly && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {f.jump && <Button size="sm" variant="ghost" iconRight={ArrowRight} onClick={() => onJump(f.jump)}>Go to it</Button>}
            {f.url && <a href={f.url} target="_blank" rel="noopener noreferrer" className="inline-flex h-8 items-center gap-1 px-2 text-footnote font-semibold text-blue">Source<ExternalLink size={12} /></a>}
            {f.severity === 'review' && !f.ack && !acking && <Button size="sm" variant="secondary" onClick={() => setAcking(true)}>Acknowledge</Button>}
            {f.ack && <Button size="sm" variant="ghost" onClick={() => onAck(f.id, null)}>Undo</Button>}
          </div>
        )}
        {acking && (
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <Input className="min-w-0 flex-1 basis-48" label="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="Why this is fine for this document" autoFocus />
            <Button size="sm" variant="secondary" onClick={() => setAcking(false)}>Cancel</Button>
            <Button size="sm" onClick={() => { onAck(f.id, { note }); setAcking(false); }}>Acknowledge</Button>
          </div>
        )}
      </div>
    </li>
  );
}

export default function ReviewList({ findings, onJump, onAck, readOnly, className }) {
  if (!findings.length) {
    return <div className={cx('flex items-center gap-2 rounded-2xl bg-green-soft px-4 py-3 text-footnote font-semibold text-green', className)}><CheckCircle2 size={16} />No findings. The document is ready to send.</div>;
  }
  return (
    <div className={cx('space-y-3', className)}>
      {['blocker', 'review', 'note'].map((sev) => {
        const list = findings.filter((f) => f.severity === sev);
        if (!list.length) return null;
        const S = SEVERITY[sev];
        const open = sev === 'review' ? list.filter((f) => !f.ack).length : list.length;
        return (
          <div key={sev} className="overflow-hidden rounded-2xl bg-surface shadow-tile">
            <div className={cx('flex items-center gap-2 px-3 py-2 text-footnote font-bold', S.soft, S.text)}>
              <S.icon size={15} />{S.label}<span className="num ml-auto">{sev === 'review' && open !== list.length ? `${open} of ${list.length} open` : list.length}</span>
            </div>
            <ul className="divide-y divide-line">{list.map((f) => <Finding key={f.id} f={f} onJump={onJump} onAck={onAck} readOnly={readOnly} />)}</ul>
          </div>
        );
      })}
    </div>
  );
}
