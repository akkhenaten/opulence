import { useState } from 'react';
import { Bell, KeyRound, LogOut } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Avatar, Button, Input, List, Pill, Row, Sheet, useAction, useForm } from '../ui/index.jsx';
import { NotificationsSheet } from '../pages/officer/_notify.jsx';
import { ROLE_LABEL } from './nav.js';

/** My account for managers: who you are, password, which alerts you get, sign out */
export function AccountSheet({ open, onClose }) {
  const { user, signOut } = useAuth();
  const [view, setView] = useState('main');
  const close = () => { setView('main'); onClose(); };
  return (
    <>
      <Sheet open={open && view !== 'notify'} onClose={close} title={view === 'password' ? 'Change password' : 'My account'} size="sm">
        {view === 'password' ? <PasswordForm onDone={() => setView('main')} /> : (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <Avatar name={user.name} size={52} />
              <div className="min-w-0">
                <div className="truncate text-headline font-bold">{user.name}</div>
                <div className="truncate text-subhead text-muted">{user.email}</div>
                <Pill tone="blue" className="mt-1">{ROLE_LABEL[user.role]}</Pill>
              </div>
            </div>
            <List>
              <Row left={<KeyRound size={20} className="text-blue" />} title="Password" subtitle="Change the password you sign in with" chevron onClick={() => setView('password')} />
              <Row left={<Bell size={20} className="text-blue" />} title="Notifications" subtitle="Which alerts you get, and phone notifications" chevron onClick={() => setView('notify')} />
            </List>
            <Button variant="danger" icon={LogOut} className="w-full" onClick={signOut}>Sign out</Button>
          </div>
        )}
      </Sheet>
      <NotificationsSheet open={open && view === 'notify'} onClose={() => setView('main')} />
    </>
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
