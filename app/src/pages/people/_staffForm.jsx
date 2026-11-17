// New staff forms: the details people sent through the shared staff link. Officers' forms are checked here by a
// company manager (or the platform admin) and made live in one tap — an active staff profile and their Officer app
// login with the password they set. Venue managers' forms stay with the platform admin (Staff setup).
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Eye, FileText, Send, Trash2, UserCheck, UserPlus } from 'lucide-react';
import { api } from '../../api.js';
import {
  Avatar, Button, Callout, Chips, date, dateTime, Empty, KV, List, Load, Pill, Row, Sheet, useAction, useApi, useConfirm, useUrlState,
} from '../../ui/index.jsx';
import { CopyLink, openUrl } from './_parts.jsx';

export const siaFmt = (n) => String(n || '').replace(/(\d{4})(?=\d)/g, '$1 ');
const mask = (s) => (s ? `•••• ${String(s).slice(-2)}` : '');
const shareFmt = (c) => String(c || '').replace(/^(\w{3})(\w{3})(\w{3})$/, '$1 $2 $3');

/** What still stands between this form and working shifts once it is live (the same checks as the rota) */
export function stillNeeded(d, files) {
  const has = (k) => files.some((f) => f.kind === k);
  const out = [];
  if (!d.sia_number || !d.sia_expiry) out.push('SIA licence number and expiry');
  else if (d.sia_expiry < new Date().toISOString().slice(0, 10)) out.push('an SIA licence in date');
  out.push(d.rtw_share_code ? 'right to work checked on GOV.UK' : has('rtw') ? 'right to work checked (Orb reads the passport)' : 'right to work: no share code or passport sent');
  return out;
}

function Section({ title, children }) {
  return (
    <div>
      <div className="mb-2 text-footnote font-semibold uppercase tracking-wide text-muted">{title}</div>
      {children}
    </div>
  );
}

function Files({ files, kinds }) {
  const list = files.filter((f) => kinds.includes(f.kind));
  if (!list.length) return <p className="mt-2 text-callout text-muted">No files sent.</p>;
  return (
    <List className="mt-2">
      {list.map((f) => <Row key={f.kind} left={<FileText size={20} className="text-blue" />} title={f.title} onClick={() => openUrl(async () => ({ url: f.url }))} chevron />)}
    </List>
  );
}

