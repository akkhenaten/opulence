// Give or extend a grace period: an officer who can't work (compliance) keeps working for up to 14 days while they send
// their documents. Company managers only; renewable twice; anything about an expired licence or right to work needs a tick.
import { useState } from 'react';
import { api } from '../../api.js';
import { CalendarClock } from 'lucide-react';
import { addDays, Button, Callout, Check, date, Input, isoDate, Segmented, Sheet, Textarea, useAction, useToast } from '../../ui/index.jsx';

export const GRACE_LABEL = {
  sia_missing: 'No SIA licence on file', sia_expired: 'SIA licence expired', sia_register: 'SIA register shows a problem',
  rtw_unverified: 'Right to work not verified', rtw_expired: 'Right to work expired', sia_expiry_shift: 'SIA licence runs out during the grace',
};
const RISKY = ['sia_expired', 'sia_register', 'rtw_expired', 'sia_expiry_shift'];
// Orb card issues a grace period can cover (licence and right to work)
export const GRACE_ISSUE = /^(missing:sia|register:sia|unverified:rtw|expiry_soon:(sia|rtw)|expiry_shift:(sia|rtw)|grace_expired)$/;

/** compliance.grace.history → { keys, grace (open), lapsed (ran out, documents still missing), maxDays, maxRenewals } */
export function graceFromHistory(d) {
  const grace = d.graces.find((g) => !g.ended_at) || null;
  const lapsed = !grace && d.graces[0]?.end_reason === 'expired' ? d.graces[0] : null;
  return { keys: d.keys, grace, lapsed, maxDays: d.max_days, maxRenewals: d.max_renewals };
}

/** What the button does next: extend the open grace, extend the one that ran out, give a new one, or nothing */
export function graceNext({ keys = [], grace, lapsed, maxRenewals = 2 }) {
  if (grace) return grace.renewals < maxRenewals ? { mode: 'renew', grace, label: 'Extend grace period' } : null;
  if (lapsed && keys.length && lapsed.renewals < maxRenewals) return { mode: 'renew', grace: lapsed, label: 'Extend grace period' };
  if (keys.length) return { mode: 'grant', label: 'Give grace period' };
  return null;
}

/** Grace period on an SIA / right to work card (company managers). With state it knows its label up front; without, it looks the officer up on tap. */
export function GraceButton({ officer, state, onDone, size = 'sm', variant = 'soft', label }) {
  const [open, setOpen] = useState(null);
  const [run, busy] = useAction();
  const toast = useToast();
  const known = state && graceNext(state);
  if (state && !known) return null;
  const click = () => (state ? setOpen({ s: state, next: known }) : run(() => api('compliance.grace.history', { officer_id: officer.id })).then((d) => {
    const s = graceFromHistory(d);
    const next = graceNext(s);
    if (next) setOpen({ s, next });
    else toast(s.grace ? `Already extended ${s.maxRenewals} times` : 'Nothing for a grace period to cover: they can already work');
  }).catch(() => {}));
  return (
    <>
      <Button size={size} variant={variant} icon={CalendarClock} busy={busy} onClick={click}>{label || known?.label || 'Grace period'}</Button>
      {open && <GraceSheet officer={officer} mode={open.next.mode} grace={open.next.grace} keys={open.s.keys} maxDays={open.s.maxDays} maxRenewals={open.s.maxRenewals}
        onClose={() => setOpen(null)} onDone={onDone} />}
    </>
  );
}

