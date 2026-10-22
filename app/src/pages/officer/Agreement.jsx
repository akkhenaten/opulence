// Read and sign a pay-rise agreement sent by the company
import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Download, Eraser, FileSignature } from 'lucide-react';
import { api, downloadAction } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Button, date, dateTime, Input, Load, money, Page, Pill, Toggle, useAction, useApi, useToast } from '../../ui/index.jsx';
import { SignaturePad } from './Contract.jsx';

const STATUS = { sent: ['To sign', 'amber'], signed: ['Signed', 'blue'], applied: ['In effect', 'green'], void: ['Withdrawn', 'grey'] };

export default function Agreement() {
  const { id } = useParams();
  const q = useApi('payAgreements.get', { id });
  const [run, busy] = useAction();
  const pdf = () => run(() => downloadAction('payAgreements.pdf', { id })).catch(() => {});
  return (
    <Page title="Pay rise" back={{ to: '/officer/me/growth', label: 'Goals' }}
      actions={q.data && <Button variant="secondary" icon={Download} busy={busy} onClick={pdf}>PDF</Button>}>
      <Load q={q}>
        {(a) => (
          <div className="space-y-3">
            <div className="rounded-tile bg-surface p-5 shadow-tile">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-footnote font-semibold uppercase text-muted">New hourly rate</div>
                  <div className="display num text-title1 font-bold">{money(a.new_rate)}</div>
                  {a.current_rate != null && <div className="num text-subhead text-muted">Up from {money(a.current_rate)}</div>}
                </div>
                <Pill tone={STATUS[a.status]?.[1]}>{STATUS[a.status]?.[0]}</Pill>
              </div>
              <div className="mt-4 space-y-1 rounded-2xl bg-bg p-4 text-subhead">
                <div><span className="text-muted">Role:</span> {a.role_name}</div>
                <div><span className="text-muted">Venue:</span> {a.venue_name || 'All venues'}</div>
                <div><span className="text-muted">Starts:</span> {date(a.effective_from)}</div>
              </div>
              {a.conditions.length > 0 && (
                <div className="mt-3">
                  <div className="text-subhead font-semibold">Starts once you meet these goals</div>
                  <ul className="mt-1 space-y-1">
                    {a.conditions.map((g) => (
                      <li key={g.id} className="flex items-center justify-between gap-2 text-subhead">
                        <span>{g.title}</span><Pill tone={g.status === 'met' ? 'green' : 'blue'}>{g.status === 'met' ? 'Met' : 'Not yet'}</Pill>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-footnote text-muted">If they are met after the start date, the new rate starts on the day they are met.</p>
                </div>
              )}
            </div>
            {a.status === 'void' && <div className="rounded-2xl bg-bg px-4 py-3 text-subhead text-muted">The office withdrew this agreement. It no longer needs signing.</div>}
            {(a.status === 'signed' || a.status === 'applied') && (
              <div className="rounded-tile bg-surface p-5 shadow-tile">
                <div className="flex items-center gap-2 font-semibold text-green"><CheckCircle2 size={20} />{a.status === 'applied' ? 'Signed and in effect' : 'Signed'}</div>
                <div className="mt-2 text-subhead text-muted">{a.signed_name} · {dateTime(a.signed_at)}</div>
              </div>
            )}
            {a.status === 'sent' && <SignForm id={id} onSigned={q.reload} />}
          </div>
        )}
      </Load>
    </Page>
  );
}

function SignForm({ id, onSigned }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [name, setName] = useState(user.name || '');
  const [agree, setAgree] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const pad = useRef(null);
  const [run, busy] = useAction();
  const ok = name.trim().length > 2 && agree && hasInk;
  const sign = () => {
    const signature = pad.current?.toDataURL();
    if (!signature) { toast('Please sign in the box', 'error'); return; }
    run(() => api('payAgreements.sign', { id, signature, signed_name: name.trim() }), (r) => (r.applied ? 'Signed. Your new rate is in effect.' : 'Signed. Thank you.'))
      .then(() => { onSigned(); nav('/officer/me/growth'); }).catch(() => {});
  };
  return (
    <div className="rounded-tile bg-surface p-5 shadow-tile">
      <div className="mb-3 flex items-center gap-2 text-headline font-bold"><FileSignature size={20} className="text-blue" />Sign to accept</div>
      <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      <div className="mt-4 flex items-center justify-between">
        <span className="text-footnote font-semibold text-muted">Signature</span>
        <Button variant="ghost" size="sm" icon={Eraser} disabled={!hasInk} onClick={() => pad.current?.clear()}>Clear</Button>
      </div>
      <SignaturePad handle={pad} onInk={setHasInk} />
      <div className="mt-4 rounded-2xl bg-bg px-3">
        <Toggle checked={agree} onChange={setAgree} label="I accept this pay rise on these terms" hint="Your signature, name, time and IP address are recorded." />
      </div>
      <Button size="lg" className="mt-4 w-full" busy={busy} disabled={!ok} onClick={sign}>Sign agreement</Button>
    </div>
  );
}