/** One form: officers are made live in one tap; venue managers become a login (platform admin) */
export function StaffFormSheet({ id, onClose, onDone, base = '/company' }) {
  const q = useApi('staffSetup.get', { id }, { skip: !id });
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const nav = useNavigate();
  const [show, setShow] = useState(false);
  const [venues, setVenues] = useState(null);
  const [sent, setSent] = useState(null);
  const [gone, setGone] = useState(null); // made live by someone else meanwhile: { officer_id }
  const s = q.data;
  const d = s?.details || {};
  const venue = s?.kind === 'venue';
  const picked = venues ?? s?.matched ?? [];
  const reset = () => setTimeout(() => { setShow(false); setVenues(null); setSent(null); setGone(null); }, 300);
  const close = () => { if (sent || gone) onDone(); onClose(); reset(); };
  const done = () => { onDone(); onClose(); reset(); };
  const page = (oid, tab) => nav(`${base}/staff/${oid}${tab ? `?tab=${tab}` : ''}`);
  const taken = (e) => {
    if (e?.status === 409 && /already made live/i.test(e.message)) setGone({ officer_id: e.data?.officer_id || null });
  };

  const makeLive = () => run(() => api('staffSetup.create', { id }),
    (r) => (r.invited ? `${r.name} is live — ${r.emailed ? 'invite emailed' : "invite didn't send, share it from their Access tab"}` : `${r.name} is live`))
    .then((r) => {
      // Orb reads their SIA card and passport now, so SIA and right to work can be ticked without a manager step
      api('docs.read', { officer_id: r.id }).catch(() => {});
      onDone();
      onClose();
      reset();
      page(r.id, 'compliance');
    }).catch(taken);
  const createVenue = (invite) => run(() => api('staffSetup.create', { id, venue_ids: picked, ...(invite && { invite: true }) }),
    (r) => (!invite ? `${r.name} added as a Venue Manager` : `${r.name} added as a Venue Manager — ${r.emailed ? 'invite sent' : 'invite not sent'}`))
    .then((r) => (invite ? setSent(r) : done())).catch(() => {});
  const discard = async () => {
    if (!(await confirm({ title: 'Discard this form?', body: 'The form, its files and the password they set are deleted.', confirm: 'Discard', danger: true }))) return;
    run(() => api('staffSetup.discard', { id }), 'Discarded').then(done).catch(() => {});
  };
  const priv = (v) => (show ? v : mask(v));

  const footer = sent || gone ? <Button onClick={close}>Done</Button> : s && (venue ? <>
    <Button variant="secondary" icon={Trash2} onClick={discard} disabled={busy}>Discard</Button>
    <Button variant="secondary" icon={UserPlus} busy={busy} onClick={() => createVenue(false)} disabled={!picked.length}>Create login</Button>
    <Button icon={Send} busy={busy} onClick={() => createVenue(true)} disabled={!picked.length}>Create and send invite</Button>
  </> : <>
    <Button variant="secondary" icon={Trash2} onClick={discard} disabled={busy}>Discard</Button>
    <Button icon={UserCheck} busy={busy} onClick={makeLive}>Make live</Button>
  </>);

  return (
    <Sheet open={!!id} onClose={close} title={s?.name || 'Staff form'} size="lg" footer={footer}>
      {gone ? (
        <Callout tone="success" title="Already made live" action={gone.officer_id && <Button size="sm" variant="secondary" onClick={() => { close(); page(gone.officer_id); }}>Open their page</Button>}>
          Someone else in the office made this person live a moment ago.
        </Callout>
      ) : sent ? <Sent r={sent} /> : (
        <Load q={q}>
          {() => (venue ? (
            <div className="space-y-5">
              {s.duplicate && <Callout tone="warning">{s.duplicate.name} already has a login with this email ({s.duplicate.status}). Discard this one, or change their access on their page in Staff → People.</Callout>}
              <KV items={[
                ['Name', `${d.first_name} ${d.last_name}${d.goes_by ? ` (${d.goes_by})` : ''}`],
                ['Job title', d.job_title || '—'],
                ['Email', d.email], ['Mobile', d.phone],
                [d.venue_names?.length > 1 ? 'Venues they wrote' : 'Venue they wrote', (d.venue_names?.length ? d.venue_names : [d.venue_name]).filter(Boolean).join(', ') || '—'],
                ['Sent', dateTime(s.created_at)],
              ]} />
              {s.files.find((f) => f.kind === 'photo') && (
                <img src={s.files.find((f) => f.kind === 'photo').url} alt={`${s.name}'s profile photo`} className="h-24 w-24 rounded-full object-cover" />
              )}
              <Chips label="Link them to" options={(s.venues || []).map((x) => ({ value: x.id, label: x.name }))} value={picked} onChange={setVenues} />
              {!picked.length && <p className="text-caption text-muted">Their venue name didn't match one of yours. Pick it above; if it isn't there yet, add it in Venues first.</p>}
              <p className="text-caption text-muted">Create login adds them as a Venue Manager for these venues, with their photo and no email; send the invite later from their Access tab in Staff → People. Create and send invite also emails them a link to set their password.</p>
            </div>
          ) : (
            <OfficerForm s={s} d={d} show={show} setShow={setShow} priv={priv} onOpen={(oid) => { close(); page(oid); }} />
          ))}
        </Load>
      )}
    </Sheet>
  );
}