/** mode 'grant' (keys = what can be covered) or 'renew' (grace = the open or just-lapsed one) */
export default function GraceSheet({ officer, mode = 'grant', keys = [], grace, maxDays = 14, maxRenewals = 2, onClose, onDone }) {
  const renew = mode === 'renew';
  const from = renew && grace?.ends_on > isoDate() ? grace.ends_on : isoDate();
  const [len, setLen] = useState('7');
  const [pick, setPick] = useState(addDays(from, 7));
  const [covers, setCovers] = useState(renew ? [] : keys);
  const [reason, setReason] = useState('');
  const [ack, setAck] = useState(false);
  const [run, busy] = useAction();

  const ends = len === 'pick' ? pick : addDays(from, Number(len));
  const all = renew ? [...(grace?.covers || []), ...covers] : covers;
  const risky = all.some((k) => RISKY.includes(k)) && !(renew && grace?.risk_ack && !covers.some((k) => RISKY.includes(k)));
  const extra = renew ? keys.filter((k) => !grace?.covers?.includes(k)) : keys;
  const tooLong = ends > addDays(from, maxDays) || ends < from;
  const ok = reason.trim().length >= 5 && !tooLong && (renew || covers.length) && (!risky || ack);
  const name = officer.name || `${officer.first_name} ${officer.last_name}`;

  const save = () => run(() => api(renew ? 'compliance.grace.renew' : 'compliance.grace.grant', {
    officer_id: officer.id, ends_on: ends, reason: reason.trim(), risk_ack: ack, ...(renew ? { add: covers } : { covers }),
  }), `${name} can work until ${date(ends)}`).then(() => { onDone?.(); onClose(); }).catch(() => {});

  return (
    <Sheet open onClose={onClose} title={renew ? `Extend ${name}'s grace period` : `Give ${name} a grace period`} dirty={!!reason}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!ok} onClick={save}>{renew ? 'Extend' : 'Give grace period'}</Button></>}>
      <div className="space-y-4">
        <p className="text-subhead text-muted">
          {renew
            ? `Renewal ${(grace?.renewals || 0) + 1} of ${maxRenewals}. They keep working until the new date; Orb reminds them 3 days and 1 day before.`
            : 'They can clock in and be rostered until the end date. Orb asks them for the documents, reminds them 3 days and 1 day before, and closes the grace by itself once the documents are in.'}
        </p>

        {(renew ? extra.length > 0 : true) && (
          <div>
            <div className="mb-1.5 text-footnote font-semibold text-muted">{renew ? 'Also cover' : 'What it covers'}</div>
            {renew && <p className="mb-2 text-footnote text-muted">Already covers: {grace.covers.map((k) => GRACE_LABEL[k] || k).join(', ')}</p>}
            <div className="space-y-2">
              {extra.map((k) => (
                <label key={k} className="flex cursor-pointer items-center gap-3 rounded-2xl bg-bg px-3 py-2.5">
                  <Check checked={covers.includes(k)} onChange={(v) => setCovers((c) => (v ? [...c, k] : c.filter((x) => x !== k)))} label={GRACE_LABEL[k] || k} />
                  <span className="text-subhead">{GRACE_LABEL[k] || k}</span>
                </label>
              ))}
              {!extra.length && <p className="text-subhead text-muted">Nothing a grace period can cover. Not active staff can't be given one.</p>}
            </div>
          </div>
        )}

        <div>
          <div className="mb-1.5 text-footnote font-semibold text-muted">{renew ? 'Extend by' : 'How long'}</div>
          <Segmented value={len} onChange={setLen} options={[{ value: '7', label: '7 days' }, { value: '14', label: '14 days' }, { value: 'pick', label: 'Pick a date' }]} />
          {len === 'pick' && <Input className="mt-2" label="Last day" type="date" min={from} max={addDays(from, maxDays)} value={pick} onChange={(e) => setPick(e.target.value)}
            error={tooLong ? `At most ${maxDays} days from ${date(from)}` : undefined} />}
          <p className="mt-2 text-footnote text-muted">They can work up to and including {date(ends)}.</p>
        </div>

        <Textarea label="Reason" rows={2} placeholder="e.g. Renewal applied for, waiting on the SIA" value={reason} onChange={(e) => setReason(e.target.value)}
          hint="Kept in the audit trail and the officer's history." />

        {risky && (
          <Callout tone="danger" title="This lets them work without a valid licence or right to work">
            <p>If they work without a valid SIA licence or right to work, the company can be fined or prosecuted. Only go ahead if you have good reason to believe it is being sorted.</p>
            <label className="mt-2 flex cursor-pointer items-center gap-3">
              <Check checked={ack} onChange={setAck} label="I accept the risk" />
              <span className="font-semibold">I understand and accept the risk</span>
            </label>
          </Callout>
        )}
      </div>
    </Sheet>
  );
}
