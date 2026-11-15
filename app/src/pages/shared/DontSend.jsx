import { useState } from 'react';
import { api } from '../../api.js';
import { Button, Sheet, Textarea, useAction } from '../../ui/index.jsx';

/** A venue asks not to have an officer back. The office decides; the venue only hears that it was passed on. */
export function DontSendSheet({ officer, onClose }) {
  const [reason, setReason] = useState('');
  const [run, busy] = useAction();
  const send = () => run(() => api('feedback.dontSend', { officer_id: officer.officer_id, venue_id: officer.venue_id, reason: reason.trim() }), 'Passed to the office').then(onClose).catch(() => {});
  return (
    <Sheet open onClose={onClose} title={`Don't send ${officer.officer_name} again`} dirty={!!reason}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} onClick={send}>Send to the office</Button></>}>
      <p className="mb-3 text-subhead text-muted">The office reviews this and keeps them off your rota if they agree. You can ask this for officers who worked here in the last 90 days.</p>
      <Textarea label="What happened? (optional)" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
    </Sheet>
  );
}
