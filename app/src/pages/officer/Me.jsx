import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  BadgeCheck, Bell, BookOpen, CalendarDays, Download, GraduationCap, MessageCircleWarning, Globe, Target, CalendarOff, CircleCheck, FileSignature, FileText, KeyRound, ListChecks, LogOut, ShieldAlert, ShieldCheck, UserRound,
} from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  AttentionDrawer, Avatar, Button, cx, date, dateShort, Input, List, Load, LoadFail, Page, Pill, Row, Section, Sheet, useAction, useApi, useConfirm,
} from '../../ui/index.jsx';
import { NotificationsSheet } from './_notify.jsx';
import { InstallSheet, usePwa } from '../../ui/pwa.jsx';
import { expiryText, expiryTone, NotLinked, OfficeWaiting } from './_parts.jsx';
import { SideSwitch } from '../../layouts/SideSwitch.jsx';
import { openFeedback } from '../../ui/AppFeedback.jsx';
import { useModules } from '../learn/_parts.jsx';

const ICON_TONE = { blue: 'bg-blue text-white', green: 'bg-green text-white', amber: 'bg-amber text-white', red: 'bg-red text-white', grey: 'bg-faint text-white', ink: 'bg-ink text-white' };
const Ico = ({ icon: I, tone = 'blue' }) => <span className={cx('grid h-8 w-8 place-items-center rounded-lg', ICON_TONE[tone])}><I size={18} /></span>;

