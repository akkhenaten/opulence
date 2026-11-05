import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Plus, ShieldCheck } from 'lucide-react';
import { api } from '../../api.js';
import {
  Avatar, Bento, Button, cx, date, IconButton, Load, Page, Pill, Pressable, relative, Sheet, Stat, Tile, Toggle, useAction, useApi, useConfirm,
} from '../../ui/index.jsx';
import { ComplianceBadge, CopyLink, Progress, useRoles } from './_parts.jsx';
import { AddOfficerSheet } from './Staff.jsx';
import { ApplicationSheet } from './_application.jsx';

const STAGES = [
  { key: 'applicant', label: 'Applicants', hint: 'Interested, not yet started' },
  { key: 'onboarding', label: 'Onboarding', hint: 'Collecting documents and checks' },
  { key: 'active', label: 'Recently active', hint: 'Started in the last 60 days' },
];
const NEXT = { applicant: 'onboarding', onboarding: 'active' };
const PREV = { onboarding: 'applicant' };

export default function Recruitment() {
  const pipeline = useApi('onboarding.pipeline');
  const active = useApi('officers.list', { status: 'active' });
  const { roles, name: roleName } = useRoles();
  const [adding, setAdding] = useState(false);
  const [hiring, setHiring] = useState(null);
  // An online application opens in its own sheet; ?applicant=<id> comes from the "New application" notification
  const [params, setParams] = useSearchParams();
  const applicant = params.get('applicant');
  const review = (p) => setParams((s) => { s.set('applicant', p.id); return s; });
  const closeReview = () => setParams((s) => { s.delete('applicant'); return s; }, { replace: true });
  const [run] = useAction();
  const confirm = useConfirm();
  const reload = () => { pipeline.reload(); active.reload(); };

  // Returns the server reply (with invite_link when a login was sent), or null when nothing changed
  const setStatus = async (p, status, extra = {}) => {
    let r = null;
    try {
      r = await run(() => api('onboarding.setStatus', { officer_id: p.id, status, ...extra }), `${p.name} moved to ${status}`);
    } catch (e) {
      if (e.status !== 422) return null;
      if (!(await confirm({ title: 'Not compliant yet', body: `${e.message}. Make ${p.name} active anyway?`, confirm: 'Make active', danger: true }))) return null;
      r = await run(() => api('onboarding.setStatus', { officer_id: p.id, status, force: true, ...extra }), `${p.name} is now active`).catch(() => null);
    }
    reload();
    return r;
  };
  // Hiring someone without a login yet: offer to email them one
  const move = (p, status) => (status === 'active' && p.email && !p.login_status ? setHiring(p) : setStatus(p, status));

  const cutoff = Date.now() - 60 * 86400000;
  const recent = (active.data || []).filter((o) => new Date(o.start_date || o.created_at).getTime() >= cutoff)
    .sort((a, b) => String(b.start_date || b.created_at).localeCompare(String(a.start_date || a.created_at)));
  const rows = pipeline.data || [];
  const cols = { applicant: rows.filter((r) => r.status === 'applicant'), onboarding: rows.filter((r) => r.status === 'onboarding'), active: recent };
  const ready = cols.onboarding.filter((r) => r.total && Number(r.done) === Number(r.total)).length;

  return (
    <Page title="Recruitment" subtitle="From applicant to first shift" wide photo="crowd" actions={<Button icon={Plus} onClick={() => setAdding(true)}>Add applicant</Button>}>
      <Load q={pipeline}>
        {() => (
          <>
            <Bento className="mb-5">
              <Tile><Stat value={cols.applicant.length} label="Applicants" /></Tile>
              <Tile><Stat value={cols.onboarding.length} label="Onboarding" /></Tile>
              <Tile><Stat value={ready} label="Ready to activate" tone={ready ? 'green' : undefined} hint="All steps done" /></Tile>
              <Tile><Stat value={recent.length} label="Started" hint="Last 60 days" /></Tile>
            </Bento>
            <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:grid lg:grid-cols-3 lg:overflow-visible">
              {STAGES.map((s) => (
                <section key={s.key} className="w-[85vw] max-w-sm shrink-0 snap-start rounded-tile bg-fill-strong/60 p-3 sm:w-80 lg:w-auto lg:max-w-none">
                  <div className="mb-3 flex items-baseline justify-between px-1">
                    <div>
                      <h2 className="text-callout font-bold">{s.label} <span className="num ml-1 text-muted">{cols[s.key].length}</span></h2>
                      <p className="text-caption text-muted">{s.hint}</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {cols[s.key].map((p) => (s.key === 'active'
                      ? <ActiveCard key={p.id} o={p} roleName={roleName} />
                      : <Card key={p.id} p={p} roleName={roleName} onMove={move} onReview={review} />))}
                    {!cols[s.key].length && <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-footnote text-faint">Nobody here</p>}
                  </div>
                </section>
              ))}
            </div>
          </>
        )}
      </Load>
      <ApplicationSheet key={applicant || 'none'} id={applicant} onClose={closeReview} onDone={reload} />
      <HireSheet p={hiring} onClose={() => setHiring(null)} onHire={(invite) => setStatus(hiring, 'active', { invite })} />
      <AddOfficerSheet open={adding} onClose={() => setAdding(false)} roles={roles} onDone={reload} status="applicant" title="Add applicant" statusOptions={['applicant', 'onboarding']} />
    </Page>
  );
}

function Card({ p, roleName, onMove, onReview }) {
  // Online applicants are reviewed (invite or reject) in the application sheet
  const reviewing = p.online && p.status === 'applicant';
  const next = NEXT[p.status];
  const prev = PREV[p.status];
  const complete = p.total && Number(p.done) === Number(p.total);
  return (
    <div className="rounded-2xl bg-surface p-3 shadow-tile">
      <Pressable press to={reviewing ? undefined : `/company/staff/${p.id}`} onClick={reviewing ? () => onReview(p) : undefined} className="flex w-full items-center gap-3 text-left">
        <Avatar name={p.name} size={38} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-body font-semibold">{p.name}</div>
          <div className="truncate text-caption text-muted">{(p.roles || []).map(roleName).join(', ') || p.email || p.phone || 'No details'}</div>
        </div>
        <span className="text-caption2 text-faint">{relative(p.created_at)}</span>
      </Pressable>
      {!reviewing && <Progress className="mt-3" done={Number(p.done)} total={Number(p.total)} />}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {reviewing && !p.seen && <Pill tone="blue">New</Pill>}
          {p.online && <Pill tone="grey">Applied online</Pill>}
          {reviewing && p.ai_status === 'pending' && <Pill tone="grey">Reading documents…</Pill>}
          {reviewing && Number(p.flag_count) > 0 && <Pill tone="amber">{p.flag_count} to check</Pill>}
          {p.login_status === 'invited' && <Pill tone="amber">Invite pending</Pill>}
          {p.login_status === 'active' && <Pill tone="blue">In the app</Pill>}
          {!p.login_status && !reviewing && <Pill tone="grey">No login</Pill>}
          {complete && <Pill tone="green">Ready</Pill>}
        </div>
        <div className="flex items-center">
          {prev && <IconButton icon={ChevronLeft} label={`Move back to ${prev}`} onClick={() => onMove(p, prev)} />}
          {reviewing ? (
            <Pressable press onClick={() => onReview(p)}
              className="inline-flex h-8 items-center gap-0.5 rounded-xl bg-blue px-2.5 text-footnote font-semibold text-white transition active:scale-95">
              Review<ChevronRight size={16} />
            </Pressable>
          ) : next && (
            <Pressable press onClick={() => onMove(p, next)}
              className={cx('inline-flex h-8 items-center gap-0.5 rounded-xl px-2.5 text-footnote font-semibold transition active:scale-95', complete || next === 'onboarding' ? 'bg-blue text-white' : 'bg-blue-soft text-blue')}>
              {next === 'active' ? 'Activate' : 'Start onboarding'}<ChevronRight size={16} />
            </Pressable>
          )}
        </div>
      </div>
    </div>
  );
}

function ActiveCard({ o, roleName }) {
  return (
    <Link to={`/company/staff/${o.id}`} className="flex items-center gap-3 rounded-2xl bg-surface p-3 shadow-tile transition hover:-translate-y-0.5">
      <Avatar name={o.name} src={o.photo_url} size={38} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-body font-semibold">{o.name}</div>
        <div className="truncate text-caption text-muted">{(o.roles || []).map(roleName).join(', ') || 'No roles'}{o.start_date ? ` · since ${date(o.start_date)}` : ''}</div>
      </div>
      <ComplianceBadge c={o.compliance} />
    </Link>
  );
}


function HireSheet({ p, onClose, onHire }) {
  const [invite, setInvite] = useState(true);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState(null);
  const last = p || {};
  const close = () => { onClose(); setTimeout(() => { setLink(null); setInvite(true); }, 300); };
  const hire = async () => {
    setBusy(true);
    const r = await onHire(invite).finally(() => setBusy(false));
    if (r?.invite_link) setLink(r.invite_link);
    else if (r) close();
  };
  return (
    <Sheet open={!!p} onClose={close} title={link ? `${last.name} is active` : `Make ${last.name} active`} size="sm"
      footer={link
        ? <Button onClick={close}>Done</Button>
        : <><Button variant="secondary" onClick={close}>Cancel</Button><Button busy={busy} onClick={hire}>Make active</Button></>}>
      {link ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-2xl bg-green-soft p-4 text-green"><ShieldCheck size={20} /><span className="text-body font-semibold">Login created and invite emailed to {last.email}.</span></div>
          <CopyLink link={link} />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-body text-muted">They can be offered shifts once active.</p>
          <div className="rounded-2xl bg-bg px-4 py-2">
            <Toggle checked={invite} onChange={setInvite} label="Email them an app login" hint={`Sends an invite to ${last.email} so they can see shifts, clock in and get paid`} />
          </div>
        </div>
      )}
    </Sheet>
  );
}
