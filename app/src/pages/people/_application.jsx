// An online application (from the public Apply page): AI summary of the CV, SIA details read from the badge, flags,
// the files, and the decision — invite to onboarding or reject.
import { useEffect, useState } from 'react';
import { AlertTriangle, FileText, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '../../api.js';
import { Button, date, dateTime, KV, List, Load, Pill, Row, Section, Sheet, Spinner, Toggle, useAction, useApi } from '../../ui/index.jsx';
import { CopyLink, openUrl } from './_parts.jsx';
import { SiaCheckPill, SiaVerifyButton } from './SiaVerify.jsx';
import { SIA_CHECK_ON } from '../../ui/sia.js';

const AVAIL = { weekdays: 'Weekdays', weekends: 'Weekends', nights: 'Nights', events: 'Events' };
const TONE = { critical: 'red', warning: 'amber' };
const siaFmt = (n) => String(n || '').replace(/(\d{4})(?=\d)/g, '$1 ');

export function ApplicationSheet({ id, onClose, onDone }) {
  const q = useApi('apply.get', { officer_id: id }, { skip: !id });
  const [run, busy] = useAction();
  const [rejecting, setRejecting] = useState(false);
  const [sendEmail, setSendEmail] = useState(true);
  const [invite, setInvite] = useState(null);
  const a = q.data;
  const pending = a?.ai_status === 'pending';

  // While the AI is still reading, check back every few seconds
  useEffect(() => {
    if (!pending) return undefined;
    const t = setInterval(() => q.reload(), 5000);
    return () => clearInterval(t);
  }, [pending]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => { onClose(); setTimeout(() => { setRejecting(false); setInvite(null); setSendEmail(true); }, 300); };
  const act = (fn, msg) => run(fn, msg).then((r) => { q.reload(); onDone?.(); return r; }).catch(() => null);
  const name = a ? `${a.first_name} ${a.last_name}` : 'Application';

  const doInvite = async () => {
    const r = await act(() => api('apply.invite', { officer_id: id }), `${a.first_name} moved to onboarding`);
    if (r) setInvite(r);
  };
  const doReject = async () => {
    const r = await act(() => api('apply.reject', { officer_id: id, email: sendEmail }), sendEmail ? 'Rejected — email sent' : 'Rejected');
    if (r) close();
  };

  const decided = a && a.status !== 'applicant';
  const footer = !a ? null : invite ? <Button onClick={close}>Done</Button>
    : rejecting ? <><Button variant="secondary" onClick={() => setRejecting(false)}>Back</Button><Button variant="danger" busy={busy} onClick={doReject}>Reject</Button></>
      : decided ? <Button variant="secondary" to={`/company/staff/${id}`}>Open full profile</Button>
        : <><Button variant="secondary" onClick={() => setRejecting(true)}>Reject</Button><Button busy={busy} onClick={doInvite}>Invite to onboarding</Button></>;

  return (
    <Sheet open={!!id} onClose={close} title={name} size="lg" footer={footer}>
      <Load q={q}>
        {() => (!a ? <Spinner /> : invite ? <Invited a={a} r={invite} /> : rejecting ? (
          <div className="space-y-3">
            <p className="text-body text-muted">{a.first_name} will be removed from Applicants. The application is kept for 6 months, then deleted.</p>
            <div className="rounded-2xl bg-bg px-4 py-2">
              <Toggle checked={sendEmail} onChange={setSendEmail} label="Send a polite email" hint={`Lets ${a.email} know we can't offer a role at this time`} />
            </div>
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap gap-1.5">
              <Pill tone="blue">Applied online {date(a.applied_at)}</Pill>
              {a.status === 'rejected' && <Pill tone="grey">Rejected {date(a.rejected_at)}</Pill>}
              {a.status === 'onboarding' && <Pill tone="green">In onboarding</Pill>}
              {(a.role_names || []).map((r) => <Pill key={r}>{r}</Pill>)}
            </div>

            {(a.flags || []).length > 0 && (
              <div className="mt-4 space-y-2">
                {(a.flags || []).map((f) => (
                  <div key={f.key} className={`flex items-start gap-2 rounded-2xl px-3.5 py-2.5 text-subhead ${f.severity === 'critical' ? 'bg-red-soft text-red' : 'bg-amber-soft text-amber'}`}>
                    <AlertTriangle size={18} className="mt-0.5 shrink-0" /><span>{f.text}</span>
                  </div>
                ))}
              </div>
            )}

            <Section title="Contact">
              <KV items={[
                ['Email', a.email], ['Mobile', a.phone], ['Postcode', a.postcode],
                ['Availability', [...(a.availability || []).map((x) => AVAIL[x] || x), a.availability_note].filter(Boolean).join(' · ')],
                ['Right to work', a.rtw_confirmed ? 'Confirmed by applicant (check at onboarding)' : 'Not confirmed'],
              ]} />
            </Section>

            <Section title="AI summary" action={!pending && <Button variant="link" size="sm" icon={RefreshCw} onClick={() => act(() => api('apply.reread', { officer_id: id }), 'Documents read again')}>Read again</Button>}>
              {pending ? (
                <p className="flex items-center gap-2 text-body text-muted"><Sparkles size={18} className="animate-pulse text-blue" />Reading the CV and SIA badge…</p>
              ) : a.ai_status === 'failed' ? (
                <p className="text-body text-muted">Not read yet: {a.ai_error || 'the reader had a problem'}.</p>
              ) : (
                <div className="space-y-3">
                  <p className="text-body">{a.ai?.cv?.summary || 'No summary — the CV could not be read.'}</p>
                  <KV items={[
                    ['Experience', a.ai?.cv?.years_experience != null ? `${a.ai.cv.years_experience} year${a.ai.cv.years_experience === 1 ? '' : 's'}` : null],
                    ['Recent employers', (a.ai?.cv?.employers || []).join(', ')],
                    ['Qualifications', (a.ai?.cv?.qualifications || []).join(', ')],
                  ]} />
                  <p className="text-caption text-faint">Read by AI {a.ai_at ? dateTime(a.ai_at) : ''}. Check the documents before deciding.</p>
                </div>
              )}
            </Section>

            <Section title="SIA licence">
              <KV items={[
                ['Number', siaFmt(a.ai?.badge?.number || a.sia_number)],
                ['Licence', (a.ai?.badge?.licence_types || []).join(', ')],
                ['Expires', a.ai?.badge?.expiry ? date(a.ai.badge.expiry) : null],
                ['Name on badge', a.ai?.badge?.name],
              ]} />
              {SIA_CHECK_ON && <div className="mt-3 flex flex-wrap items-center gap-2">
                <SiaVerifyButton o={{ id, sia_number: a.sia_number || a.ai?.badge?.number }} onSaved={q.reload} />
                <SiaCheckPill status={a.sia_status} at={a.sia_last_verified_at} by={a.sia_last_verified_by_name} />
              </div>}
            </Section>

            <Section title="Files">
              <List>
                {(a.docs || []).map((d) => (
                  <Row key={d.id} title={d.title} subtitle={d.mime || ''} left={<FileText size={20} className="text-blue" />} chevron
                    onClick={() => openUrl(() => api('docs.url', { id: d.id })).catch(() => {})} />
                ))}
              </List>
            </Section>
          </div>
        ))}
      </Load>
    </Sheet>
  );
}

function Invited({ a, r }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl bg-green-soft p-4 text-green"><ShieldCheck size={20} />
        <span className="text-body font-semibold">{a.first_name} is in onboarding{r.invite_link ? ` and an app login was emailed to ${a.email}` : ''}.</span>
      </div>
      {r.invite_link && <CopyLink link={r.invite_link} />}
      {r.invite_error && <p className="text-body text-muted">No app login was sent: {r.invite_error}. You can invite them from their profile.</p>}
      <p className="text-footnote text-muted">Their CV and SIA badge are on their Documents tab, and the SIA details from the badge are on their profile.</p>
    </div>
  );
}
