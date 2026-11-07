// Staff setup (platform admin only, checked on the server too): the one-off shared link officers use to send their
// own details, and the submissions waiting to become staff profiles — by hand here, or by asking Orb.
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Eye, FileText, RefreshCw, Sparkles, Trash2, UserPlus } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Avatar, Button, Callout, date, dateTime, Empty, KV, List, Load, Page, Pill, Row, Section, Sheet, SkeletonRows, Toggle, useAction, useApi, useConfirm,
} from '../../ui/index.jsx';
import { CopyLink, openUrl } from './_parts.jsx';

const siaFmt = (n) => String(n || '').replace(/(\d{4})(?=\d)/g, '$1 ');
const mask = (s) => (s ? `•••• ${String(s).slice(-2)}` : '');

export default function StaffSetup() {
  const { user } = useAuth();
  const link = useApi('staffSetup.link');
  const list = useApi('staffSetup.list');
  const [open, setOpen] = useState(null);
  if (!user.platform) return <Navigate to={`/${user.role}`} replace />;
  const reload = () => { link.reload(); list.reload(); };
  return (
    <Page title="Staff setup" subtitle="Only you can see this — platform admin">
      <LinkCard q={link} onChange={reload} />
      <Callout icon={Sparkles} className="mt-4">Ask Orb: “Create profiles for the staff setup submissions”. Each one shows on a card for you to confirm.</Callout>
      <Section title={`Waiting${list.data?.length ? ` · ${list.data.length}` : ''}`}>
        <Load q={list} skeleton="rows" n={3}>
          {(rows) => (rows.length ? (
            <List>
              {rows.map((s) => (
                <Row key={s.id} onClick={() => setOpen(s.id)} chevron left={<Avatar name={s.name} size={36} />}
                  title={s.name}
                  subtitle={[s.sia_number ? `SIA ${siaFmt(s.sia_number)}` : 'No SIA number', `sent ${date(s.created_at)}`].join(' · ')}
                  right={s.duplicate && <Pill tone="amber">Possible duplicate</Pill>} />
              ))}
            </List>
          ) : <Empty icon={UserPlus} title="Nothing waiting" body="When officers send the form, their details show here." />)}
        </Load>
      </Section>
      <SubmissionSheet id={open} onClose={() => setOpen(null)} onDone={reload} />
    </Page>
  );
}

function LinkCard({ q, onChange }) {
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const l = q.data?.link;
  const toggle = (on) => run(() => api('staffSetup.toggle', { enabled: on }), on ? 'Link switched on' : 'Link switched off').then(onChange).catch(() => {});
  const rotate = async () => {
    if (!(await confirm({ title: 'Replace the link?', body: 'The old link stops working straight away. Officers who still have it will see that the form is closed.', confirm: 'Replace link', danger: true }))) return;
    run(() => api('staffSetup.rotate'), 'New link ready').then(onChange).catch(() => {});
  };
  if (!q.data) return <SkeletonRows n={1} />;
  return (
    <div className="space-y-3 rounded-tile bg-surface p-5 shadow-tile">
      <Toggle checked={!!l?.enabled} onChange={toggle} label="Staff details link"
        hint={l?.enabled ? `On · ${q.data.waiting} waiting` : 'Off — switch it on to get a link to send to officers'} />
      {l?.enabled && (
        <>
          <CopyLink link={`/app/staff-form/${l.token}`} label="Shared link" hint="Send this to every officer, by WhatsApp or email." />
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
  const s = q.data;
  const d = s?.details || {};
  const close = () => { onClose(); setTimeout(() => setShow(false), 300); };
  const done = () => { onDone(); close(); };
  const create = () => run(() => api('staffSetup.create', { id }), (r) => `${r.name} added to Staff`).then(done).catch(() => {});
  const discard = async () => {
    if (!(await confirm({ title: 'Discard these details?', body: 'The submission and its files are deleted.', confirm: 'Discard', danger: true }))) return;
    run(() => api('staffSetup.discard', { id }), 'Discarded').then(done).catch(() => {});
  };
  const priv = (v) => (show ? v : mask(v));
  return (
    <Sheet open={!!id} onClose={close} title={s?.name || 'Staff details'} size="lg"
      footer={s && <>
        <Button variant="secondary" icon={Trash2} onClick={discard} disabled={busy}>Discard</Button>
        <Button icon={UserPlus} busy={busy} onClick={create}>Create profile</Button>
      </>}>
      <Load q={q}>
        {() => (
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
            <p className="text-caption text-muted">Create profile adds them to Staff as active, with no login invite. Documents arrive unverified.</p>
          </div>
        )}
      </Load>
    </Sheet>
  );
}
