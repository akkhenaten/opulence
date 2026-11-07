// Check right to work: the manager checks the officer's share code on GOV.UK (the Home Office has no API for employers),
// saves the check page as a PDF and uploads it here. The AI reads the page to fill in the result; saving records the
// check, which is the only way right to work becomes verified.
import { useState } from 'react';
import { Copy, ExternalLink, FileText, Loader2 } from 'lucide-react';
import { api, upload } from '../../api.js';
import { Button, Callout, date, Input, Segmented, Sheet, Toggle, useAction, useToast } from '../../ui/index.jsx';
import { FilePick } from '../public/Apply.jsx';

const GOV_CHECK_URL = 'https://www.gov.uk/view-right-to-work';
const words = (s) => String(s || '').toLowerCase().split(/[^a-z]+/).filter(Boolean);

export default function RtwCheckSheet({ o, onClose, onDone }) {
  const toast = useToast();
  const [run, busy] = useAction();
  const [manual, setManual] = useState(!o.rtw_share_code);
  const [file, setFile] = useState(null);
  const [key, setKey] = useState(null);
  const [reading, setReading] = useState(false);
  const [read, setRead] = useState(null);
  const [permission, setPermission] = useState('');
  const [expiry, setExpiry] = useState('');
  const [matched, setMatched] = useState(false);

  const copy = async (text, what) => {
    try { await navigator.clipboard.writeText(text); toast(`${what} copied`); } catch { toast('Could not copy. Select it and copy it by hand.', 'error'); }
  };
  // Upload straight away, then let the AI read the page to fill in the result
  const choose = async (f) => {
    setFile(f); setKey(null); setRead(null);
    if (!f) return;
    setReading(true);
    try {
      const k = await upload(f, 'officer');
      setKey(k);
      if (!manual) {
        const r = await api('officers.rtwRead', { s3_key: k, mime: f.type || null });
        setRead(r);
        if (r.permission !== 'unknown') setPermission(r.permission);
        if (r.expiry) setExpiry(r.expiry);
      }
    } catch (e) {
      toast(e.message || 'Upload failed', 'error');
      setFile(null);
    } finally {
      setReading(false);
    }
  };
  const nameOff = read?.name && !(words(read.name).includes(words(o.first_name)[0]) && words(read.name).includes(words(o.last_name).pop()));
  const ok = key && permission && (permission === 'unlimited' || expiry) && matched && !reading;
  const save = () => run(() => api('officers.rtwCheck', {
    id: o.id, method: manual ? 'manual' : 'share_code', s3_key: key, mime: file?.type || null, permission, expiry: permission === 'time_limited' ? expiry : null,
    photo_matched: matched, read, share_code: o.rtw_share_code,
  }), 'Right to work check saved').then(() => { onDone(); onClose(); }).catch(() => {});

  return (
    <Sheet open onClose={onClose} title="Check right to work"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!ok} onClick={save}>Save check</Button></>}>
      <div className="space-y-5">
        <Segmented full value={manual ? 'manual' : 'code'} onChange={(x) => { setManual(x === 'manual'); setRead(null); }}
          options={[{ value: 'code', label: 'Share code' }, { value: 'manual', label: 'British or Irish passport' }]} />

        {manual ? (
          <Step n={1} title="Check the original document">
            <ol className="list-decimal space-y-1 pl-5 text-subhead text-muted">
              <li>See their original British or Irish passport (or passport card), with them present in person.</li>
              <li>Check the photo and date of birth match the person, and it isn't damaged or altered.</li>
              <li>Copy the photo page, write "checked on {date(new Date().toISOString().slice(0, 10))}" on the copy, and upload it below.</li>
            </ol>
          </Step>
        ) : (
          <Step n={1} title="Check the share code on GOV.UK">
            <div className="grid gap-2 sm:grid-cols-2">
              <CopyRow label="Share code" value={o.rtw_share_code || '—'} onCopy={o.rtw_share_code && (() => copy(o.rtw_share_code.replace(/\s/g, ''), 'Share code'))} />
              <CopyRow label="Date of birth" value={o.dob ? date(o.dob) : 'Not on the profile'} onCopy={o.dob && (() => copy(new Date(`${o.dob}T00:00:00`).toLocaleDateString('en-GB'), 'Date of birth'))} />
            </div>
            {!o.rtw_share_code && <p className="text-caption text-amber">No share code yet. Ask them for one (they get it at gov.uk/prove-right-to-work).</p>}
            <Button icon={ExternalLink} variant="secondary" onClick={() => window.open(GOV_CHECK_URL, '_blank', 'noopener')}>Open GOV.UK check</Button>
            <ol className="list-decimal space-y-1 pl-5 text-subhead text-muted">
              <li>Enter the share code and date of birth on GOV.UK.</li>
              <li>Check the photo there is the person who works for you (in person or on a live video call).</li>
              <li>Download the page as a PDF (Save as PDF) and upload it below.</li>
            </ol>
          </Step>
        )}

        <Step n={2} title={manual ? 'Upload your copy' : 'Upload the GOV.UK page'}>
          <FilePick label="" accept="application/pdf,image/*" icon={FileText} file={file} onChange={choose} />
          {reading && <div className="flex items-center gap-2 text-subhead text-muted"><Loader2 size={16} className="animate-spin" /> {manual ? 'Uploading…' : 'Reading the check page…'}</div>}
          {read && !reading && (
            read.error ? <Callout tone="warning">{read.error}</Callout>
              : !read.is_gov_check ? <Callout tone="warning">This doesn't look like the GOV.UK right to work page. Check you uploaded the right file.</Callout>
                : (
                  <Callout tone={nameOff || read.concerns.length ? 'warning' : 'success'}>
                    {read.name ? `Reads: ${read.name}` : 'Read the check page'}
                    {read.permission === 'unlimited' ? ' · no time limit' : read.permission === 'time_limited' ? ` · until ${read.expiry ? date(read.expiry) : '?'}` : ''}
                    {nameOff && ` — the name doesn't match ${o.first_name} ${o.last_name}.`}
                    {read.concerns.length > 0 && ` ${read.concerns.join('; ')}`}
                  </Callout>
                )
          )}
        </Step>

        <Step n={3} title="Confirm the result">
          <Segmented full value={permission} onChange={setPermission}
            options={[{ value: 'unlimited', label: 'No time limit' }, { value: 'time_limited', label: 'Time-limited' }]} />
          {permission === 'time_limited' && (
            <Input label="Permission to work ends" type="date" hint="You'll be reminded to do a follow-up check before this date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          )}
          <div className="rounded-2xl bg-bg px-4 py-2">
            <Toggle checked={matched} onChange={setMatched} label="The photo matches this person" hint="You have seen them in person or on a live video call" />
          </div>
        </Step>
      </div>
    </Sheet>
  );
}

function Step({ n, title, children }) {
  return (
    <div className="space-y-3">
      <div className="text-footnote font-semibold uppercase tracking-wide text-muted">{n}. {title}</div>
      {children}
    </div>
  );
}

function CopyRow({ label, value, onCopy }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-bg px-4 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-caption text-muted">{label}</div>
        <div className="truncate text-callout font-semibold num">{value}</div>
      </div>
      {onCopy && <Button variant="plain" size="sm" icon={Copy} onClick={onCopy}>Copy</Button>}
    </div>
  );
}
