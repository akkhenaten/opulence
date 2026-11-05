// "Join the team": the public application form linked from the website. No login. The CV and SIA badge go straight
// to private storage, the application lands in Recruitment → Applicants, and AI reads the files in the background.
import { useState } from 'react';
import { CheckCircle2, FileText, IdCard, Paperclip, X } from 'lucide-react';
import { api, publicUpload } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Logo } from '../../layouts/Shell.jsx';
import { Photo } from '../../ui/Photo.jsx';
import { Button, Check, Chips, cx, ErrorBox, Input, PoweredBy, Textarea, useForm } from '../../ui/index.jsx';

const ROLES = [
  { value: 'door', label: 'Door supervisor' },
  { value: 'guard', label: 'Security guard' },
  { value: 'cctv', label: 'CCTV operator' },
  { value: 'steward', label: 'Steward' },
  { value: 'close', label: 'Close protection' },
];
const AVAILABILITY = [
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekends', label: 'Weekends' },
  { value: 'nights', label: 'Nights' },
  { value: 'events', label: 'Events' },
];
const MAX = 10 * 1024 * 1024;
const CV_TYPES = '.pdf,.doc,.docx,image/*';
const BADGE_TYPES = 'image/*,.pdf';

// hero: a castle photo under the black bar with the page title on it
function Frame({ children, hero }) {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-30 flex h-14 items-center border-b border-white/10 bg-night pt-[env(safe-area-inset-top)] [--px:1rem] sm:[--px:1.5rem] safe-x">
        <Logo tone="light" />
      </header>
      {hero && (
        <Photo name="castle" priority className="text-cream">
          <div className="mx-auto flex min-h-[120px] max-w-2xl flex-col justify-end pb-5 pt-6 sm:pb-7 sm:pt-12 [--px:1rem] sm:min-h-[280px] sm:[--px:1.5rem] safe-x">{hero}</div>
        </Photo>
      )}
      <main className="mx-auto max-w-2xl py-6 [--px:1rem] sm:[--px:1.5rem] safe-x pb-16">{children}</main>
      <PoweredBy className="pb-8" />
    </div>
  );
}

function Card({ title, children }) {
  return (
    <section className="rounded-tile bg-surface p-5 shadow-tile">
      {title && <h2 className="mb-4 text-headline font-semibold">{title}</h2>}
      <div className="space-y-4">{children}</div>
    </section>
  );
}

// A file picker that shows the chosen file's name; the native input stays inside the label
function FilePick({ label, hint, accept, file, onChange, icon: Icon, error }) {
  const pick = (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) onChange(f);
  };
  return (
    <div>
      <div className="mb-1.5 text-footnote font-semibold text-muted">{label}</div>
      {file ? (
        <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3.5 py-2.5">
          <Icon size={20} className="shrink-0 text-blue" />
          <span className="min-w-0 flex-1 truncate text-callout">{file.name}</span>
          <Button variant="plain" size="sm" icon={X} onClick={() => onChange(null)}>Remove</Button>
        </div>
      ) : (
        <label className={cx('pressable flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-3.5 py-3.5 text-callout text-muted hover:bg-bg', error ? 'border-red' : 'border-line')}>
          <Paperclip size={20} className="shrink-0" />
          <span>Choose a file or take a photo</span>
          <input type="file" accept={accept} className="sr-only" onChange={pick} />
        </label>
      )}
      {(error || hint) && <div className={cx('mt-1 text-caption', error ? 'text-red' : 'text-faint')}>{error || hint}</div>}
    </div>
  );
}

function Done({ name, brand }) {
  return (
    <Frame>
      <div className="mx-auto mt-10 max-w-md overflow-hidden rounded-tile bg-surface text-center shadow-tile">
        <Photo name="crowd" priority className="h-24 sm:h-40" />
        <div className="relative -mt-7 mx-auto grid h-14 w-14 place-items-center rounded-full bg-green-soft text-green ring-4 ring-surface"><CheckCircle2 size={28} /></div>
        <h1 className="mt-3 px-7 text-title2 font-bold">Thank you, {name}</h1>
        <p className="mt-2 px-7 pb-7 text-body text-muted">Your application to {brand} has been sent. We've emailed you a confirmation and our team will be in touch.</p>
      </div>
    </Frame>
  );
}

