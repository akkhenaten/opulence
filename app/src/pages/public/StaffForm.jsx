// Staff details: the one-off shared links the platform admin sends when setting up the app — one for officers, one
// for venue managers. No login yet. Officers fill in everything once, each answer in its section, and set their own
// password; the office makes them live from People and they sign in with it. A venue manager's form becomes a login.
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, FileText, IdCard, Lock, Plus, UserRound, X } from 'lucide-react';
import { api, staffFormUpload } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Button, Check, ErrorBox, IconButton, Input, Load, useApi, useForm } from '../../ui/index.jsx';
import { Card, FilePick, Frame } from './Apply.jsx';

const MAX = 10 * 1024 * 1024;
const DOC_TYPES = 'image/*,.pdf';
// Each upload sits in the section it belongs to
const FILES = {
  sia_front: { label: 'Front of your SIA badge (optional)', hint: 'A clear photo with the name, number and expiry readable', icon: IdCard, accept: DOC_TYPES },
  sia_back: { label: 'Back of your SIA badge (optional)', hint: 'A clear photo of the back of the card', icon: IdCard, accept: DOC_TYPES },
  rtw: { label: 'Passport or ID photo page (optional)', hint: 'The page with your photo — PDF or a photo, up to 10 MB', icon: FileText, accept: DOC_TYPES },
  poa: { label: 'Proof of address — a recent bill or bank statement (optional)', hint: 'PDF or a photo, up to 10 MB', icon: FileText, accept: DOC_TYPES },
  photo: { label: 'A photo of you (optional)', hint: 'A clear photo of your face, like a passport photo', icon: UserRound, accept: 'image/*' },
};
const MIN_PASSWORD = 8;

function Closed() {
  return (
    <Frame>
      <div className="mx-auto mt-10 max-w-md rounded-tile bg-surface p-7 text-center shadow-tile">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-fill text-muted"><Lock size={26} /></div>
        <h1 className="mt-3 text-title2 font-bold">This form is closed</h1>
        <p className="mt-2 text-body text-muted">Please contact the office.</p>
      </div>
    </Frame>
  );
}

function Done({ name, venue, email }) {
  return (
    <Frame>
      <div className="mx-auto mt-10 max-w-md rounded-tile bg-surface p-7 text-center shadow-tile">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-green-soft text-green"><CheckCircle2 size={28} /></div>
        <h1 className="mt-3 text-title2 font-bold">Thanks, {name}</h1>
        {venue
          ? <p className="mt-2 text-body text-muted">Your details have been sent to the office. The office will email you a link to set up your login.</p>
          : <>
            <p className="mt-2 text-body text-muted">The office is checking your details.</p>
            <p className="mt-2 text-body text-muted">You'll get an email when you're live. Then sign in with <span className="font-semibold text-ink">{email}</span> and the password you just set.</p>
            <Link to="/login" className="mt-4 inline-block text-subhead font-semibold text-blue">Go to sign in</Link>
          </>}
      </div>
    </Frame>
  );
}

export default function StaffForm() {
  const { token } = useParams();
  const info = useApi('staffSetup.info', { token });
  return <Load q={info}>{(d) => (!d.open ? <Closed /> : d.kind === 'venue' ? <VenueForm token={token} /> : <Form token={token} />)}</Load>;
}

