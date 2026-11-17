// New staff forms: the details officers and venue managers sent through the shared links. A company manager (or the
// platform admin) checks each one and makes it live in one tap — an active staff profile with an Officer app login, or
// a Venue manager login for the venues ticked — with the password they set. A form that matches someone already on
// file (same email or SIA number) is never made live: "Discard and open" deletes it and opens that person instead.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ExternalLink, Eye, FileText, Trash2, UserCheck, UserPlus, UserSearch } from 'lucide-react';
import { api } from '../../api.js';
import {
  Avatar, Button, Callout, Chips, date, dateTime, Empty, KV, List, Load, Pill, Row, Sheet, useAction, useApi, useConfirm, useUrlState,
} from '../../ui/index.jsx';
import { openUrl } from './_parts.jsx';

export const siaFmt = (n) => String(n || '').replace(/(\d{4})(?=\d)/g, '$1 ');
const mask = (s) => (s ? `•••• ${String(s).slice(-2)}` : '');
const shareFmt = (c) => String(c || '').replace(/^(\w{3})(\w{3})(\w{3})$/, '$1 $2 $3');

/** What still stands between this form and working shifts once it is live (the same checks as the rota) */
export function stillNeeded(d, files) {
  const has = (k) => files.some((f) => f.kind === k);
  const out = [];
  if (!d.sia_number || !d.sia_expiry) out.push('SIA licence number and expiry');
  else if (d.sia_expiry < new Date().toISOString().slice(0, 10)) out.push('an SIA licence in date');
  out.push(d.rtw_share_code ? 'right to work checked on GOV.UK' : has('rtw') ? 'right to work checked (Orb reads the passport)' : 'right to work: no share code or passport sent');
  return out;
}

function Section({ title, children }) {
  return (
    <div>
      <div className="mb-2 text-footnote font-semibold uppercase tracking-wide text-muted">{title}</div>
      {children}
    </div>
  );
}

function Files({ files, kinds }) {
  const list = files.filter((f) => kinds.includes(f.kind));
  if (!list.length) return <p className="mt-2 text-callout text-muted">No files sent.</p>;
  return (
    <List className="mt-2">
      {list.map((f) => <Row key={f.kind} left={<FileText size={20} className="text-blue" />} title={f.title} onClick={() => openUrl(async () => ({ url: f.url }))} chevron />)}
    </List>
  );
}

/** Who a double matches, in words: "Same email" / "Same SIA number" */
const matchText = (dup) => (dup.match === 'sia' ? 'Same SIA number' : 'Same email');

