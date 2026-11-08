import { useEffect, useState } from 'react';
import { LogOut } from 'lucide-react';
import { api } from '../../api.js';
import { Button, Chip, Input, Segmented, Sheet, Textarea, time, useAction } from '../../ui/index.jsx';
import { fromLondonInput, toLondonInput } from '../manager/_parts.jsx';

// A manager clocks out an officer who forgot (Live, Rota, Timesheets). Their clock-in stays as recorded.

const REASONS = ['Forgot to clock out', 'Phone died / no signal', 'Left early with permission', 'Other'];

/** row: { assignment_id, officer_name, venue_name, clocked_in, ends_at, on_break }. later: open on "Another time" (fixing an auto-closed shift) */
export function ClockOutSheet({ open, onClose, onDone, row, later }) {
  const ended = row && new Date(row.ends_at) <= new Date();
  const [when, setWhen] = useState('now');
  const [at, setAt] = useState('');
  const [reason, setReason] = useState(REASONS[0]);
  const [other, setOther] = useState('');
  const [run, busy] = useAction();
  useEffect(() => {
    if (!open || !row) return;
    setWhen(later ? 'other' : ended ? 'end' : 'now');
    setAt(toLondonInput(ended ? row.ends_at : new Date().toISOString()));
    setReason(REASONS[0]);
    setOther('');
  }, [open, row?.assignment_id]);
  if (!row) return null;
  const why = reason === 'Other' ? other.trim() : reason;
  const iso = when === 'now' ? new Date().toISOString() : when === 'end' ? row.ends_at : fromLondonInput(at);
  const save = () => run(() => api('clock.managerOut', { assignment_id: row.assignment_id, at: when === 'now' ? undefined : iso, reason: why }), `${row.officer_name} clocked out`)
    .then(() => { window.dispatchEvent(new Event('orb:ops')); onDone?.(); }).catch(() => {});
  const options = [
    !ended && { value: 'now', label: 'Now' },
    { value: 'end', label: <>Shift end <span className="num">{time(row.ends_at)}</span></> },
    { value: 'other', label: 'Another time' },
    ended && { value: 'now', label: 'Now' },
  ].filter(Boolean);
  return (
    <Sheet open={open} onClose={onClose} title={`Clock out ${row.officer_name}`} size="sm"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button icon={LogOut} busy={busy} disabled={!why || !iso} onClick={save}>Clock out</Button>
      </>}>
      <div className="space-y-5">
        <p className="text-subhead text-muted">
          {row.clocked_in ? <>Clocked in <b className="num text-ink">{time(row.clocked_in)}</b> · </> : null}
          shift ends <b className="num text-ink">{time(row.ends_at)}</b>{row.venue_name ? <> · {row.venue_name}</> : null}
        </p>
        <div>
          <div className="mb-1.5 text-footnote font-semibold text-muted">Clock-out time</div>
          <Segmented full value={when} onChange={setWhen} options={options} />
          {when === 'other' && <Input className="mt-3" label="Clocked out at" type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} />}
        </div>
        <div>
          <div className="mb-1.5 text-footnote font-semibold text-muted">Reason</div>
          <div className="flex flex-wrap gap-2">
            {REASONS.map((r) => <Chip key={r} label={r} active={reason === r} onClick={() => setReason(r)} />)}
          </div>
          {reason === 'Other' && <Textarea className="mt-3" rows={2} label="What happened" value={other} onChange={(e) => setOther(e.target.value)} />}
        </div>
        <p className="text-footnote text-muted">
          Their clock-in stays as recorded{row.on_break ? ' and their break ends at the same time' : ''}. The timesheet updates, they get a notification, and it's kept in the audit log.
        </p>
      </div>
    </Sheet>
  );
}