export default function Apply() {
  const { brand } = useAuth();
  const { v, bind, set } = useForm({ first_name: '', last_name: '', email: '', phone: '', postcode: '', sia_number: '', roles: [], availability: [], availability_note: '', rtw: false, consent: false, website: '' });
  const [files, setFiles] = useState({ cv: null, sia_front: null, sia_back: null });
  const [err, setErr] = useState('');
  const [fileErr, setFileErr] = useState({});
  const [stage, setStage] = useState(null); // null | 'uploading' | 'sending' | 'done'
  const badgeNeeded = v.roles.some((r) => r !== 'steward');

  const setFile = (k) => (f) => {
    if (f && f.size > MAX) { setFileErr((e) => ({ ...e, [k]: 'This file is over 10 MB — please choose a smaller one' })); return; }
    setFileErr((e) => ({ ...e, [k]: null }));
    setFiles((s) => ({ ...s, [k]: f }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    const missing = {};
    if (!files.cv) missing.cv = 'Please add your CV';
    if (badgeNeeded && !files.sia_front) missing.sia_front = 'Please add a photo of your SIA badge';
    if (Object.keys(missing).length) { setFileErr(missing); setErr('Some files are missing'); return; }
    try {
      setStage('uploading');
      const keys = {};
      for (const k of ['cv', 'sia_front', 'sia_back']) {
        if (files[k] && (k === 'cv' || badgeNeeded)) keys[`${k}_key`] = await publicUpload(files[k], k);
      }
      setStage('sending');
      const r = await api('apply.submit', { ...v, ...keys });
      setStage('done');
      // AI reads the files after the thank-you shows; the scheduled run catches anything this misses
      if (r.read_token) api('apply.read', { token: r.read_token }).catch(() => {});
    } catch (x) {
      setStage(null);
      setErr(x.message);
    }
  };

  if (stage === 'done') return <Done name={v.first_name} brand={brand.name} />;
  const busy = stage === 'uploading' || stage === 'sending';
  return (
    <Frame hero={<>
      <div className="text-caption font-semibold uppercase tracking-[0.14em] text-gold-light">Careers</div>
      <h1 className="display text-title1 font-semibold leading-tight">Join the {brand.name} team</h1>
    </>}>
      <div className="mb-5">
        <p className="text-body text-muted">Tell us about yourself and upload your CV and SIA badge. It takes about five minutes.</p>
      </div>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Card title="Your details">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="First name" autoComplete="given-name" {...bind('first_name')} />
            <Input label="Last name" autoComplete="family-name" {...bind('last_name')} />
            <Input label="Email" type="email" autoComplete="email" inputMode="email" {...bind('email')} />
            <Input label="Mobile" type="tel" autoComplete="tel" {...bind('phone')} />
            <Input label="Postcode" autoComplete="postal-code" {...bind('postcode')} />
          </div>
          {/* Honeypot: hidden from people, bots fill it in */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><Input label="Website" tabIndex={-1} autoComplete="off" {...bind('website')} /></div>
        </Card>

        <Card title="The work">
          <Chips label="Roles you're applying for" options={ROLES} value={v.roles} onChange={(x) => set('roles', x)} />
          <Chips label="When you can work" options={AVAILABILITY} value={v.availability} onChange={(x) => set('availability', x)} />
          <Textarea label="Anything else about your availability (optional)" rows={2} {...bind('availability_note')} />
        </Card>

        <Card title="Documents">
          <FilePick label="CV" hint="PDF, Word or a photo, up to 10 MB" accept={CV_TYPES} icon={FileText} file={files.cv} onChange={setFile('cv')} error={fileErr.cv} />
          {badgeNeeded ? (
            <>
              <FilePick label="SIA badge — front" hint="A clear photo with the name, number and expiry readable" accept={BADGE_TYPES} icon={IdCard} file={files.sia_front} onChange={setFile('sia_front')} error={fileErr.sia_front} />
              <FilePick label="SIA badge — back (optional)" accept={BADGE_TYPES} icon={IdCard} file={files.sia_back} onChange={setFile('sia_back')} error={fileErr.sia_back} />
              <Input label="SIA licence number (optional)" inputMode="numeric" hint="16 digits — we'll read it from the badge if you leave it blank" {...bind('sia_number')} />
            </>
          ) : v.roles.length ? <p className="text-footnote text-muted">Stewards don't need an SIA licence.</p> : null}
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            <Check checked={v.rtw} onChange={(x) => set('rtw', x)} label="Right to work" className="mt-0.5" />
            <span className="text-callout">I have the right to work in the UK. We'll ask for proof if we invite you to join.</span>
          </div>
          <div className="flex items-start gap-3">
            <Check checked={v.consent} onChange={(x) => set('consent', x)} label="Privacy notice" className="mt-0.5" />
            <span className="text-callout">I agree to {brand.name} using these details to assess my application.</span>
          </div>
          <p className="text-caption text-muted">
            Privacy: we collect your contact details, the roles and hours you're interested in, your CV and your SIA badge to assess your application.
            The documents are read by AI to summarise your experience and check your licence details; a member of our team makes every decision.
            Only our managers can see your application. If we don't take it forward, it is deleted after 6 months.
          </p>
        </Card>

        {err && <ErrorBox error={{ message: err }} />}
        <Button type="submit" size="lg" className="w-full" busy={busy}>
          {stage === 'uploading' ? 'Uploading files…' : stage === 'sending' ? 'Sending…' : 'Send application'}
        </Button>
      </form>
    </Frame>
  );
}
