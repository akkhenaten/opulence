import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { Button, cx, Pressable, Sheet, Textarea, toLocalInput, useAction } from '../../ui/index.jsx';
import { INCIDENT_TYPES } from '../officer/_parts.jsx';

/* Report from the shift bar in two taps: what kind and one line, saved as a draft to finish after the busy moment.
   "Write it now" saves the same and opens the full form on that draft. */
export default function QuickIncident({ shiftId, open, onClose }) {
  const nav = useNavigate();
  const [type, setType] = useState('');
  const [text, setText] = useState('');
  const [run, busy] = useAction();
  const save = (full) => run(async () => {
    const d = await api('incidents.draftSave', { data: { shift_id: shiftId, type, description: text, occurred_at: toLocalInput(new Date()) } });
    setType(''); setText('');
    onClose();
    if (full) nav(`/officer/incidents/new?draft=${d.id}`);
  }, full ? undefined : 'Saved. Finish it later from Home').catch(() => {});

  return (
    <Sheet open={open} onClose={onClose} title="Report an incident" dirty={!!(type || text)}
      footer={(
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" busy={busy} disabled={!type} onClick={() => save(true)}>Write it now</Button>
          <Button size="lg" busy={busy} disabled={!type} onClick={() => save(false)}>Save for later</Button>
        </div>
      )}>
      <div className="flex flex-wrap gap-2">
        {INCIDENT_TYPES.map((t) => (
          <Pressable press key={t.value} onClick={() => setType(t.value)} aria-pressed={type === t.value}
            className={cx('rounded-full border px-3 py-1.5 text-subhead font-semibold', type === t.value ? 'border-transparent bg-[var(--accent-fill,var(--color-blue))] text-on-accent' : 'border-line bg-surface text-ink')}>
            {t.label}
          </Pressable>
        ))}
      </div>
      <Textarea className="mt-4" label="One line for now" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Man refused to leave, walked out at 23:40" />
    </Sheet>
  );
}
