// Officer: read every document in a venue's site pack, tick each one, then sign. Clock-in waits for this.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, CheckCircle2, ChevronRight, Clock, Download, FileSignature, ShieldCheck, WifiOff } from 'lucide-react';
import { api, downloadAction } from '../../api.js';
import { ActionBar, Button, cx, date, dateTime, Load, Page, Progress, SearchInput, Toggle, useAction, useApi, useToast } from '../../ui/index.jsx';
import { SignStep, Stepper, useReadProgress } from './SignFlow.jsx';
import { docKind, PackPaper, PackPill } from '../shared/PackPaper.jsx';

const STEPS = ['Read', 'Sign', 'Done'];

export default function VenuePack() {
  const { venueId } = useParams();
  const [params] = useSearchParams();
  const q = useApi('venuePacks.mine', { venue_id: venueId });
  const cached = usePackCache(venueId, q);
  const back = params.get('then') === 'clock' ? { to: '/officer/clock', label: 'Clock in' } : { to: '/officer/documents', label: 'Documents' };
  return (
    <Page title="Site pack" subtitle={(q.data || cached)?.venue?.name} back={back} actions={q.data && <PackPill status={q.data.status} />}>
      {!q.data && q.error && cached ? <Offline p={cached} /> : <Load q={q} skeleton="rows">{(p) => <PackFlow p={p} venueId={venueId} reload={q.reload} then={params.get('then')} />}</Load>}
    </Page>
  );
}

function PackFlow({ p, venueId, reload, then }) {
  const nav = useNavigate();
  const toast = useToast();
  const [open, setOpen] = useState(null); // procedure_id being read
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(null);
  const [run, busy] = useAction();
  const must = p.documents.filter((d) => d.must_read);
  const read = must.filter((d) => d.read_at);
  const ready = must.length > 0 && read.length === must.length;
  useEffect(() => { window.scrollTo({ top: 0 }); }, [open, signing, signed]);

  if (p.status === 'none') {
    return <div className="rounded-tile bg-surface p-6 text-center shadow-tile"><BookOpen className="mx-auto text-muted" /><p className="mt-2 text-subhead text-muted">Nothing has been published for this venue yet. There is nothing to sign.</p></div>;
  }

  const doc = open && p.documents.find((d) => d.procedure_id === open);
  if (doc) {
    return <ReadDoc d={doc} venueId={venueId} onBack={() => setOpen(null)}
      onRead={(next) => { reload(); const after = must.find((m) => !m.read_at && m.procedure_id !== doc.procedure_id); setOpen(next && after ? after.procedure_id : null); }}
      onStale={() => { toast('This document has just been updated. Here is the latest version.', 'error'); reload(); }} />;
  }

  if (signed || p.status === 'current') {
    const s = signed || p.signing;
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        {signed && <Stepper step={2} steps={STEPS} />}
        <div className="anim-pop rounded-tile bg-surface p-6 text-center shadow-tile">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-green-soft text-green"><CheckCircle2 size={30} /></div>
          <h2 className="display mt-3 text-title2 font-bold">{signed ? 'Signed' : 'Signed and up to date'}</h2>
          <p className="mt-1 text-subhead text-muted">{p.venue.name} · {dateTime(s?.signed_at || new Date())}</p>
          {s?.reference && (
            <div className="mx-auto mt-4 inline-flex items-center gap-2 rounded-full bg-bg px-3.5 py-1.5 text-footnote">
              <ShieldCheck size={15} className="text-green" /><span className="text-muted">Reference</span><span className="num font-semibold">{s.reference}</span>
            </div>
          )}
          <p className="mx-auto mt-3 max-w-sm text-footnote text-muted">A sealed copy of everything you signed is saved in your Documents. You can reread the pack any time from your shift.</p>
          <div className="mt-4 flex flex-col justify-center gap-2 sm:flex-row">
            {then === 'clock' && <Button size="lg" icon={Clock} onClick={() => nav('/officer/clock')}>Back to clock in</Button>}
            {s?.id && <Button size="lg" variant={then === 'clock' ? 'secondary' : 'primary'} icon={Download} busy={busy} onClick={() => run(() => downloadAction('venuePacks.pdf', { id: s.id })).catch(() => {})}>Download signed PDF</Button>}
          </div>
        </div>
        <Searchable docs={p.documents} onOpen={setOpen} done />
      </div>
    );
  }

  if (signing) {
    return (
      <div className="mx-auto max-w-3xl">
        <Stepper step={1} steps={STEPS} />
        <SignStep defaultName={p.default_name} back={() => setSigning(false)}
          d={{ kind: 'venue_pack', reference: '', doc: { typeLabel: 'Site pack', title: `${p.venue.name}: instructions and procedures` } }}
          sign={(signature, signed_name) => api('venuePacks.sign', { venue_id: venueId, signature, signed_name })}
          done={(r) => { setSigned({ id: r.id, reference: r.reference, signed_at: new Date().toISOString() }); reload(); }}>
          <ul className="mt-3 space-y-1.5 rounded-2xl bg-bg p-3 text-footnote">
            {p.documents.map((d) => (
              <li key={d.procedure_id} className="flex items-start gap-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-green" /><span className="min-w-0"><span className="font-semibold">{d.title}</span> <span className="text-muted">v{d.version}{d.must_read ? '' : ' · signed before, unchanged'}</span></span></li>
            ))}
          </ul>
        </SignStep>
      </div>
    );
  }

  const intro = {
    unsigned: `Before your first shift at ${p.venue.name}, read each document below to the end and tick it. Then sign once for the whole pack. You cannot clock in here until it is signed.`,
    resign: `Something important has changed since you last signed. Read the ${must.length === 1 ? 'updated document' : `${must.length} updated documents`} and sign again before you clock in.`,
    refresher: `You have not worked at ${p.venue.name} for over six months. Read the whole pack again and sign before you clock in.`,
  }[p.status];

  return (
    <div className="mx-auto max-w-3xl">
      <Stepper step={0} steps={STEPS} />
      <p className="mb-3 text-subhead text-muted">{intro}</p>
      <div className="mb-3 rounded-2xl bg-surface p-3.5 shadow-tile">
        <div className="mb-1.5 flex items-center justify-between text-footnote font-semibold"><span>{read.length} of {must.length} read</span>{ready && <span className="text-green">Ready to sign</span>}</div>
        <Progress value={read.length} max={must.length} />
      </div>
      <DocList docs={p.documents} onOpen={setOpen} />
      <ActionBar tone="light">
        <span className="text-subhead font-semibold">{ready ? 'All read' : `${must.length - read.length} to read`}</span>
        {ready
          ? <Button icon={FileSignature} onClick={() => setSigning(true)}>Continue to sign</Button>
          : <Button icon={BookOpen} onClick={() => setOpen((must.find((d) => !d.read_at) || must[0]).procedure_id)}>Read next</Button>}
      </ActionBar>
    </div>
  );
}

