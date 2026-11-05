import { useRef, useState } from 'react';
import { Bell, BookOpen, Camera, Download, KeyRound, LogOut, UserPen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, upload } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Avatar, Button, Input, List, Pill, Pressable, Row, Sheet, useAction, useForm } from '../ui/index.jsx';
import { NotificationsSheet } from '../pages/officer/_notify.jsx';
import { compressImage } from '../pages/officer/_parts.jsx';
import { ROLE_LABEL } from './nav.js';
import { SideSwitch } from './SideSwitch.jsx';
import { InstallSheet, usePwa } from '../ui/pwa.jsx';

const TITLES = { password: 'Change password', details: 'My details' };

/** My account for managers: who you are, photo, details, password, which alerts you get, sign out */
export function AccountSheet({ open, onClose }) {
  const { user, signOut, refresh } = useAuth();
  const [view, setView] = useState('main');
  const [runPhoto, photoBusy] = useAction();
  const file = useRef(null);
  const nav = useNavigate();
  const pwa = usePwa();
  const close = () => { setView('main'); onClose(); };
  const setPhoto = (getKey, msg) => runPhoto(async () => { await api('auth.updateMe', { photo_key: await getKey() }); await refresh(); }, msg).catch(() => {});
  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) setPhoto(async () => upload(await compressImage(f, 800, 0.85), 'photo'), 'Photo updated');
  };
  return (
    <>
      <Sheet open={open && view !== 'notify' && view !== 'install'} onClose={close} title={TITLES[view] || 'My account'} size="sm">
        {view === 'password' ? <PasswordForm onDone={() => setView('main')} /> : view === 'details' ? <DetailsForm onDone={() => setView('main')} /> : (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Pressable press onClick={() => file.current?.click()} className="relative shrink-0 rounded-full" aria-label="Change photo">
                <Avatar name={user.name} src={user.photo_url} size={56} />
                <span className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full bg-blue text-white ring-4 ring-surface">{photoBusy ? <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" /> : <Camera size={14} />}</span>
              </Pressable>
              <input ref={file} type="file" accept="image/*" className="hidden" onChange={pick} />
              <div className="min-w-0">
                <div className="truncate text-headline font-bold">{user.name}</div>
                <div className="truncate text-subhead text-muted">{user.email}</div>
                <div className="mt-1 flex items-center gap-2">
                  <Pill tone="blue">{ROLE_LABEL[user.login_role || user.role]}</Pill>
                  {user.dual && <Pill tone="green">Works shifts</Pill>}
                  {user.photo_url && <Button variant="link-red" size="sm" disabled={photoBusy} onClick={() => setPhoto(async () => '', 'Photo removed')}>Remove photo</Button>}
                </div>
              </div>
            </div>
            {user.dual && <SideSwitch full />}
            <List>
              <Row left={<UserPen size={20} className="text-blue" />} title="My details" subtitle="Your name and phone number" chevron onClick={() => setView('details')} />
              <Row left={<KeyRound size={20} className="text-blue" />} title="Password" subtitle="Change the password you sign in with" chevron onClick={() => setView('password')} />
              <Row left={<Bell size={20} className="text-blue" />} title="Notifications" subtitle="Which alerts you get, and phone notifications" chevron onClick={() => setView('notify')} />
            </List>
            <List>
              <Row left={<BookOpen size={20} className="text-blue" />} title="Help & user guide" subtitle="How to use the app, step by step" chevron onClick={() => { close(); nav(`/${user.role}/help`); }} />
              {!pwa.installed && <Row left={<Download size={20} className="text-blue" />} title="Install the app" subtitle="Open Orb from your home screen or desktop" chevron onClick={() => setView('install')} />}
            </List>
            <Button variant="danger" icon={LogOut} className="w-full" onClick={signOut}>Sign out</Button>
          </div>
        )}
      </Sheet>
      <NotificationsSheet open={open && view === 'notify'} onClose={() => setView('main')} />
      <InstallSheet open={open && view === 'install'} onClose={() => setView('main')} />
    </>
  );
}

function DetailsForm({ onDone }) {
  const { user, refresh } = useAuth();
  const { v, bind } = useForm({ name: user.name || '', goes_by: user.goes_by || '', phone: user.phone || '' });
  const [run, busy] = useAction();
  const nameBad = v.name.trim().length < 2;
  const save = () => run(async () => { await api('auth.updateMe', { name: v.name, goes_by: v.goes_by, phone: v.phone }); await refresh(); }, 'Details saved').then(onDone).catch(() => {});
  return (
    <div className="space-y-3">
      <Input label="Name" autoComplete="name" error={v.name && nameBad ? 'Enter your name' : undefined} {...bind('name')} />
      <Input label="Goes by (optional)" placeholder="e.g. Goddey" maxLength={40} hint="The name the team knows you by" {...bind('goes_by')} />
      <Input label="Phone" type="tel" inputMode="tel" autoComplete="tel" {...bind('phone')} />
      <Input label="Email" value={user.email} readOnly disabled hint={user.role === 'company' ? 'You sign in with this email. Another company manager can change it in Settings.' : 'You sign in with this email. Ask your company manager to change it.'} />
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onDone}>Back</Button>
        <Button busy={busy} disabled={nameBad} onClick={save}>Save</Button>
      </div>
    </div>
  );
}

function PasswordForm({ onDone }) {
  const { v, bind } = useForm({ current: '', password: '', confirm: '' });
  const [run, busy] = useAction();
  const mismatch = v.confirm && v.password !== v.confirm;
  const save = () => run(() => api('auth.changePassword', { current: v.current, password: v.password }), 'Password changed').then(onDone).catch(() => {});
  return (
    <div className="space-y-3">
      <Input label="Current password" type="password" autoComplete="current-password" {...bind('current')} />
      <Input label="New password" type="password" autoComplete="new-password" hint="At least 8 characters" {...bind('password')} />
      <Input label="Confirm new password" type="password" autoComplete="new-password" error={mismatch ? 'Passwords do not match' : undefined} {...bind('confirm')} />
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onDone}>Back</Button>
        <Button busy={busy} disabled={!v.current || v.password.length < 8 || v.password !== v.confirm} onClick={save}>Change password</Button>
      </div>
    </div>
  );
}