// Venue managers: who they are and the venue they look after (typed, never picked from a list); their login is set up from this
function VenueForm({ token }) {
  const { brand } = useAuth();
  const { v, bind, set } = useForm({ first_name: '', last_name: '', goes_by: '', email: '', phone: '', job_title: '', consent: false, website: '' });
  // Managers of several venues add each one
  const [names, setNames] = useState(['']);
  const [photo, setPhoto] = useState(null);
  const [photoErr, setPhotoErr] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const pickPhoto = (f) => {
    if (f && f.size > MAX) { setPhotoErr('This file is over 10 MB — please choose a smaller one'); return; }
    setPhotoErr(null);
    setPhoto(f);
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const photo_key = photo ? await staffFormUpload(photo, 'photo', token) : '';
      const venue_names = names.map((n) => n.trim()).filter(Boolean);
      await api('staffSetup.submit', { ...v, venue_names, venue_name: venue_names[0] || '', photo_key, token });
      setDone(true);
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  if (done) return <Done name={v.goes_by || v.first_name} venue />;
  return (
    <Frame hero={<>
      <div className="text-caption font-semibold uppercase tracking-[0.14em] text-gold-light">Venue manager details</div>
      <h1 className="display text-title1 font-semibold leading-tight">Your details for {brand.name}</h1>
    </>}>
      <p className="mb-5 text-body text-muted">We're setting up your venue on our app. Fill this in so the office can create your venue manager login. It takes a minute.</p>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Card title="You">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="First name" autoComplete="given-name" {...bind('first_name')} />
            <Input label="Last name" autoComplete="family-name" {...bind('last_name')} />
            <Input label="Known as (optional)" hint="If you go by another name" {...bind('goes_by')} />
            <Input label="Job title (optional)" hint="Like General Manager" autoComplete="organization-title" {...bind('job_title')} />
            <Input label="Email" type="email" autoComplete="email" inputMode="email" hint="Your login is sent here" {...bind('email')} />
            <Input label="Mobile" type="tel" autoComplete="tel" {...bind('phone')} />
          </div>
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><Input label="Website" tabIndex={-1} autoComplete="off" {...bind('website')} /></div>
        </Card>

        <Card title={names.length > 1 ? 'Your venues' : 'Your venue'}>
          <div className="space-y-3">
            {names.map((n, i) => (
              <div key={i} className="flex items-end gap-2">
                <Input className="min-w-0 flex-1" label={names.length > 1 ? `Venue ${i + 1}` : 'Venue name'} hint={names.length === 1 ? 'The venue you manage' : undefined}
                  autoComplete="organization" value={n} onChange={(e) => setNames((x) => x.map((y, j) => (j === i ? e.target.value : y)))} />
                {names.length > 1 && <IconButton icon={X} label={`Remove venue ${i + 1}`} onClick={() => setNames((x) => x.filter((_, j) => j !== i))} />}
              </div>
            ))}
            {names.length < 10 && <Button type="button" variant="ghost" size="sm" icon={Plus} onClick={() => setNames((x) => [...x, ''])}>Add another venue</Button>}
          </div>
        </Card>

        <Card title="Profile photo">
          <FilePick label="Profile photo (optional)" hint="A clear photo of your face, so officers know who you are" accept="image/*" icon={UserRound} file={photo} onChange={pickPhoto} error={photoErr} />
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            <Check checked={v.consent} onChange={(x) => set('consent', x)} label="Consent" className="mt-0.5" />
            <span className="text-callout">I agree to {brand.name} storing these details to set up my login.</span>
          </div>
          <p className="text-caption text-muted">Privacy: only the office can see what you send. If they aren't used, they are deleted after 60 days.</p>
        </Card>

        {err && <ErrorBox error={{ message: err }} />}
        <Button type="submit" size="lg" className="w-full" busy={busy}>{busy ? 'Sending…' : 'Send my details'}</Button>
      </form>
    </Frame>
  );
}

function Form({ token }) {
  const { brand } = useAuth();
  const { v, bind: plain, set } = useForm({
    first_name: '', last_name: '', goes_by: '', email: '', phone: '', dob: '', address: '', postcode: '', ni_number: '',
    sia_number: '', sia_expiry: '', rtw_share_code: '', bank_name: '', bank_sort_code: '', bank_account: '',
    ec_name: '', ec_relationship: '', ec_phone: '', password: '', password_confirm: '', consent: false, website: '',
  });
  const [files, setFiles] = useState({});
  const [fileErr, setFileErr] = useState({});
  const [err, setErr] = useState('');
  // The field the server's message belongs to: shown under that field, which is scrolled into view
  const [bad, setBad] = useState(null);
  const [stage, setStage] = useState(null); // null | 'uploading' | 'sending' | 'done'
  const [sentTo, setSentTo] = useState('');
  const bind = (k) => ({ ...plain(k), name: k, error: bad === k ? err : undefined });

  const setFile = (k) => (f) => {
    if (f && f.size > MAX) { setFileErr((e) => ({ ...e, [k]: 'This file is over 10 MB — please choose a smaller one' })); return; }
    setFileErr((e) => ({ ...e, [k]: null }));
    setFiles((s) => ({ ...s, [k]: f }));
  };
  const pick = (k) => <FilePick label={FILES[k].label} hint={FILES[k].hint} accept={FILES[k].accept} icon={FILES[k].icon} file={files[k]} onChange={setFile(k)} error={fileErr[k]} />;

  const fail = (message, field = null) => {
    setStage(null);
    setErr(message);
    setBad(field);
    if (field) requestAnimationFrame(() => document.querySelector(`[name="${field}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  };
  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBad(null);
    // Checked here first, so nothing is uploaded for a password they need to retype
    if (v.password.length < MIN_PASSWORD) return fail(`Your password must be at least ${MIN_PASSWORD} characters`, 'password');
    if (v.password !== v.password_confirm) return fail("The two passwords don't match", 'password_confirm');
    try {
      setStage('uploading');
      const keys = {};
      for (const key of Object.keys(FILES)) if (files[key]) keys[`${key}_key`] = await staffFormUpload(files[key], key, token);
      setStage('sending');
      const r = await api('staffSetup.submit', { ...v, ...keys, token });
      setSentTo(r?.email || v.email.trim().toLowerCase());
      setStage('done');
    } catch (x) {
      fail(x.message, x.data?.field || null);
    }
  };

  if (stage === 'done') return <Done name={v.goes_by || v.first_name} email={sentTo} />;
  const busy = stage === 'uploading' || stage === 'sending';
  return (
    <Frame hero={<>
      <div className="text-caption font-semibold uppercase tracking-[0.14em] text-gold-light">Staff details</div>
      <h1 className="display text-title1 font-semibold leading-tight">Your details for {brand.name}</h1>
    </>}>
      <p className="mb-5 text-body text-muted">Fill this in once and set your password. The office checks it, makes you live, and you sign in to the Officer app. It takes about five minutes.</p>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Card title="You">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="First name" autoComplete="given-name" {...bind('first_name')} />
            <Input label="Last name" autoComplete="family-name" {...bind('last_name')} />
            <Input label="Known as (optional)" hint="If you go by another name" {...bind('goes_by')} />
            <Input label="Date of birth" type="date" autoComplete="bday" {...bind('dob')} />
          </div>
          {/* Honeypot: hidden from people, bots fill it in */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><Input label="Website" tabIndex={-1} autoComplete="off" {...plain('website')} /></div>
        </Card>

        <Card title="Contact & address">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Email" type="email" autoComplete="email" inputMode="email" hint="You sign in with this" {...bind('email')} />
            <Input label="Mobile" type="tel" autoComplete="tel" {...bind('phone')} />
          </div>
          <Input label="Home address" autoComplete="street-address" {...bind('address')} />
          <Input label="Postcode" autoComplete="postal-code" className="sm:max-w-[200px]" {...bind('postcode')} />
        </Card>

        <Card title="SIA licence">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Licence number" inputMode="numeric" hint="16 digits — leave blank if you don't hold one" {...bind('sia_number')} />
            <Input label="Expiry date" type="date" {...bind('sia_expiry')} />
          </div>
          {pick('sia_front')}
          {pick('sia_back')}
        </Card>

        <Card title="Right to work">
          <Input label="Share code (optional)" autoCapitalize="characters" autoComplete="off" placeholder="W12 345 678"
            hint="9 letters and numbers starting with W. British or Irish passport? Leave blank and add the photo page below." {...bind('rtw_share_code')} />
          <a href="https://www.gov.uk/prove-right-to-work" target="_blank" rel="noreferrer" className="text-subhead font-semibold text-blue">Get a share code on GOV.UK</a>
          {pick('rtw')}
        </Card>

        <Card title="Pay details">
          <Input label="National Insurance number" hint="Like QQ 12 34 56 C" autoComplete="off" {...bind('ni_number')} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Bank" autoComplete="off" {...bind('bank_name')} />
            <Input label="Sort code" inputMode="numeric" autoComplete="off" {...bind('bank_sort_code')} />
            <Input label="Account number" inputMode="numeric" autoComplete="off" {...bind('bank_account')} />
          </div>
        </Card>

        <Card title="Emergency contact">
          <div className="grid gap-4 sm:grid-cols-3">
            <Input label="Name" {...bind('ec_name')} />
            <Input label="Relationship" {...bind('ec_relationship')} />
            <Input label="Phone" type="tel" {...bind('ec_phone')} />
          </div>
        </Card>

        <Card title="Other documents">
          {pick('poa')}
          {pick('photo')}
        </Card>

        <Card title="Your password">
          <p className="text-callout text-muted">You'll sign in to the Officer app with your email and this password once the office has checked your details.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Password" type="password" autoComplete="new-password" hint={`At least ${MIN_PASSWORD} characters`} {...bind('password')} />
            <Input label="Type it again" type="password" autoComplete="new-password" {...bind('password_confirm')} />
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-3" data-field="consent">
            <Check checked={v.consent} onChange={(x) => set('consent', x)} label="Consent" className="mt-0.5" />
            <span className="text-callout">I agree to {brand.name} storing these details to set up my staff profile and login.</span>
          </div>
          <p className="text-caption text-muted">
            Privacy: only the office can see what you send. Your details become your staff profile, which you can view and update in the app later.
            If they aren't used, they are deleted after 60 days, with your password.
          </p>
        </Card>

        {err && (!bad || bad === 'consent') && <ErrorBox error={{ message: err }} />}
        {err && bad && bad !== 'consent' && <p className="text-center text-callout text-red">Please check the field marked above.</p>}
        <Button type="submit" size="lg" className="w-full" busy={busy}>
          {stage === 'uploading' ? 'Uploading files…' : stage === 'sending' ? 'Sending…' : 'Send my details'}
        </Button>
      </form>
    </Frame>
  );
}
