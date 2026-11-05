import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { api, takeAfterLogin } from '../../api.js';
import { HOME, useAuth } from '../../auth.jsx';
import { Logo } from '../../layouts/Shell.jsx';
import { Photo } from '../../ui/Photo.jsx';
import { Button, Input, PoweredBy, Spinner, useForm } from '../../ui/index.jsx';
import { ROLE_LABEL } from '../../layouts/nav.js';

// Castle photo beside the card on desktop; a photo band above it on phones
export function AuthCard({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[1.1fr_1fr]">
      <Photo name="castle" priority className="h-[140px] text-cream sm:h-[240px] lg:sticky lg:top-0 lg:h-dvh">
        <div className="flex h-full flex-col justify-between px-6 pb-14 pt-[calc(1.5rem+env(safe-area-inset-top))] lg:p-12">
          <Logo place="auth" tone="light" />
          <p className="display hidden text-[2.5rem] font-semibold leading-tight lg:block">Security you can see.</p>
        </div>
      </Photo>
      <div className="flex flex-col items-center px-4 pb-10 lg:justify-center lg:py-10">
        <div className="relative -mt-10 w-full max-w-[400px] rounded-sheet border border-hairline bg-surface p-5 shadow-tile sm:p-7 lg:mt-0">
          <h1 className="text-title2 font-bold">{title}</h1>
          {subtitle && <p className="mt-1 text-body text-muted">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-5 text-subhead text-muted">{footer}</div>}
        <PoweredBy className="mt-8" />
      </div>
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
      <form className="space-y-4" onSubmit={submit(async () => { const u = await signIn(await api('auth.login', f.v)); nav(takeAfterLogin() || HOME[u.role], { replace: true }); })}>
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
  const [valid, setValid] = useState(undefined);
  const f = useForm({ password: '', confirm: '' });
  const { err, fieldErr, busy, submit } = useSubmit();
  useEffect(() => { api('auth.resetInfo', { token }).then(() => setValid(true)).catch(() => setValid(false)); }, [token]);
  if (valid === undefined) return <Spinner className="min-h-dvh" />;
  if (!valid) {
    return (
      <AuthCard title="Link expired" subtitle="Password reset links work for 2 hours and only once. Request a new one below." footer={<Link to="/login" className="font-semibold text-blue">Go to sign in</Link>}>
        <Button to="/forgot" size="lg" className="w-full">Send a new link</Button>
      </AuthCard>
    );
  }
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

const VERIFY_STATUS = {
  signed: ['Signed and sealed', 'bg-green-soft text-green'], signed_paper: ['Signed on paper', 'bg-green-soft text-green'], sent: ['Awaiting signature', 'bg-amber-soft text-amber'],
  void: ['Void', 'bg-red-soft text-red'], superseded: ['Replaced by a newer version', 'bg-fill text-muted'], draft: ['Not sent', 'bg-fill text-muted'],
};

/** Public check behind the QR code on a signed PDF: is this reference real, and is my copy the original? */
export function Verify() {
  const { ref: given } = useParams();
  const navigate = useNavigate();
  const [ref, setRef] = useState(given || '');
  const [r, setR] = useState(null);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const check = async (reference, sha256) => {
    setBusy(true); setErr('');
    try { setR(await api('esign.verify', { reference, sha256 })); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  useEffect(() => { if (given) { setRef(given); setFile(null); check(given); } }, [given]); // eslint-disable-line react-hooks/exhaustive-deps
  const hashFile = async (f) => {
    if (!f) return;
    setFile({ name: f.name });
    const buf = await f.arrayBuffer();
    const hex = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');
    check(r?.reference || ref, hex);
  };
  const [label, tone] = VERIFY_STATUS[r?.status] || [];
  return (
    <AuthCard title="Check a signed document" subtitle="Enter the reference printed on the document, or scan its QR code.">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = ref.trim().toUpperCase(); if (v) navigate(`/verify/${encodeURIComponent(v)}`); }}>
        <Input className="flex-1" aria-label="Reference" placeholder="ORB-C-2026-0142" value={ref} onChange={(e) => setRef(e.target.value)} autoCapitalize="characters" spellCheck={false} />
        <Button type="submit" variant="secondary" disabled={!ref.trim()}>Check</Button>
      </form>
      <div className="mt-5" aria-live="polite">
        {busy && !r && <Spinner className="py-8" />}
        <Err msg={err} />
        {r && !r.found && <Err msg="No document has this reference. Check it was typed exactly as printed." />}
        {r?.found && (
          <div className="space-y-4">
            <div className="rounded-2xl border border-line p-4">
              <span className={`inline-flex rounded-full px-2.5 py-1 text-footnote font-semibold ${tone}`}>{label}</span>
              <div className="mt-2 text-headline font-bold">{r.title}</div>
              <div className="text-subhead text-muted">{r.type} · <span className="num">{r.reference}</span></div>
              <dl className="mt-3 space-y-1.5 text-subhead">
                <div className="flex justify-between gap-3"><dt className="text-muted">Issued by</dt><dd className="text-right font-semibold">{r.company}{r.signatory ? ` (${r.signatory})` : ''}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted">{r.party ? 'Signatory' : 'Officer'}</dt><dd className="text-right font-semibold">{r.officer}{r.party ? ` for ${r.party}` : ''}</dd></div>
                {r.signed_at && <div className="flex justify-between gap-3"><dt className="text-muted">Signed</dt><dd className="text-right font-semibold">{new Date(r.signed_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/London' })}</dd></div>}
              </dl>
              {r.fingerprint && <p className="mt-3 break-all font-mono text-caption text-faint">Fingerprint {r.fingerprint}</p>}
            </div>
            {r.sealed && (
              <div className="rounded-2xl bg-bg p-4">
                <div className="text-subhead font-semibold">Is your copy the original?</div>
                <p className="mt-0.5 text-footnote text-muted">Pick the PDF. It is checked on this device and is not uploaded.</p>
                <label className="pressable mt-3 flex h-11 cursor-pointer items-center justify-center rounded-control border border-line bg-surface text-subhead font-semibold text-blue">
                  {file ? 'Pick another PDF' : 'Choose PDF'}
                  <input type="file" accept="application/pdf,.pdf" className="sr-only" onChange={(e) => hashFile(e.target.files?.[0])} />
                </label>
                {file && r.match === true && <p role="status" className="mt-3 rounded-control bg-green-soft px-3.5 py-2.5 text-subhead font-semibold text-green">{file.name} is the original signed copy.</p>}
                {file && r.match === false && <p role="alert" className="mt-3 rounded-control bg-red-soft px-3.5 py-2.5 text-subhead font-semibold text-red">{file.name} does not match. It has been changed, or it is a different document.</p>}
              </div>
            )}
          </div>
        )}
      </div>
    </AuthCard>
  );
}