function OfficerForm({ s, d, show, setShow, priv, onOpen }) {
  const need = stillNeeded(d, s.files);
  return (
    <div className="space-y-5">
      {s.duplicate && (
        <Callout tone="warning" title={`Possibly already on your staff: ${s.duplicate.name}`}
          action={<Button size="sm" variant="secondary" onClick={() => onOpen(s.duplicate.id)}>Open their page</Button>}>
          The email or SIA number matches someone on file ({s.duplicate.status}). Make live stops if it does.
        </Callout>
      )}
      <Callout tone={need.length ? 'info' : 'success'} title={need.length ? "Can sign in once live, can't be rostered until:" : 'Ready to work once live'}>
        {need.length > 0 && <ul className="list-disc pl-5">{need.map((n) => <li key={n}>{n}</li>)}</ul>}
      </Callout>
      {!s.has_password && <Callout tone="warning">This form was sent before staff set a password on it. Make live emails them an invite link to set one.</Callout>}

      <Section title="You">
        <KV items={[
          ['Name', `${d.first_name} ${d.last_name}${d.goes_by ? ` (known as ${d.goes_by})` : ''}`],
          ['Date of birth', d.dob ? (show ? date(d.dob) : '••••') : '—'],
        ]} />
      </Section>
      <Section title="Contact">
        <KV items={[['Email', `${d.email}${s.has_password ? ' — they sign in with this' : ''}`], ['Mobile', d.phone], ['Address', [d.address, d.postcode].filter(Boolean).join(', ')]]} />
      </Section>
      <Section title="SIA licence">
        <KV items={[['Number', d.sia_number ? siaFmt(d.sia_number) : '—'], ['Expires', d.sia_expiry ? date(d.sia_expiry) : '—']]} />
        <Files files={s.files} kinds={['sia_front', 'sia_back']} />
      </Section>
      <Section title="Right to work">
        <KV items={[['Share code', d.rtw_share_code ? shareFmt(d.rtw_share_code) : '—']]} />
        {d.rtw_share_code && (
          <a href="https://www.gov.uk/view-right-to-work" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-subhead font-semibold text-blue">
            Check on GOV.UK <ExternalLink size={14} />
          </a>
        )}
        <Files files={s.files} kinds={['rtw']} />
      </Section>
      <Section title="Pay">
        <div className="-mt-1 mb-1 flex justify-end">
          <Button variant="plain" size="sm" icon={Eye} onClick={() => setShow((x) => !x)}>{show ? 'Hide' : 'Show'}</Button>
        </div>
        <KV items={[
          ['NI number', d.ni_number ? priv(d.ni_number) : '—'],
          ['Bank', d.bank_name || '—'],
          ['Sort code / account', d.bank_account ? `${priv(d.bank_sort_code)} · ${priv(d.bank_account)}` : '—'],
        ]} />
      </Section>
      <Section title="Emergency contact">
        <KV items={[['Contact', d.ec_name ? `${d.ec_name}${d.ec_relationship ? ` (${d.ec_relationship})` : ''} · ${d.ec_phone}` : '—']]} />
      </Section>
      <Section title="Other documents">
        <Files files={s.files} kinds={['poa', 'photo']} />
      </Section>
      <p className="text-caption text-muted">
        Sent {dateTime(s.created_at)}. Make live adds them to Staff as active with each answer in its section, {s.has_password ? 'turns on their Officer app login with the password they set, and emails them that they can sign in' : 'and emails them an invite to set a password'}. Orb then reads their SIA card and passport.
      </p>
    </div>
  );
}

// After Create and send invite (venue managers): the invite link to share, and what to do if the email didn't happen
function Sent({ r }) {
  return (
    <div className="space-y-4">
      {r.invite_error ? (
        <Callout tone="warning">{r.name} was added, but no invite went out: {r.invite_error} Sort it out from their Access tab in Staff → People.</Callout>
      ) : (
        <>
          <Callout tone={r.emailed ? 'success' : 'warning'}>
            {r.emailed ? `${r.name} was added and emailed a link to set their password.` : `${r.name} was added, but the email didn't send. Share this link with them instead.`}
          </Callout>
          <CopyLink link={r.invite_link} hint={r.emailed ? 'Already emailed. Copy it to send by WhatsApp or text too.' : undefined} />
          <p className="text-caption text-muted">The link works once. Until they use it, you can send it again from their Access tab with Resend invite.</p>
        </>
      )}
    </div>
  );
}

/** People: "N new staff forms to check", the list behind it (?forms=1) and one form (?form=<id>, from the bell) */
export function StaffForms({ base = '/company' }) {
  const list = useApi('staffSetup.list');
  const [url, setUrl] = useUrlState({ forms: '', form: '' });
  const forms = (list.data || []).filter((s) => (s.kind || 'officer') === 'officer');
  const n = forms.length;
  const listOpen = url.forms === '1';
  const close = () => setUrl({ form: null });
  return (
    <>
      {n > 0 && (
        <Callout icon={UserPlus} className="mb-4" title={`${n} new staff ${n === 1 ? 'form' : 'forms'} to check`}
          action={<Button size="sm" onClick={() => (n === 1 ? setUrl({ form: forms[0].id }) : setUrl({ forms: '1' }))}>{n === 1 ? 'Check it' : 'Check them'}</Button>}>
          {n === 1 ? `${forms[0].name} sent their details.` : 'They sent their details through the staff link.'} Check and make them live — they sign in with the password they set.
        </Callout>
      )}
      <Sheet open={listOpen} onClose={() => setUrl({ forms: null })} title="New staff forms" size="md">
        <Load q={list} skeleton="rows" n={3}>
          {() => (n ? (
            <List>
              {forms.map((s) => (
                <Row key={s.id} onClick={() => setUrl({ forms: null, form: s.id })} chevron left={<Avatar name={s.name} size={36} />}
                  title={s.name}
                  subtitle={[s.sia_number ? `SIA ${siaFmt(s.sia_number)}` : 'No SIA number', `sent ${date(s.created_at)}`].join(' · ')}
                  right={s.duplicate && <Pill tone="amber">Possible duplicate</Pill>} />
              ))}
            </List>
          ) : <Empty icon={UserPlus} title="Nothing waiting" body="When staff send the form, their details show here." />)}
        </Load>
      </Sheet>
      <StaffFormSheet id={url.form || null} onClose={close} onDone={list.reload} base={base} />
    </>
  );
}
