import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { api } from '../../api.js';
import { HOME, useAuth } from '../../auth.jsx';
import { Logo } from '../../layouts/Shell.jsx';
import { Button, Input, Spinner, useForm } from '../../ui/index.jsx';
import { ROLE_LABEL } from '../../layouts/nav.js';

function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="mb-8"><Logo /></div>
      <div className="w-full max-w-[400px] rounded-sheet border border-black/[0.04] bg-surface p-7 shadow-tile">
        <h1 className="text-title2 font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-body text-muted">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-5 text-subhead text-muted">{footer}</div>}
    </div>
  );
}

// An error about one field shows under that field; anything else shows in the box above the button
const fieldError = (field, msg) => Object.assign(new Error(msg), { field });
function useSubmit() {
  const [err, setErr] = useState('');
  const [fieldErr, setFieldErr] = useState({});
  const [busy, setBusy] = useState(false);
  const submit = (fn) => async (e) => {
    e.preventDefault();
    setErr(''); setFieldErr({}); setBusy(true);
    try { await fn(); } catch (x) { if (x.field) setFieldErr({ [x.field]: x.message }); else setErr(x.message); } finally { setBusy(false); }
  };
  return { err, fieldErr, busy, submit };
}
const Err = ({ msg }) => (msg ? (
  <div role="alert" className="flex items-start gap-2 rounded-control bg-red-soft px-3.5 py-3 text-subhead font-medium text-red"><AlertCircle size={18} className="mt-px shrink-0" />{msg}</div>
) : null);

export function Login() {
  const { signIn, brand } = useAuth();
  const nav = useNavigate();
  const f = useForm({ email: '', password: '' });
  const { err, fieldErr, busy, submit } = useSubmit();
  const [setup, setSetup] = useState(false);
  useEffect(() => { api('auth.needsBootstrap').then((r) => setSetup(r.needed)).catch(() => {}); }, []);
  if (setup) return <Bootstrap />;
  return (
    <AuthCard title="Sign in" subtitle={`Welcome back to ${brand.name}.`} footer={<Link to="/forgot" className="font-semibold text-blue">Forgot password?</Link>}>
      <form className="space-y-4" onSubmit={submit(async () => { const u = await signIn(await api('auth.login', f.v)); nav(HOME[u.role], { replace: true }); })}>
        <Input label="Email" type="email" autoComplete="email" required {...f.bind('email')} />
        <Input label="Password" type="password" autoComplete="current-password" required {...f.bind('password')} />
        <Err msg={err} />
        <Button type="submit" size="lg" className="w-full" busy={busy}>Sign in</Button>
      </form>
    </AuthCard>
  );
}

function Bootstrap() {
  const { signIn } = useAuth();
  const nav = useNavigate();
  const f = useForm({ company_name: '', name: '', email: '', password: '' });
  const { err, fieldErr, busy, submit } = useSubmit();
  return (
    <AuthCard title="Set up Orb Security" subtitle="Create the first company manager account.">
      <form className="space-y-4" onSubmit={submit(async () => { await signIn(await api('auth.bootstrap', f.v)); nav('/company', { replace: true }); })}>
        <Input label="Company name" required {...f.bind('company_name')} />
        <Input label="Your name" required {...f.bind('name')} />
        <Input label="Email" type="email" autoComplete="email" required {...f.bind('email')} />
        <Input label="Password" type="password" minLength={8} hint="At least 8 characters" required {...f.bind('password')} />
        <Err msg={err} />
        <Button type="submit" size="lg" className="w-full" busy={busy}>Create account</Button>
      </form>
    </AuthCard>
  );
}

export function AcceptInvite() {
  const { token } = useParams();
  const { signIn } = useAuth();
  const nav = useNavigate();
  const [info, setInfo] = useState(undefined);
  const f = useForm({ password: '', confirm: '' });
  const { err, fieldErr, busy, submit } = useSubmit();
  useEffect(() => { api('auth.inviteInfo', { token }).then(setInfo).catch(() => setInfo(null)); }, [token]);
  if (info === undefined) return <Spinner className="min-h-dvh" />;
  if (!info) return <AuthCard title="Invite not valid" subtitle="This link has expired or was already used. Ask your manager to send a new one." footer={<Link to="/login" className="font-semibold text-blue">Go to sign in</Link>} />;
  return (
    <AuthCard title={`Welcome, ${info.name.split(' ')[0]}`} subtitle={`You've been invited as ${ROLE_LABEL[info.role]?.toLowerCase()}. Choose a password to finish.`}>
      <form className="space-y-4" onSubmit={submit(async () => {
        if (f.v.password !== f.v.confirm) throw fieldError('confirm', 'Passwords do not match');
        const u = await signIn(await api('auth.acceptInvite', { token, password: f.v.password }));
        nav(HOME[u.role], { replace: true });
      })}>
        <Input label="Email" value={info.email} disabled />
        <Input label="New password" type="password" minLength={8} autoComplete="new-password" hint="At least 8 characters" required {...f.bind('password')} />
        <Input label="Confirm password" type="password" autoComplete="new-password" required error={fieldErr.confirm} {...f.bind('confirm')} />
        <Err msg={err} />
        <Button type="submit" size="lg" className="w-full" busy={busy}>Activate account</Button>
      </form>
    </AuthCard>
  );
}

export function Forgot() {
  const f = useForm({ email: '' });
  const [sent, setSent] = useState(false);
  const { err, fieldErr, busy, submit } = useSubmit();
  return (
    <AuthCard title="Reset password" subtitle={sent ? 'If that email has an account, a reset link is on its way. If it does not arrive, ask your manager for a reset link.' : 'Enter your email and we will send you a reset link.'}
      footer={<Link to="/login" className="font-semibold text-blue">Back to sign in</Link>}>
      {!sent && (
        <form className="space-y-4" onSubmit={submit(async () => { await api('auth.requestReset', f.v); setSent(true); })}>
          <Input label="Email" type="email" autoComplete="email" required {...f.bind('email')} />
          <Err msg={err} />
          <Button type="submit" size="lg" className="w-full" busy={busy}>Send reset link</Button>
        </form>
      )}
    </AuthCard>
  );
}

export function Reset() {
  const { token } = useParams();
  const { signIn } = useAuth();
  const nav = useNavigate();
  const f = useForm({ password: '', confirm: '' });
  const { err, fieldErr, busy, submit } = useSubmit();
  return (
    <AuthCard title="Choose a new password">
      <form className="space-y-4" onSubmit={submit(async () => {
        if (f.v.password !== f.v.confirm) throw fieldError('confirm', 'Passwords do not match');
        const r = await api('auth.reset', { token, password: f.v.password });
        if (r.token) { const u = await signIn(r); nav(HOME[u.role], { replace: true }); } else nav('/login');
      })}>
        <Input label="New password" type="password" minLength={8} autoComplete="new-password" hint="At least 8 characters" required {...f.bind('password')} />
        <Input label="Confirm password" type="password" autoComplete="new-password" required error={fieldErr.confirm} {...f.bind('confirm')} />
        <Err msg={err} />
        <Button type="submit" size="lg" className="w-full" busy={busy}>Save password</Button>
      </form>
    </AuthCard>
  );
}