export default function Me() {
  const { user, company, signOut } = useAuth();
  const confirm = useConfirm();
  const [pw, setPw] = useState(false);
  const [notes, setNotes] = useState(false);
  const [inst, setInst] = useState(false);
  const pwa = usePwa();
  const linked = !!user.officer_id;
  const me = useApi('officers.get', {}, { skip: !linked });
  const contracts = useApi('contracts.list', {}, { skip: !linked });
  const tasks = useApi('onboarding.tasks', {}, { skip: !linked });
  const fix = useApi('incidents.list', { status: 'changes_requested' }, { skip: !linked });
  const fb = useApi('appFeedback.status', {});
  const m = useModules();

  // Set-up links can point at a section (e.g. #contracts) once its data is in
  const { hash } = useLocation();
  useEffect(() => {
    if (hash && me.data && contracts.data) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
  }, [hash, me.data, contracts.data]);

  const out = async () => { if (await confirm({ title: 'Sign out?', body: 'You will need your email and password to sign in again.', confirm: 'Sign out', danger: true })) signOut(); };

  const account = (
    <Section title="Account">
      {user.dual && <div className="mb-3"><SideSwitch full /></div>}
      <List>
        <Row left={<Ico icon={Bell} tone="amber" />} title="Notifications" subtitle="What to hear about, phone notifications" onClick={() => setNotes(true)} chevron />
        <Row left={<Ico icon={KeyRound} tone="grey" />} title="Change password" onClick={() => setPw(true)} chevron />
        {!pwa.installed && <Row left={<Ico icon={Download} />} title="Install the app" subtitle="Open Orb from your home screen" onClick={() => setInst(true)} chevron />}
        <Row to="/officer/help" left={<Ico icon={BookOpen} tone="green" />} title="Help & user guide" />
        {fb.data?.on && <Row left={<Ico icon={MessageCircleWarning} />} title="Send feedback" subtitle="Something wrong, or an idea? Tell us" onClick={() => openFeedback()} chevron />}
        {fb.data?.on && <Row left={<Ico icon={MessageCircleWarning} tone="grey" />} title="My feedback" subtitle="What you've sent, and our replies" onClick={() => openFeedback('mine')} chevron />}
        <Row left={<Ico icon={Globe} tone="grey" />} title="Our website" subtitle="Opens in a new tab" onClick={() => window.open('/', '_blank', 'noopener')} />
        <Row left={<Ico icon={LogOut} tone="red" />} title={<span className="text-red">Sign out</span>} subtitle={user.email} onClick={out} />
      </List>
    </Section>
  );

  if (!linked) {
    return (
      <Page title="Me">
        <ProfileCard name={user.name} sub={user.email} />
        <div className="mt-3"><NotLinked /></div>
        {account}
        <PasswordSheet open={pw} onClose={() => setPw(false)} />
        <NotificationsSheet open={notes} onClose={() => setNotes(false)} />
        <InstallSheet open={inst} onClose={() => setInst(false)} />
      </Page>
    );
  }

  return (
    <Page title="Me">
      <Load q={me}>
        {(o) => {
          const c = o.compliance || {};
          const siaTone = expiryTone(c.sia_days);
          const toSign = (contracts.data || []).filter((x) => x.status === 'sent');
          // The officer's own open steps; steps only the office can finish are listed apart and not counted
          const openTasks = (tasks.data || []).filter((t) => !t.done && !t.office);
          const officeTasks = (tasks.data || []).filter((t) => !t.done && t.office);
          const toFix = fix.data || [];
          return (
            <>
              <ProfileCard name={o.name} src={o.photo_url} sub={[company, o.email || user.email].filter(Boolean).join(' · ')}
                status={o.status !== 'active' ? o.status : null} />

              {/* SIA badge */}
              <div className={cx('mt-3 flex items-center gap-4 rounded-tile p-4 shadow-tile', c.ok ? 'bg-surface' : '!bg-red-soft')}>
                <div className={cx('grid h-14 w-14 shrink-0 place-items-center rounded-2xl', !c.ok ? 'bg-red text-white' : c.grace ? 'bg-amber-soft text-amber' : 'bg-green-soft text-green')}>
                  {c.ok ? <ShieldCheck size={28} /> : <ShieldAlert size={28} />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-caption font-semibold uppercase tracking-wide text-muted">SIA licence{o.sia_type ? ` · ${o.sia_type}` : ''}</div>
                  <div className="num truncate text-title3 font-bold tracking-wide">{o.sia_number || 'Not recorded'}</div>
                  {c.grace ? (
                    <div className="text-footnote font-semibold text-amber">On grace until {date(c.grace.ends_on)}{c.graced?.length ? `. Send by then: ${c.graced.join(', ')}` : ''}</div>
                  ) : o.sia_expiry ? (
                    <div className={cx('text-footnote font-semibold', siaTone === 'red' ? 'text-red' : siaTone === 'amber' ? 'text-amber' : 'text-muted')}>
                      {c.sia_days < 0 ? expiryText(c.sia_days) : `Valid until ${date(o.sia_expiry)}`}{c.sia_days >= 0 && c.sia_days <= 60 ? ` (${c.sia_days} days)` : ''}
                    </div>
                  ) : <div className="text-footnote text-muted">No expiry date on file</div>}
                </div>
              </div>
              {!c.ok && c.issues?.length > 0 && (
                <ul className="mt-2 space-y-0.5 px-1 text-footnote font-medium text-red">{c.issues.map((i) => <li key={i}>{i}</li>)}</ul>
              )}

              {/* A part that couldn't load says so, instead of looking like there's nothing to do */}
              {[[tasks, 'your set-up steps'], [contracts, 'your contracts'], [fix, 'reports to fix']].some(([q]) => q.error) && (
                <div className="mt-6 space-y-2">
                  {[[tasks, 'your set-up steps'], [contracts, 'your contracts'], [fix, 'reports to fix']].map(([q, what]) => <LoadFail key={what} q={q} what={what} />)}
                </div>
              )}

              {/* Phones: what needs doing folds into one glowing bar; from lg up it stays on the page */}
              {toSign.length + toFix.length + openTasks.length > 0 && (
                <AttentionDrawer id="attention" title="Needs your attention" className="mt-6 lg:hidden"
                  count={toSign.length + toFix.length + openTasks.length} tone={toSign.length + toFix.length ? 'amber' : 'blue'}
                  preview={[...(toSign.length ? [{ icon: FileSignature, tone: 'amber' }] : []), ...(toFix.length ? [{ icon: ShieldAlert, tone: 'amber' }] : []), ...(openTasks.length ? [{ icon: ListChecks, tone: 'blue' }] : [])]}
                  lead={toSign[0] ? `Sign: ${toSign[0].title}` : toFix.length ? 'An incident report needs changes' : `${openTasks.length} set-up step${openTasks.length === 1 ? '' : 's'} left`}>
                  <div className="[&>*:first-child]:!mt-0">
              {(toSign.length > 0 || toFix.length > 0) && (
                <Section title="Needs your attention" icon={ShieldAlert}>
                  <List>
                    {toSign.map((x) => (
                      <Row key={x.id} to={`/officer/contracts/${x.id}`} left={<Ico icon={FileSignature} tone="amber" />} title={x.title} subtitle={`Sent ${dateShort(x.created_at)} · Tap to read and sign`} />
                    ))}
                    {toFix.map((x) => (
                      <Row key={x.id} to={`/officer/incidents/${x.id}`} left={<Ico icon={ShieldAlert} tone="amber" />} title={`Incident ${x.ref || ''}`.trim()} subtitle={x.review_comment || 'Your manager asked for changes'} />
                    ))}
                  </List>
                </Section>
              )}

              {openTasks.length > 0 && (
                <Section title="Getting set up" icon={ListChecks}>
                  <List>
                    {(tasks.data || []).filter((t) => t.done || !t.office).map((t) => (
                      <Row key={t.code} to={!t.done ? t.to : undefined} left={t.done ? <CircleCheck size={24} className="text-green" /> : <span className="block h-[22px] w-[22px] rounded-full border-2 border-line" />}
                        title={<span className={cx(t.done && 'text-muted line-through')}>{t.done ? t.title : t.action || t.title}</span>}
                        subtitle={t.done ? null : 'Tap to finish'} />
                    ))}
                  </List>
                  <p className="mt-2 px-1 text-footnote text-muted"><ListChecks size={14} className="mr-1 inline" />Tap an item to finish it. Ticks appear as soon as it's done.</p>
                </Section>
              )}

                  </div>
                </AttentionDrawer>
              )}
              <div className="hidden lg:block">
              {(toSign.length > 0 || toFix.length > 0) && (
                <Section title="Needs your attention" icon={ShieldAlert}>
                  <List>
                    {toSign.map((x) => (
                      <Row key={x.id} to={`/officer/contracts/${x.id}`} left={<Ico icon={FileSignature} tone="amber" />} title={x.title} subtitle={`Sent ${dateShort(x.created_at)} · Tap to read and sign`} />
                    ))}
                    {toFix.map((x) => (
                      <Row key={x.id} to={`/officer/incidents/${x.id}`} left={<Ico icon={ShieldAlert} tone="amber" />} title={`Incident ${x.ref || ''}`.trim()} subtitle={x.review_comment || 'Your manager asked for changes'} />
                    ))}
                  </List>
                </Section>
              )}

              {openTasks.length > 0 && (
                <Section title="Getting set up" icon={ListChecks}>
                  <List>
                    {(tasks.data || []).filter((t) => t.done || !t.office).map((t) => (
                      <Row key={t.code} to={!t.done ? t.to : undefined} left={t.done ? <CircleCheck size={24} className="text-green" /> : <span className="block h-[22px] w-[22px] rounded-full border-2 border-line" />}
                        title={<span className={cx(t.done && 'text-muted line-through')}>{t.done ? t.title : t.action || t.title}</span>}
                        subtitle={t.done ? null : 'Tap to finish'} />
                    ))}
                  </List>
                  <p className="mt-2 px-1 text-footnote text-muted"><ListChecks size={14} className="mr-1 inline" />Tap an item to finish it. Ticks appear as soon as it's done.</p>
                </Section>
              )}

              </div>
              <OfficeWaiting tasks={officeTasks} className="mt-6" />

              {/* The hub, in order: shifts, training, contracts, documents, profile and bank, pay, reports, time off */}
              <Section title="Work">
                <List>
                  <Row to="/officer/shifts" left={<Ico icon={CalendarDays} />} title="My shifts" subtitle="Coming up, offers, open shifts and past shifts" />
                  {m && (m.academy || m.toolbox) && <Row to="/officer/learn" left={<Ico icon={GraduationCap} tone="green" />} title="Training" subtitle="Courses and certificates" />}
                </List>
              </Section>

              {(contracts.data || []).length > 0 && (
                <Section title="Contracts">
                  <span id="contracts" className="block scroll-mt-24" />
                  <List>
                    {contracts.data.map((x) => (
                      <Row key={x.id} to={`/officer/contracts/${x.id}`} left={<Ico icon={FileSignature} tone={x.status === 'signed' ? 'green' : x.status === 'sent' ? 'amber' : 'grey'} />}
                        title={x.title} subtitle={x.status === 'signed' ? `Signed ${date(x.signed_at)}` : x.status === 'sent' ? 'Waiting for your signature' : 'Withdrawn'}
                        right={<Pill status={x.status === 'sent' ? 'pending' : x.status}>{x.status === 'sent' ? 'To sign' : x.status === 'void' ? 'Void' : 'Signed'}</Pill>} />
                    ))}
                  </List>
                </Section>
              )}
              {/* Older set-up links point here before any contract has been sent */}
              {contracts.data && !contracts.data.length && hash === '#contracts' && (
                <Section title="Contracts">
                  <span id="contracts" className="block scroll-mt-24" />
                  <p className="px-1 text-body text-muted"><FileSignature size={16} className="mr-1.5 inline" />No contract yet. The office will send it here.</p>
                </Section>
              )}

              <Section title="Me">
                <List>
                  <Row to="/officer/documents" left={<Ico icon={BadgeCheck} tone="green" />} title="Documents and licence" subtitle="SIA licence, right to work, certificates" />
                  <Row to="/officer/profile" left={<Ico icon={UserRound} />} title="Profile and bank" subtitle="Contact details, bank and your rates" />
                  <Row to="/officer/pay" left={<Ico icon={FileText} />} title="Pay" subtitle="Your pay statements" />
                  <Row to="/officer/incidents" left={<Ico icon={ShieldAlert} tone="red" />} title="Reports" subtitle="Incident reports and ejections you logged" right={toFix.length ? <Pill tone="amber">{toFix.length} to fix</Pill> : null} />
                  <Row to="/officer/time-off" left={<Ico icon={CalendarOff} tone="ink" />} title="Time off and availability" />
                </List>
                <List className="mt-3">
                  <Row to="/officer/me/growth" left={<Ico icon={Target} tone="green" />} title="Goals and one-to-ones" subtitle="What you're working on, notes and pay rises" />
                </List>
              </Section>

              {account}
            </>
          );
        }}
      </Load>
      <PasswordSheet open={pw} onClose={() => setPw(false)} />
      <NotificationsSheet open={notes} onClose={() => setNotes(false)} />
      <InstallSheet open={inst} onClose={() => setInst(false)} />
    </Page>
  );
}

function ProfileCard({ name, src, sub, status }) {
  return (
    <div className="flex items-center gap-4 rounded-tile bg-surface p-4 shadow-tile">
      <Avatar name={name} src={src} size={64} />
      <div className="min-w-0 flex-1">
        <div className="display truncate text-title2 font-bold">{name}</div>
        <div className="truncate text-subhead text-muted">{sub}</div>
        {status && <Pill status={status} className="mt-1" />}
      </div>
    </div>
  );
}

function PasswordSheet({ open, onClose }) {
  const [v, setV] = useState({ current: '', password: '', confirm: '' });
  const [run, busy] = useAction();
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const mismatch = v.confirm && v.password !== v.confirm;
  const ok = v.current && v.password.length >= 8 && v.password === v.confirm;
  const close = () => { setV({ current: '', password: '', confirm: '' }); onClose(); };
  const save = () => run(() => api('auth.changePassword', { current: v.current, password: v.password }), 'Password changed').then(close).catch(() => {});
  return (
    <Sheet open={open} onClose={close} title="Change password" size="sm"
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button busy={busy} disabled={!ok} onClick={save}>Save</Button></>}>
      <div className="space-y-3">
        <Input label="Current password" type="password" autoComplete="current-password" value={v.current} onChange={set('current')} />
        <Input label="New password" type="password" autoComplete="new-password" hint="At least 8 characters" value={v.password} onChange={set('password')} />
        <Input label="Confirm new password" type="password" autoComplete="new-password" value={v.confirm} onChange={set('confirm')} hint={mismatch ? 'Passwords do not match' : undefined} />
      </div>
    </Sheet>
  );
}