/** One form: made live in one tap (officers and venue managers), or discarded — straight to the person it doubles */
export function StaffFormSheet({ id, onClose, onDone, base = '/company' }) {
  const q = useApi('staffSetup.get', { id }, { skip: !id });
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const nav = useNavigate();
  const [show, setShow] = useState(false);
  const [venues, setVenues] = useState(null);
  const [late, setLate] = useState(null); // a double found only at Make live (someone was added meanwhile)
  const [gone, setGone] = useState(null); // made live by someone else meanwhile: { id }
  const s = q.data;
  const d = s?.details || {};
  const venue = s?.kind === 'venue';
  const dup = late || s?.duplicate || null;
  const picked = venues ?? s?.matched ?? [];
  const lost = !s && q.error?.status === 404 && (q.error.data?.person_id || q.error.data?.officer_id);
  const reset = () => setTimeout(() => { setShow(false); setVenues(null); setLate(null); setGone(null); }, 300);
  const close = () => { if (gone || lost) onDone(); onClose(); reset(); };
  const done = () => { onDone(); onClose(); reset(); };
  const page = (pid, tab) => nav(`${base}/staff/${pid}${tab ? `?tab=${tab}` : ''}`);
  const failed = (e) => {
    if (e?.status !== 409) return;
    if (e.data?.duplicate) setLate(e.data.duplicate);
    else if (/already made live/i.test(e.message)) setGone({ id: e.data?.person_id || e.data?.officer_id || null });
  };

  const makeLive = () => run(() => api('staffSetup.create', venue ? { id, venue_ids: picked } : { id }),
    (r) => (r.invited ? `${r.name} is live — ${r.emailed ? 'invite sent' : "invite didn't send, share it from their Access tab"}` : `${r.name} is live`))
    .then((r) => {
      // Orb reads an officer's SIA card and passport now, so SIA and right to work can be ticked without a manager step
      if (!venue) api('docs.read', { officer_id: r.id }).catch(() => {});
      done();
      page(r.id, venue ? 'access' : 'compliance');
    }).catch(failed);
  const discard = async () => {
    if (!(await confirm({ title: 'Discard this form?', body: 'The form, its files and the password they set are deleted.', confirm: 'Discard', danger: true }))) return;
    run(() => api('staffSetup.discard', { id }), 'Discarded').then(done).catch(() => {});
  };
  // The double: delete the form and go to the record it matches, unchanged
  const discardAndOpen = () => run(() => api('staffSetup.discard', { id }), (r) => `Form discarded — this is ${(r.duplicate || dup).name}`)
    .then((r) => { const to = r.duplicate || dup; done(); page(to.id, to.tab); }).catch(() => {});
  const priv = (v) => (show ? v : mask(v));

  const footer = gone || lost ? <Button onClick={close}>Done</Button> : s && (dup ? <>
    <Button variant="secondary" icon={Trash2} onClick={discard} disabled={busy}>Discard</Button>
    <Button icon={UserSearch} busy={busy} onClick={discardAndOpen}>Discard and open {dup.name}</Button>
  </> : <>
    <Button variant="secondary" icon={Trash2} onClick={discard} disabled={busy}>Discard</Button>
    <Button icon={UserCheck} busy={busy} onClick={makeLive} disabled={venue && !picked.length}>Make live</Button>
  </>);

  const gonePid = gone?.id || lost;
  return (
    <Sheet open={!!id} onClose={close} title={s?.name || 'Staff form'} size="lg" footer={footer}>
      {gone || lost ? (
        <Callout tone="success" title="Already made live" action={gonePid && <Button size="sm" variant="secondary" onClick={() => { close(); page(gonePid); }}>Open their page</Button>}>
          Someone else in the office made this person live a moment ago.
        </Callout>
      ) : (
        <Load q={q}>
          {() => (
            <div className="space-y-5">
              {dup && (
                <Callout tone="warning" title={`This looks like ${dup.name}, already on file (${dup.status})`}>
                  {matchText(dup)}. It can't be made live as a second record — Discard and open deletes this form and opens {dup.name}'s page, unchanged.
                </Callout>
              )}
              {venue ? (
                <VenueManagerForm s={s} d={d} picked={picked} setVenues={setVenues} />
              ) : (
                <OfficerForm s={s} d={d} show={show} setShow={setShow} priv={priv} />
              )}
            </div>
          )}
        </Load>
      )}
    </Sheet>
  );
}

