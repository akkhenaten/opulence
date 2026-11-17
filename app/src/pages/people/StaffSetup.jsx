// Staff setup (platform admin only, checked on the server too): the one-off shared links officers and venue managers
// use to send their own details, and the submissions waiting to become staff profiles or Venue Manager logins —
// by hand here, or by asking Orb.
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Eye, FileText, RefreshCw, Send, Sparkles, Store, Trash2, UserPlus } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Avatar, Button, Callout, Chips, date, dateTime, Empty, KV, List, Load, Page, Pill, Row, Section, Sheet, SkeletonRows, Toggle, useAction, useApi, useConfirm,
} from '../../ui/index.jsx';
import { CopyLink, openUrl } from './_parts.jsx';

const siaFmt = (n) => String(n || '').replace(/(\d{4})(?=\d)/g, '$1 ');
const mask = (s) => (s ? `•••• ${String(s).slice(-2)}` : '');

export default function StaffSetup() {
  const { user } = useAuth();
  const link = useApi('staffSetup.link');
  const venueLink = useApi('staffSetup.link', { kind: 'venue' });
  const list = useApi('staffSetup.list');
  const [open, setOpen] = useState(null);
  if (!user.platform) return <Navigate to={`/${user.role}`} replace />;
  const reload = () => { link.reload(); venueLink.reload(); list.reload(); };
  const of = (kind) => (list.data || []).filter((s) => (s.kind || 'officer') === kind);
  return (
    <Page title="Staff setup" subtitle="Only you can see this — platform admin">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <LinkCard q={link} onChange={reload} label="Officers link" />
        <LinkCard q={venueLink} onChange={reload} kind="venue" label="Venue managers link" />
      </div>
      <Callout icon={Sparkles} className="mt-4">Ask Orb: “Set up the staff setup submissions”. Each one shows on a card for you to confirm.</Callout>
      <Section title="Officers" icon={UserPlus} count={of('officer').length}>
        <Load q={list} skeleton="rows" n={3}>
          {() => (of('officer').length ? (
            <List>
              {of('officer').map((s) => (
                <Row key={s.id} onClick={() => setOpen(s.id)} chevron left={<Avatar name={s.name} size={36} />}
                  title={s.name}
                  subtitle={[s.sia_number ? `SIA ${siaFmt(s.sia_number)}` : 'No SIA number', `sent ${date(s.created_at)}`].join(' · ')}
                  right={s.duplicate && <Pill tone="amber">Possible duplicate</Pill>} />
              ))}
            </List>
          ) : <Empty icon={UserPlus} title="Nothing waiting" body="When officers send the form, their details show here." />)}
        </Load>
      </Section>
      <Section title="Venue managers" icon={Store} count={of('venue').length}>
        <Load q={list} skeleton="rows" n={2}>
          {() => (of('venue').length ? (
            <List>
              {of('venue').map((s) => (
                <Row key={s.id} onClick={() => setOpen(s.id)} chevron left={<Avatar name={s.name} size={36} />}
                  title={s.name}
                  subtitle={[s.venue_name || '—', `sent ${date(s.created_at)}`].join(' · ')}
                  right={s.duplicate ? <Pill tone="amber">Already has a login</Pill> : !s.venues?.length && <Pill tone="amber">Pick venue</Pill>} />
              ))}
            </List>
          ) : <Empty icon={Store} title="Nothing waiting" body="When venue managers send the form, their details show here." />)}
        </Load>
      </Section>
      <SubmissionSheet id={open} onClose={() => setOpen(null)} onDone={reload} />
    </Page>
  );
}

function LinkCard({ q, onChange, kind = 'officer', label }) {
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const l = q.data?.link;
  const toggle = (on) => run(() => api('staffSetup.toggle', { enabled: on, kind }), on ? 'Link switched on' : 'Link switched off').then(onChange).catch(() => {});
  const rotate = async () => {
    if (!(await confirm({ title: 'Replace the link?', body: `The old link stops working straight away. ${kind === 'venue' ? 'Venue managers' : 'Officers'} who still have it will see that the form is closed.`, confirm: 'Replace link', danger: true }))) return;
    run(() => api('staffSetup.rotate', { kind }), 'New link ready').then(onChange).catch(() => {});
  };
  if (!q.data) return <SkeletonRows n={1} />;
  return (
    <div className="space-y-3 rounded-tile bg-surface p-5 shadow-tile">
      <Toggle checked={!!l?.enabled} onChange={toggle} label={label}
        hint={l?.enabled ? `On · ${q.data.waiting} waiting` : `Off — switch it on to get a link to send to ${kind === 'venue' ? 'venue managers' : 'officers'}`} />
      {l?.enabled && (
        <>
          <CopyLink link={`/app/staff-form/${l.token}`} label="Shared link" hint={`Send this to every ${kind === 'venue' ? 'venue manager' : 'officer'}, by WhatsApp or email.`} />
          <div className="flex justify-end"><Button variant="secondary" size="sm" icon={RefreshCw} busy={busy} onClick={rotate}>Replace link</Button></div>
        </>
      )}
    </div>
  );
}

