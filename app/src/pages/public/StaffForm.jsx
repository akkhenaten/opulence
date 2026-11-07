// Staff details: the one-off shared links the platform admin sends when setting up the app — one for officers, one
// for venue managers. No login. Each person fills in their own details; the submission waits in Staff setup (platform
// admin only) until it becomes a staff profile, or a Venue Manager login.
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, FileText, IdCard, Lock, UserRound } from 'lucide-react';
import { api, staffFormUpload } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Button, Check, ErrorBox, Input, Load, useApi, useForm } from '../../ui/index.jsx';
import { Card, FilePick, Frame } from './Apply.jsx';

const MAX = 10 * 1024 * 1024;
const DOC_TYPES = 'image/*,.pdf';
const FILES = [
  { key: 'sia_front', label: 'SIA badge — front (optional)', hint: 'A clear photo with the name, number and expiry readable', icon: IdCard, accept: DOC_TYPES },
  { key: 'rtw', label: 'Right to work — passport or share code screenshot (optional)', hint: 'PDF or a photo, up to 10 MB', icon: FileText, accept: DOC_TYPES },
  { key: 'poa', label: 'Proof of address — a recent bill or bank statement (optional)', hint: 'PDF or a photo, up to 10 MB', icon: FileText, accept: DOC_TYPES },
  { key: 'photo', label: 'Profile photo (optional)', hint: 'A clear photo of your face, like a passport photo', icon: UserRound, accept: 'image/*' },
];

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

function Done({ name, venue }) {
  return (
    <Frame>
      <div className="mx-auto mt-10 max-w-md rounded-tile bg-surface p-7 text-center shadow-tile">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-green-soft text-green"><CheckCircle2 size={28} /></div>
        <h1 className="mt-3 text-title2 font-bold">Thanks, {name}</h1>
        <p className="mt-2 text-body text-muted">{venue ? "Your details have been sent to the office. The office will email you a link to set up your login." : 'Your details have been sent to the office.'}</p>
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
  const { v, bind, set } = useForm({ first_name: '', last_name: '', goes_by: '', email: '', phone: '', job_title: '', venue_name: '', consent: false, website: '' });
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
      await api('staffSetup.submit', { ...v, photo_key, token });
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

        <Card title="Your venue">
          <Input label="Venue name" hint="The venue you manage" autoComplete="organization" {...bind('venue_name')} />
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
  const { v, bind, set } = useForm({
    first_name: '', last_name: '', goes_by: '', email: '', phone: '', dob: '', address: '', postcode: '', ni_number: '',
    sia_number: '', sia_expiry: '', rtw_share_code: '', bank_name: '', bank_sort_code: '', bank_account: '',
    ec_name: '', ec_relationship: '', ec_phone: '', consent: false, website: '',
  });
  const [files, setFiles] = useState({});
  const [fileErr, setFileErr] = useState({});
  const [err, setErr] = useState('');
  const [stage, setStage] = useState(null); // null | 'uploading' | 'sending' | 'done'

  const setFile = (k) => (f) => {
    if (f && f.size > MAX) { setFileErr((e) => ({ ...e, [k]: 'This file is over 10 MB — please choose a smaller one' })); return; }
    setFileErr((e) => ({ ...e, [k]: null }));
    setFiles((s) => ({ ...s, [k]: f }));
  };

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    try {
      setStage('uploading');
      const keys = {};
      for (const { key } of FILES) if (files[key]) keys[`${key}_key`] = await staffFormUpload(files[key], key, token);
      setStage('sending');
      await api('staffSetup.submit', { ...v, ...keys, token });
      setStage('done');
    } catch (x) {
      setStage(null);
      setErr(x.message);
    }
  };

  if (stage === 'done') return <Done name={v.goes_by || v.first_name} />;
  const busy = stage === 'uploading' || stage === 'sending';
  return (
    <Frame hero={<>
      <div className="text-caption font-semibold uppercase tracking-[0.14em] text-gold-light">Staff details</div>
      <h1 className="display text-title1 font-semibold leading-tight">Your details for {brand.name}</h1>
    </>}>
      <p className="mb-5 text-body text-muted">We're setting up our staff app. Fill this in once so the office can create your staff profile. It takes about five minutes.</p>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Card title="You">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="First name" autoComplete="given-name" {...bind('first_name')} />
            <Input label="Last name" autoComplete="family-name" {...bind('last_name')} />
            <Input label="Known as (optional)" hint="If you go by another name" {...bind('goes_by')} />
            <Input label="Date of birth" type="date" autoComplete="bday" {...bind('dob')} />
          </div>
          {/* Honeypot: hidden from people, bots fill it in */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden"><Input label="Website" tabIndex={-1} autoComplete="off" {...bind('website')} /></div>
        </Card>

        <Card title="Contact & address">
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Email" type="email" autoComplete="email" inputMode="email" {...bind('email')} />
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
        </Card>

        <Card title="Right to work">
          <Input label="Share code (optional)" autoCapitalize="characters" autoComplete="off" placeholder="W12 345 678"
            hint="9 letters and numbers starting with W. British or Irish passport? Leave blank and add a photo of it below." {...bind('rtw_share_code')} />
          <a href="https://www.gov.uk/prove-right-to-work" target="_blank" rel="noreferrer" className="text-subhead font-semibold text-blue">Get a share code on GOV.UK</a>
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

        <Card title="Documents">
          {FILES.map((f) => (
            <FilePick key={f.key} label={f.label} hint={f.hint} accept={f.accept} icon={f.icon} file={files[f.key]} onChange={setFile(f.key)} error={fileErr[f.key]} />
          ))}
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            <Check checked={v.consent} onChange={(x) => set('consent', x)} label="Consent" className="mt-0.5" />
            <span className="text-callout">I agree to {brand.name} storing these details to set up my staff profile.</span>
          </div>
          <p className="text-caption text-muted">
            Privacy: only the office can see what you send. Your details become your staff profile, which you can view and update in the app later.
            If they aren't used, they are deleted after 60 days.
          </p>
        </Card>

        {err && <ErrorBox error={{ message: err }} />}
        <Button type="submit" size="lg" className="w-full" busy={busy}>
          {stage === 'uploading' ? 'Uploading files…' : stage === 'sending' ? 'Sending…' : 'Send my details'}
        </Button>
      </form>
    </Frame>
  );
}