function VenueManagerForm({ s, d, picked, setVenues }) {
  const photo = s.files.find((f) => f.kind === 'photo');
  const typed = (d.venue_names?.length ? d.venue_names : [d.venue_name]).filter(Boolean);
  return (
    <>
      {!s.has_password && <Callout tone="warning">No password on this form — Make live emails them an invite link to set one.</Callout>}
      <Section title="You">
        <KV items={[
          ['Name', `${d.first_name} ${d.last_name}${d.goes_by ? ` (known as ${d.goes_by})` : ''}`],
          ['Job title', d.job_title || '—'],
        ]} />
      </Section>
      <Section title="Contact">
        <KV items={[['Email', `${d.email}${s.has_password ? ' — they sign in with this' : ''}`], ['Mobile', d.phone]]} />
      </Section>
      <Section title="Venues">
        <KV items={[['They wrote', typed.join(', ') || '—']]} />
        <div className="mt-3">
          <Chips label="Link them to" options={(s.venues || []).map((x) => ({ value: x.id, label: x.name }))} value={picked} onChange={setVenues} />
        </div>
        {!picked.length && <p className="mt-2 text-caption text-amber">Pick their venues. If one isn't there yet, add it in Venues first.</p>}
      </Section>
      {photo && <img src={photo.url} alt={`${s.name}'s profile photo`} className="h-24 w-24 rounded-full object-cover" />}
      <p className="text-caption text-muted">
        Sent {dateTime(s.created_at)}. Make live adds them as a Venue manager for the venues ticked, {s.has_password ? 'turns on their Venue portal login with the password they set, and emails them that they can sign in' : 'and emails them an invite to set a password'}.
      </p>
    </>
  );
}

function OfficerForm({ s, d, show, setShow, priv }) {
  const need = stillNeeded(d, s.files);
  return (
    <>
      <Callout tone={need.length ? 'info' : 'success'} title={need.length ? "Can sign in once live, can't be rostered until:" : 'Ready to work once live'}>
        {need.length > 0 && <ul className="list-disc pl-5">{need.map((n) => <li key={n}>{n}</li>)}</ul>}
      </Callout>
      {!s.has_password && <Callout tone="warning">This form was sent before staff set a password on it. Make live emails them an invite link to set one.</Callout>}

      <Section title="You">
        <KV items={[
          ['Name', `${d.first_name} ${d.last_name}${d.goes_by ? ` (known as ${d.goes_by})` : ''}`],
          ['Date of birth', d.dob ? (show ? date(d.dob) : '••••') : '—'],
        ]} />
      </Section>
      <Section title="Contact">
        <KV items={[['Email', `${d.email}${s.has_password ? ' — they sign in with this' : ''}`], ['Mobile', d.phone], ['Address', [d.address, d.postcode].filter(Boolean).join(', ')]]} />
      </Section>
      <Section title="SIA licence">
        <KV items={[['Number', d.sia_number ? siaFmt(d.sia_number) : '—'], ['Expires', d.sia_expiry ? date(d.sia_expiry) : '—']]} />
        <Files files={s.files} kinds={['sia_front', 'sia_back']} />
      </Section>
      <Section title="Right to work">
        <KV items={[['Share code', d.rtw_share_code ? shareFmt(d.rtw_share_code) : '—']]} />
        {d.rtw_share_code && (
          <a href="https://www.gov.uk/view-right-to-work" target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-subhead font-semibold text-blue">
            Check on GOV.UK <ExternalLink size={14} />
          </a>
        )}
        <Files files={s.files} kinds={['rtw']} />
      </Section>
      <Section title="Pay">
        <div className="-mt-1 mb-1 flex justify-end">
          <Button variant="plain" size="sm" icon={Eye} onClick={() => setShow((x) => !x)}>{show ? 'Hide' : 'Show'}</Button>
        </div>
        <KV items={[
          ['NI number', d.ni_number ? priv(d.ni_number) : '—'],
          ['Bank', d.bank_name || '—'],
          ['Sort code / account', d.bank_account ? `${priv(d.bank_sort_code)} · ${priv(d.bank_account)}` : '—'],
        ]} />
      </Section>
      <Section title="Emergency contact">
        <KV items={[['Contact', d.ec_name ? `${d.ec_name}${d.ec_relationship ? ` (${d.ec_relationship})` : ''} · ${d.ec_phone}` : '—']]} />
      </Section>
      <Section title="Other documents">
        <Files files={s.files} kinds={['poa', 'photo']} />
      </Section>
      <p className="text-caption text-muted">
        Sent {dateTime(s.created_at)}. Make live adds them to Staff as active with each answer in its section, {s.has_password ? 'turns on their Officer app login with the password they set, and emails them that they can sign in' : 'and emails them an invite to set a password'}. Orb then reads their SIA card and passport.
      </p>
    </>
  );
}

/** People: "N new staff forms to check", the list behind it (?forms=1) and one form (?form=<id>, from the bell) */
export function StaffForms({ base = '/company' }) {
  const list = useApi('staffSetup.list');
  const [url, setUrl] = useUrlState({ forms: '', form: '' });
  const forms = list.data || [];
  const n = forms.length;
  const listOpen = url.forms === '1';
  const close = () => setUrl({ form: null });
  return (
    <>
      {n > 0 && (
        <Callout icon={UserPlus} className="mb-4" title={`${n} new staff ${n === 1 ? 'form' : 'forms'} to check`}
          action={<Button size="sm" onClick={() => (n === 1 ? setUrl({ form: forms[0].id }) : setUrl({ forms: '1' }))}>{n === 1 ? 'Check it' : 'Check them'}</Button>}>
          {n === 1 ? `${forms[0].name} sent their details.` : 'Officers and venue managers sent their details through the links.'} Check and make them live — they sign in with the password they set.
        </Callout>
      )}
      <Sheet open={listOpen} onClose={() => setUrl({ forms: null })} title="New staff forms" size="md">
        <Load q={list} skeleton="rows" n={3}>
          {() => (n ? (
            <List>
              {forms.map((s) => (
                <Row key={s.id} onClick={() => setUrl({ forms: null, form: s.id })} chevron left={<Avatar name={s.name} size={36} />}
                  title={s.name}
                  subtitle={[
                    s.kind === 'venue' ? (s.venue_names?.length ? s.venue_names : [s.venue_name]).filter(Boolean).join(', ') || 'No venue written'
                      : s.sia_number ? `SIA ${siaFmt(s.sia_number)}` : 'No SIA number',
                    `sent ${date(s.created_at)}`,
                  ].join(' · ')}
                  right={s.duplicate ? <Pill tone="amber">Already on file: {s.duplicate.name}</Pill> : <Pill>{s.kind === 'venue' ? 'Venue manager' : 'Officer'}</Pill>} />
              ))}
            </List>
          ) : <Empty icon={UserPlus} title="Nothing waiting" body="When officers or venue managers send the form, their details show here." />)}
        </Load>
      </Sheet>
      <StaffFormSheet id={url.form || null} onClose={close} onDone={list.reload} base={base} />
    </>
  );
}