function SubmissionSheet({ id, onClose, onDone }) {
  const q = useApi('staffSetup.get', { id }, { skip: !id });
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const [show, setShow] = useState(false);
  const [venues, setVenues] = useState(null);
  const [sent, setSent] = useState(null);
  const s = q.data;
  const d = s?.details || {};
  const venue = s?.kind === 'venue';
  const picked = venues ?? s?.matched ?? [];
  const close = () => { if (sent) onDone(); onClose(); setTimeout(() => { setShow(false); setVenues(null); setSent(null); }, 300); };
  const done = () => { onDone(); close(); };
  const added = (r) => (r.kind === 'venue' ? `${r.name} added as a Venue Manager` : `${r.name} added to Staff`);
  const create = (invite) => run(() => api('staffSetup.create', { id, ...(venue && { venue_ids: picked }), ...(invite && { invite: true }) }),
    (r) => (!invite ? added(r) : r.emailed ? `${added(r)} — invite sent` : `${added(r)} — invite not sent`))
    .then((r) => {
      // Orb reads their SIA card and passport now, so the new profile is filled in without a manager step
      if (!venue && r.id) api('docs.read', { officer_id: r.id }).catch(() => {});
      return invite ? setSent(r) : done();
    }).catch(() => {});
  const discard = async () => {
    if (!(await confirm({ title: 'Discard these details?', body: 'The submission and its files are deleted.', confirm: 'Discard', danger: true }))) return;
    run(() => api('staffSetup.discard', { id }), 'Discarded').then(done).catch(() => {});
  };
  const priv = (v) => (show ? v : mask(v));
  return (
    <Sheet open={!!id} onClose={close} title={s?.name || 'Staff details'} size="lg"
      footer={sent ? <Button onClick={close}>Done</Button> : s && <>
        <Button variant="secondary" icon={Trash2} onClick={discard} disabled={busy}>Discard</Button>
        <Button variant="secondary" icon={UserPlus} busy={busy} onClick={() => create(false)} disabled={venue && !picked.length}>{venue ? 'Create login' : 'Create profile'}</Button>
        <Button icon={Send} busy={busy} onClick={() => create(true)} disabled={venue && !picked.length}>Create and send invite</Button>
      </>}>
      {sent ? <Sent r={sent} /> : <Load q={q}>
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
          <div className="space-y-5">
            {s.duplicate && <Callout tone="warning">Possibly already on your staff: {s.duplicate.name} ({s.duplicate.status}). Creating a profile will stop if the email or SIA number matches.</Callout>}
            <KV items={[
              ['Name', `${d.first_name} ${d.last_name}${d.goes_by ? ` (${d.goes_by})` : ''}`],
              ['Email', d.email], ['Mobile', d.phone],
              ['Address', [d.address, d.postcode].filter(Boolean).join(', ')],
              ['SIA licence', d.sia_number ? `${siaFmt(d.sia_number)}${d.sia_expiry ? ` · expires ${date(d.sia_expiry)}` : ''}` : '—'],
              ['Emergency contact', d.ec_name ? `${d.ec_name}${d.ec_relationship ? ` (${d.ec_relationship})` : ''} · ${d.ec_phone}` : '—'],
              ['Sent', dateTime(s.created_at)],
            ]} />
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-footnote font-semibold uppercase tracking-wide text-muted">Private details</span>
                <Button variant="plain" size="sm" icon={Eye} onClick={() => setShow((x) => !x)}>{show ? 'Hide' : 'Show'}</Button>
              </div>
              <KV items={[
                ['Date of birth', d.dob ? (show ? date(d.dob) : '••••') : '—'],
                ['NI number', d.ni_number ? priv(d.ni_number) : '—'],
                ['Bank', d.bank_name || '—'],
                ['Sort code / account', d.bank_account ? `${priv(d.bank_sort_code)} · ${priv(d.bank_account)}` : '—'],
              ]} />
            </div>
            <div>
              <div className="mb-2 text-footnote font-semibold uppercase tracking-wide text-muted">Documents</div>
              {s.files.length ? (
                <List>
                  {s.files.map((f) => <Row key={f.kind} left={<FileText size={20} className="text-blue" />} title={f.title} onClick={() => openUrl(async () => ({ url: f.url }))} chevron />)}
                </List>
              ) : <p className="text-callout text-muted">No files sent.</p>}
            </div>
            <p className="text-caption text-muted">Create profile adds them to Staff as active, with no login invite. Create and send invite also emails them a link to set up the app. Documents arrive unverified.</p>
          </div>
        ))}
      </Load>}
    </Sheet>
  );
}

// After Create and send invite: the invite link to share, and what to do if the email or the login didn't happen
function Sent({ r }) {
  const where = r.kind === 'venue' ? 'their Access tab in Staff → People' : 'their profile in Staff → People';
  return (
    <div className="space-y-4">
      {r.invite_error ? (
        <Callout tone="warning">{r.name} was added, but no invite went out: {r.invite_error} Sort it out from {where}.</Callout>
      ) : (
        <>
          <Callout tone={r.emailed ? 'success' : 'warning'}>
            {r.emailed ? `${r.name} was added and emailed a link to set their password.` : `${r.name} was added, but the email didn't send. Share this link with them instead.`}
          </Callout>
          <CopyLink link={r.invite_link} hint={r.emailed ? 'Already emailed. Copy it to send by WhatsApp or text too.' : undefined} />
          <p className="text-caption text-muted">The link works once. Until they use it, you can send it again from {where} with Resend invite.</p>
        </>
      )}
    </div>
  );
}
