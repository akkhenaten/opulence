// Staff setup (platform admin only, checked on the server too): the one-off shared links officers and venue managers
// use to send their own details, and the forms waiting. Both kinds are also in People for company managers, who make
// them live in one tap (a Venue manager login with the password they set, for venue managers), here or by asking Orb.
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { RefreshCw, Sparkles, Store, UserPlus } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Avatar, Button, Callout, date, Empty, List, Load, Page, Pill, Row, Section, SkeletonRows, Toggle, useAction, useApi, useConfirm,
} from '../../ui/index.jsx';
import { CopyLink } from './_parts.jsx';
import { StaffFormSheet, siaFmt } from './_staffForm.jsx';

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
      <Callout icon={Sparkles} className="mt-4">Officers' and venue managers' forms also show in Staff → People for company managers, who check them and tap Make live. A form that matches someone already on file opens that person instead. Or ask Orb: “Set up the staff setup submissions”.</Callout>
      <Section title="Officers" icon={UserPlus} count={of('officer').length}>
        <Load q={list} skeleton="rows" n={3}>
          {() => (of('officer').length ? (
            <List>
              {of('officer').map((s) => (
                <Row key={s.id} onClick={() => setOpen(s.id)} chevron left={<Avatar name={s.name} size={36} />}
                  title={s.name}
                  subtitle={[s.sia_number ? `SIA ${siaFmt(s.sia_number)}` : 'No SIA number', `sent ${date(s.created_at)}`].join(' · ')}
                  right={s.duplicate && <Pill tone="amber">Already on file: {s.duplicate.name}</Pill>} />
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
                  subtitle={[(s.venue_names?.length ? s.venue_names : [s.venue_name]).filter(Boolean).join(', ') || '—', `sent ${date(s.created_at)}`].join(' · ')}
                  right={s.duplicate ? <Pill tone="amber">Already on file: {s.duplicate.name}</Pill> : !s.venues?.length && <Pill tone="amber">Pick venue</Pill>} />
              ))}
            </List>
          ) : <Empty icon={Store} title="Nothing waiting" body="When venue managers send the form, their details show here." />)}
        </Load>
      </Section>
      <StaffFormSheet id={open} onClose={() => setOpen(null)} onDone={reload} />
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
