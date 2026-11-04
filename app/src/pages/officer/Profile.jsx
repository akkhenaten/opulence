import { useRef, useState } from 'react';
import { Award, Camera, MessageSquareText, Plus, Save, Smartphone, Trash2 } from 'lucide-react';
import { api, upload } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Avatar, Button, date, Input, KV, List, Load, Page, Pill, Pressable, Row, Section, Tile, titleCase, Toggle, useAction, useApi } from '../../ui/index.jsx';
import { compressImage, NotLinked } from './_parts.jsx';

const FIELDS = ['phone', 'address', 'postcode', 'dob', 'ni_number', 'utr', 'bank_name', 'bank_sort_code', 'bank_account'];

export default function Profile() {
  const { user } = useAuth();
  const q = useApi('officers.get', {}, { skip: !user.officer_id });
  const notes = useApi('hrnotes.list', {}, { skip: !user.officer_id });
  if (!user.officer_id) return <Page title="My details" back={{ to: '/officer/me', label: 'Me' }}><NotLinked /></Page>;
  return (
    <Page title="My details" back={{ to: '/officer/me', label: 'Me' }}>
      <Load q={q}>{(o) => <Editor o={o} reload={q.reload} notes={notes.data || []} />}</Load>
    </Page>
  );
}

function Editor({ o, reload, notes }) {
  const { refresh } = useAuth();
  const init = Object.fromEntries(FIELDS.map((k) => [k, o[k] ?? '']));
  const [v, setV] = useState(init);
  const [name, setName] = useState(o.name);
  const nameBad = name.trim().length < 2;
  const [contacts, setContacts] = useState(() => (o.emergency_contacts?.length ? o.emergency_contacts : [{ name: '', relationship: '', phone: '' }]).map(({ name, relationship, phone }) => ({ name, relationship, phone })));
  const [photo, setPhoto] = useState(o.photo_url);
  const [run, busy] = useAction();
  const [runPhoto, photoBusy] = useAction();
  const file = useRef(null);
  const set = (k) => (e) => setV((s) => ({ ...s, [k]: e.target.value }));
  const setC = (i, k) => (e) => setContacts((cs) => cs.map((c, j) => (j === i ? { ...c, [k]: e.target.value } : c)));

  const sort = v.bank_sort_code.replace(/\D/g, '');
  const acct = v.bank_account.replace(/\D/g, '');
  const sortBad = sort && sort.length !== 6;
  const acctBad = acct && acct.length !== 8;
  const niBad = v.ni_number && !/^[A-CEGHJ-PR-TW-Z]{2}\d{6}[A-D]$/i.test(v.ni_number.replace(/\s/g, ''));
  const utrBad = v.utr && v.utr.replace(/\D/g, '').length !== 10;

  const save = () => run(async () => {
    const body = { ...v, dob: v.dob || null, ni_number: v.ni_number.replace(/\s/g, '').toUpperCase(), utr: v.utr.replace(/\D/g, ''), postcode: v.postcode.toUpperCase().trim() };
    if (sort) body.bank_sort_code = `${sort.slice(0, 2)}-${sort.slice(2, 4)}-${sort.slice(4, 6)}`;
    if (name.trim() !== o.name) await api('auth.updateMe', { name });
    await api('officers.save', body);
    await api('officers.saveContacts', { contacts: contacts.filter((c) => c.name.trim()) });
    refresh?.();
  }, 'Details saved').then(reload).catch(() => {});

  const changePhoto = async (e) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    runPhoto(async () => {
      const c = await compressImage(f, 800, 0.85);
      const key = await upload(c, 'photo');
      await api('officers.save', { photo_key: key });
      setPhoto(URL.createObjectURL(c));
      refresh?.();
    }, 'Photo updated').catch(() => {});
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 rounded-tile bg-surface p-4 shadow-tile">
        <Pressable press onClick={() => file.current?.click()} className="relative shrink-0 rounded-full" aria-label="Change photo">
          <Avatar name={o.name} src={photo} size={72} />
          <span className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-blue text-white ring-4 ring-surface">{photoBusy ? <span className="h-3 w-3 animate-pulse rounded-full bg-white" /> : <Camera size={16} />}</span>
        </Pressable>
        <input ref={file} type="file" accept="image/*" capture="user" className="hidden" onChange={changePhoto} />
        <div className="min-w-0">
          <div className="display truncate text-title3 font-bold">{o.name}</div>
          <div className="truncate text-subhead text-muted">{o.email}</div>
          <div className="mt-0.5 text-caption text-faint">You sign in with this email. The office can change it.</div>
        </div>
      </div>

      <Section title="Contact">
        <Tile>
          <div className="space-y-3">
            <Input label="Name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} hint={nameBad ? 'Enter your name' : 'As it appears on your SIA licence'} />
            <Input label="Mobile" type="tel" inputMode="tel" autoComplete="tel" value={v.phone} onChange={set('phone')} />
            <Input label="Address" autoComplete="street-address" value={v.address} onChange={set('address')} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Postcode" autoComplete="postal-code" autoCapitalize="characters" value={v.postcode} onChange={set('postcode')} />
              <Input label="Date of birth" type="date" value={v.dob || ''} onChange={set('dob')} />
            </div>
          </div>
        </Tile>
      </Section>

      <Section title="Tax">
        <Tile>
          <div className="space-y-3">
            <Input label="National Insurance number" autoCapitalize="characters" placeholder="QQ123456C" value={v.ni_number} onChange={set('ni_number')} hint={niBad ? 'This does not look like an NI number' : undefined} />
            <Input label="UTR (Unique Taxpayer Reference)" inputMode="numeric" placeholder="10 digits" value={v.utr} onChange={set('utr')} hint={utrBad ? 'A UTR has 10 digits' : 'From HMRC when you registered as self-employed'} />
          </div>
        </Tile>
      </Section>

      <Section title="Bank">
        <Tile>
          <div className="space-y-3">
            <Input label="Bank name" value={v.bank_name} onChange={set('bank_name')} />
            <div className="grid grid-cols-2 gap-3">
              <Input label="Sort code" inputMode="numeric" placeholder="12-34-56" value={v.bank_sort_code} onChange={set('bank_sort_code')} hint={sortBad ? '6 digits' : undefined} />
              <Input label="Account number" inputMode="numeric" placeholder="8 digits" value={v.bank_account} onChange={set('bank_account')} hint={acctBad ? '8 digits' : undefined} />
            </div>
            <p className="text-caption text-muted">Your pay is sent to this account. Double-check it before saving.</p>
          </div>
        </Tile>
      </Section>

      <Section title="Emergency contacts" action={contacts.length < 3 && <Button size="sm" variant="ghost" icon={Plus} onClick={() => setContacts((c) => [...c, { name: '', relationship: '', phone: '' }])}>Add</Button>}>
        <div className="space-y-2">
          {contacts.map((c, i) => (
            <Tile key={i}>
              <div className="space-y-3">
                <div className="flex items-end gap-2">
                  <Input className="flex-1" label="Name" value={c.name} onChange={setC(i, 'name')} />
                  <Button variant="ghost" size="sm" icon={Trash2} aria-label="Remove contact" className="mb-1 text-red" onClick={() => setContacts((cs) => cs.filter((_, j) => j !== i))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Relationship" value={c.relationship} onChange={setC(i, 'relationship')} placeholder="e.g. Partner" />
                  <Input label="Phone" type="tel" inputMode="tel" value={c.phone} onChange={setC(i, 'phone')} />
                </div>
              </div>
            </Tile>
          ))}
        </div>
      </Section>

      <Button size="lg" icon={Save} className="w-full" busy={busy} disabled={sortBad || acctBad || nameBad} onClick={save}>Save details</Button>

      <Section title="Licence and right to work">
        <Tile>
          <KV items={[
            ['SIA licence', o.sia_number],
            ['SIA type', o.sia_type],
            ['SIA expiry', o.sia_expiry && date(o.sia_expiry)],
            ['Right to work', o.rtw_verified ? `Verified${o.rtw_expiry ? ` until ${date(o.rtw_expiry)}` : ''}` : 'Not yet verified'],
            ['Roles', (o.roles || []).map(titleCase).join(', ')],
            ['Start date', o.start_date && date(o.start_date)],
          ]} />
          <p className="mt-3 text-caption text-muted">These are updated by the office when they verify your documents.</p>
        </Tile>
      </Section>

      <MyPhone />

      {o.rates?.length > 0 && (
        <Section title="My pay rates">
          <List>
            {o.rates.map((r) => <Row key={r.id} title={r.role_name} subtitle={[r.venue_name || 'All venues', `from ${date(r.effective_from)}`].join(' · ')} right={<span className="num font-semibold">£{Number(r.rate).toFixed(2)}/h</span>} />)}
          </List>
        </Section>
      )}

      {notes.length > 0 && (
        <Section title="From the office">
          <List>
            {notes.map((n) => (
              <div key={n.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2 font-semibold">
                    {n.kind === 'commendation' ? <Award size={18} className="shrink-0 text-green" /> : <MessageSquareText size={18} className="shrink-0 text-muted" />}
                    <span className="truncate">{n.title}</span>
                  </div>
                  <Pill tone={n.kind === 'commendation' ? 'green' : n.kind === 'warning' ? 'red' : 'grey'}>{titleCase(n.kind)}{n.level ? ` (${n.level})` : ''}</Pill>
                </div>
                {n.body && <p className="mt-1 whitespace-pre-line text-subhead text-muted">{n.body}</p>}
                <div className="mt-1 text-caption text-faint">{date(n.created_at)}{n.author_name ? ` · ${n.author_name}` : ''}</div>
              </div>
            ))}
          </List>
        </Section>
      )}
    </div>
  );
}

// The phone this officer clocks in with, and their choice about the selfie face check
function MyPhone() {
  const q = useApi('device.mine');
  const [run, busy] = useAction();
  const setConsent = (on) => run(() => api('officers.faceConsent', { consent: on }), on ? 'Face check allowed' : 'Face check turned off').then(q.reload).catch(() => {});
  return (
    <Section title="Clock-in phone">
      <Load q={q}>
        {(d) => (
          <Tile>
            {!d.devices.length ? (
              <p className="text-subhead text-muted">No phone registered yet. You'll be asked to register this phone the first time you clock in.</p>
            ) : (
              <div className="divide-y divide-line">
                {d.devices.map((x) => (
                  <div key={x.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-soft text-blue"><Smartphone size={18} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{x.label}</div>
                      <div className="text-footnote text-muted">Registered {date(x.created_at)}{x.last_used_at ? ` · last used ${date(x.last_used_at)}` : ''}</div>
                    </div>
                    {x.status === 'pending' ? <Pill tone="amber">Waiting for approval</Pill> : <Pill tone="green">Active</Pill>}
                  </div>
                ))}
              </div>
            )}
            <p className="mt-3 text-caption text-muted">Changed phone? Clock in on the new one and register it. A manager approves it before it replaces this one.</p>
            {d.face_match_enabled && (
              <div className="mt-3 rounded-xl bg-bg px-4 py-2">
                <Toggle label="Compare my clock-in selfies with my profile photo" hint="Only flags a selfie for a manager to look at; it never stops you clocking in. Selfies are deleted after 90 days."
                  checked={d.face_consent === 'given'} disabled={busy} onChange={setConsent} />
              </div>
            )}
          </Tile>
        )}
      </Load>
    </Section>
  );
}