function DocList({ docs, onOpen, done }) {
  return (
    <ul className="overflow-hidden rounded-2xl bg-surface shadow-tile">
      {docs.map((d, i) => {
        const state = done ? 'Signed' : !d.must_read ? 'Signed before, unchanged' : d.read_at ? `Read ${dateTime(d.read_at)}` : 'To read';
        return (
          <li key={d.procedure_id} className={cx(i > 0 && 'border-t border-hairline')}>
            <button type="button" onClick={() => onOpen(d.procedure_id)} className="pressable flex w-full items-center gap-3 px-4 py-3 text-left">
              <span className={cx('grid h-9 w-9 shrink-0 place-items-center rounded-full', done || !d.must_read || d.read_at ? 'bg-green-soft text-green' : 'bg-amber-soft text-amber')}>
                {done || !d.must_read || d.read_at ? <CheckCircle2 size={18} /> : <span className="num text-footnote font-bold">{i + 1}</span>}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-semibold">{d.title}</span>
                <span className="block truncate text-footnote text-muted">{docKind(d)} · v{d.version} · {state}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-faint" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function ReadDoc({ d, venueId, onBack, onRead, onStale }) {
  const paper = useRef(null);
  const end = useRef(null);
  const [pct, seen] = useReadProgress(paper, end, true);
  const [agree, setAgree] = useState(!!d.read_at);
  const [run, busy] = useAction();
  const need = d.must_read && !d.read_at;
  const tick = () => run(() => api('venuePacks.read', { venue_id: venueId, procedure_id: d.procedure_id, version: d.version }))
    .then(() => onRead(true)).catch((e) => { if (e.data?.code === 'stale') onStale(); });
  return (
    <div className="mx-auto max-w-3xl">
      <div className="sticky top-[calc(56px+env(safe-area-inset-top))] z-20 -mx-[var(--px)] mb-3 bg-bg/90 px-[var(--px)] py-2 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3 text-footnote">
          <button type="button" onClick={onBack} className="pressable inline-flex items-center gap-1 font-semibold text-blue"><ArrowLeft size={16} />All documents</button>
          <span className="num text-muted">{pct}%</span>
        </div>
        <Progress value={pct} max={100} className="mt-1.5" />
      </div>
      <div ref={paper}><PackPaper ref={end} doc={d} /></div>
      {need ? (
        <div className="mt-4 rounded-tile bg-surface p-4 shadow-tile">
          <div className="rounded-2xl bg-bg px-3">
            <Toggle checked={agree} onChange={setAgree} label="I have read and understood this"
              hint={seen ? `${d.title}, version ${d.version}` : 'Scroll to the end of the document first'} />
          </div>
          <Button size="lg" className="mt-3 w-full" busy={busy} disabled={!agree || !seen} onClick={tick}>Done, next document</Button>
        </div>
      ) : (
        <Button size="lg" variant="secondary" className="mt-4 w-full" icon={ArrowLeft} onClick={onBack}>
          {d.read_at ? `Read ${date(d.read_at)} · back to the list` : 'Back to the list'}
        </Button>
      )}
    </div>
  );
}

// The last pack this phone loaded, so officers can reread it on a weak signal
const cacheKey = (venueId) => `sitePack:${venueId}`;
function usePackCache(venueId, q) {
  const [cached] = useState(() => { try { return JSON.parse(localStorage.getItem(cacheKey(venueId))); } catch { return null; } });
  useEffect(() => { if (q.data && q.data.status !== 'none') try { localStorage.setItem(cacheKey(venueId), JSON.stringify(q.data)); } catch { /* storage full */ } }, [q.data, venueId]);
  return cached;
}

const text = (d) => `${d.title} ${JSON.stringify(d.blocks || [])}`.toLowerCase();

function Searchable({ docs, onOpen, done }) {
  const [term, setTerm] = useState('');
  const t = term.trim().toLowerCase();
  const rows = t ? docs.filter((d) => text(d).includes(t)) : docs;
  return (
    <div className="space-y-2">
      {docs.length > 2 && <SearchInput value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search the pack, e.g. fire, keys, refusal" />}
      {rows.length ? <DocList docs={rows} onOpen={onOpen} done={done} /> : <p className="px-1 text-footnote text-muted">Nothing in the pack mentions “{term}”.</p>}
    </div>
  );
}

function Offline({ p }) {
  const [open, setOpen] = useState(null);
  const doc = open && p.documents.find((d) => d.procedure_id === open);
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      <p className="flex items-center gap-2 rounded-2xl bg-amber-soft px-3.5 py-2.5 text-footnote"><WifiOff size={16} className="shrink-0 text-amber" />No connection. This is the copy saved on your phone; it may be out of date.</p>
      {doc ? <>
        <button type="button" onClick={() => setOpen(null)} className="pressable inline-flex items-center gap-1 text-footnote font-semibold text-blue"><ArrowLeft size={16} />All documents</button>
        <PackPaper doc={doc} />
      </> : <Searchable docs={p.documents} onOpen={setOpen} done />}
    </div>
  );
}

/** On the officer's shift: the venue's pack, and a nudge when it still needs signing */
export function SitePackCard({ venueId }) {
  const q = useApi('venuePacks.mine', { venue_id: venueId });
  usePackCache(venueId, q);
  const p = q.data;
  if (!p || p.status === 'none') return null;
  const ok = p.status === 'current';
  return (
    <Button variant="plain" to={`/officer/venue-pack/${venueId}`}
      className={cx('!h-auto w-full !justify-start gap-3 rounded-tile !px-4 !py-3.5 text-left shadow-tile', ok ? 'bg-surface' : 'bg-amber-soft')}>
      <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', ok ? 'bg-blue-soft text-blue' : 'bg-amber text-white')}>{ok ? <BookOpen size={20} /> : <FileSignature size={20} />}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold">{ok ? 'Site instructions & procedures' : 'Read and sign the site pack'}</span>
        <span className="block truncate text-footnote font-normal text-muted">
          {ok ? `${p.documents.length} document${p.documents.length === 1 ? '' : 's'} · signed ${date(p.signing?.signed_at)}` : 'You cannot clock in here until it is signed'}
        </span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-faint" />
    </Button>
  );
}
