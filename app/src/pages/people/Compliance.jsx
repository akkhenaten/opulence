// Every compliance issue across the workforce in one place: what is wrong, how urgent, and what Orb advises
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Ban, CalendarClock, Mail, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import GraceSheet, { GRACE_LABEL } from './_graceSheet.jsx';
import {
  Avatar, Button, Callout, date, Empty, Load, MoreMenu, Page, Pill, Segmented, Select, Sheet, Spinner, Tile, time, useAction, useApi, useConfirm, useUrlState,
} from '../../ui/index.jsx';

const SEV = {
  urgent: { label: 'Urgent', tone: 'red', text: 'text-red' },
  soon: { label: 'Soon', tone: 'amber', text: 'text-amber' },
  advisory: { label: 'Advisory', tone: 'blue', text: 'text-blue' },
};
const AREAS = [
  { value: '', label: 'All areas' }, { value: 'licence', label: 'Licences' }, { value: 'rtw', label: 'Right to work' },
  { value: 'training', label: 'Training' }, { value: 'documents', label: 'Documents' }, { value: 'venue_pack', label: 'Site packs' },
];

export default function Compliance() {
  const { user } = useAuth();
  const nav = useNavigate();
  const q = useApi('compliance.overview');
  // Severity and area stay in the address so Back returns to the same view
  const [url, setUrl] = useUrlState({ severity: '', area: '' });
  const sev = SEV[url.severity] ? url.severity : '';
  const area = AREAS.some((a) => a.value === url.area) ? url.area : '';
  const [preview, setPreview] = useState(false);
  const [run, busy] = useAction();
  const company = user.role === 'company';

  const check = () => run(() => api('ops.complianceRun', {}), (r) => `Checked ${r.checked} people · ${r.attention} need attention`).then(q.reload).catch(() => {});
  const dismiss = (r) => run(() => api('ops.dismissIssue', { id: r.card_id, key: r.key }), 'Dismissed').then(q.reload).catch(() => {});

  return (
    <Page title="Compliance" subtitle="Licences, right to work, documents and training, checked against the rota"
      actions={company && (
        <>
          <MoreMenu items={[{ label: 'Weekly email preview', icon: Mail, onClick: () => setPreview(true) }]} />
          <Button icon={RefreshCw} busy={busy} onClick={check}>Run check now</Button>
        </>
      )}>
      <CantWork company={company} openStaff={(id) => nav(`/${user.role}/staff/${id}?tab=compliance`)} />
      <Load q={q} skeleton="rows">
        {(d) => <Body d={d} sev={sev} setSev={(v) => setUrl({ severity: v })} area={area} setArea={(v) => setUrl({ area: v })} dismiss={dismiss} busy={busy}
          openCard={() => nav(`/${user.role}`)} openStaff={(id) => nav(`/${user.role}/staff/${id}?tab=documents`)}
          openRtw={company ? (id) => nav(`/${user.role}/staff/${id}?tab=compliance&rtw=check`) : null} />}
      </Load>
      {preview && <DigestPreview onClose={() => setPreview(false)} />}
    </Page>
  );
}

// Who can't work right now and who is working on a grace period while they send their documents
function CantWork({ company, openStaff }) {
  const q = useApi('compliance.blocked');
  const [params] = useSearchParams();
  const ref = useRef(null);
  const [sheet, setSheet] = useState(null);
  const [run, busy] = useAction();
  const confirm = useConfirm();
  useEffect(() => {
    if (params.get('view') === 'cantwork' && q.data) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [params, q.data]);
  const d = q.data;
  if (!d || (!d.blocked.length && !d.onGrace.length)) return null;
  const end = async (r) => {
    const ok = await confirm({ title: `End ${r.officer.name}'s grace period now?`, body: "They can't clock in or be rostered again until their documents are in. They are told.", confirm: 'End now', danger: true });
    if (ok) run(() => api('compliance.grace.end', { officer_id: r.officer.id, reason: 'Ended early from Compliance' }), 'Grace period ended').then(q.reload).catch(() => {});
  };
  const limits = { maxDays: d.max_days, maxRenewals: d.max_renewals };

  return (
    <div ref={ref} className="mb-6 scroll-mt-20 space-y-5">
      {d.blocked.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-headline font-bold"><Ban size={18} className="text-red" aria-hidden />Can't work ({d.blocked.length})</h2>
          <p className="mb-3 text-footnote text-muted">They can't clock in or be rostered.{company ? ' Give a grace period to let them work while they send their documents.' : ' A company manager can give them a grace period.'}</p>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {d.blocked.map((r) => (
              <Tile key={r.officer.id}>
                <Who r={r} openStaff={openStaff} />
                <ul className="mt-2 space-y-1 text-subhead">{r.issues.map((i) => <li key={i} className="text-red">{i}</li>)}</ul>
                {r.lapsed && <p className="mt-1 text-footnote text-muted">Grace period ended {date(r.lapsed.ends_on)} · extended {r.lapsed.renewals} of {d.max_renewals} times</p>}
                {company && (
                  <div className="mt-3 flex justify-end gap-2">
                    {r.lapsed && r.lapsed.renewals < d.max_renewals
                      ? <Button size="sm" variant="soft" icon={CalendarClock} onClick={() => setSheet({ r, mode: 'renew', grace: r.lapsed })}>Extend grace period</Button>
                      : r.keys.length > 0
                        ? <Button size="sm" variant="soft" icon={CalendarClock} onClick={() => setSheet({ r, mode: 'grant' })}>Give grace period</Button>
                        : <span className="text-footnote text-muted">{r.issues.some((i) => i.startsWith('Status')) ? 'Not active: no grace period' : 'Fix on their profile'}</span>}
                  </div>
                )}
              </Tile>
            ))}
          </div>
        </section>
      )}
      {d.onGrace.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 text-headline font-bold"><CalendarClock size={18} className="text-amber" aria-hidden />On grace ({d.onGrace.length})</h2>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {d.onGrace.map((r) => {
              const g = r.grace;
              return (
                <Tile key={r.officer.id}>
                  <Who r={r} openStaff={openStaff} right={(
                    <>
                      <Pill tone={g.days_left <= 3 ? 'red' : 'amber'}>{g.days_left <= 0 ? 'Last day' : `${g.days_left} day${g.days_left === 1 ? '' : 's'} left`}</Pill>
                      {company && (
                        <MoreMenu size="sm" items={[
                          { label: g.renewals >= d.max_renewals ? `Extended ${d.max_renewals} times already` : 'Extend', disabled: g.renewals >= d.max_renewals, onClick: () => setSheet({ r, mode: 'renew', grace: g }) },
                          { label: 'End now', danger: true, disabled: busy, onClick: () => end(r) },
                          { label: 'Profile', onClick: () => openStaff(r.officer.id) },
                        ]} />
                      )}
                    </>
                  )} />
                  <p className="num mt-2 text-subhead">Can work until <b>{date(g.ends_on)}</b>{g.renewals ? ` · extended ${g.renewals} of ${d.max_renewals}` : ''}</p>
                  <p className="mt-0.5 text-footnote text-muted">Covers: {g.covers.map((k) => GRACE_LABEL[k] || k).join(', ')}</p>
                  <p className="mt-0.5 text-footnote text-muted">"{g.reason}"{g.granted_by ? ` · ${g.granted_by}` : ''}</p>
                  {r.issues.length > 0 && <Callout tone="danger" className="mt-2">Still blocked: {r.issues.join(', ')}</Callout>}
                </Tile>
              );
            })}
          </div>
        </section>
      )}
      {sheet && <GraceSheet officer={sheet.r.officer} mode={sheet.mode} keys={sheet.r.keys} grace={sheet.grace} {...limits} onClose={() => setSheet(null)} onDone={q.reload} />}
    </div>
  );
}

function Who({ r, openStaff, right }) {
  return (
    <div className="flex items-center gap-3">
      <Avatar name={r.officer.name} src={r.officer.photo_url} size={40} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-headline font-bold">{r.officer.name}</div>
        <div className="num text-footnote text-muted">{r.next ? `Next shift: ${r.next.venue_name} · ${date(r.next.starts_at)} ${time(r.next.starts_at)}` : 'No shifts coming up'}</div>
      </div>
      {right || <Button size="sm" variant="link" onClick={() => openStaff(r.officer.id)}>Profile</Button>}
    </div>
  );
}

function Body({ d, sev, setSev, area, setArea, dismiss, busy, openCard, openStaff, openRtw }) {
  const counts = useMemo(() => d.rows.reduce((m, r) => ({ ...m, [r.severity]: (m[r.severity] || 0) + 1 }), {}), [d.rows]);
  const groups = useMemo(() => {
    const m = new Map();
    for (const r of d.rows) {
      if ((sev && r.severity !== sev) || (area && r.area !== area)) continue;
      if (!m.has(r.officer.id)) m.set(r.officer.id, { officer: r.officer, advice: r.advice, card_id: r.card_id, rows: [] });
      m.get(r.officer.id).rows.push(r);
    }
    return [...m.values()];
  }, [d.rows, sev, area]);

  return (
    <>
      <div className="mb-4 grid grid-cols-3 gap-2 sm:gap-3">
        {Object.entries(SEV).map(([k, s]) => (
          <Tile key={k} pad>
            <div className="text-caption font-semibold uppercase text-muted">{s.label}</div>
            <div className={`num text-title1 font-bold ${s.text}`}>{counts[k] || 0}</div>
          </Tile>
        ))}
      </div>
      <p className="mb-3 text-footnote text-muted">
        {d.checked} people checked{d.last_run ? ` · last full check ${date(d.last_run)} ${time(d.last_run)}` : ''}
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Segmented value={sev} onChange={setSev} options={[{ value: '', label: 'Any' }, ...Object.entries(SEV).map(([value, s]) => ({ value, label: s.label }))]} />
        <Select aria-label="Area" className="w-48" value={area} onChange={(e) => setArea(e.target.value)} options={AREAS} />
      </div>
      {!groups.length ? (
        <Empty icon={ShieldCheck} title={d.rows.length ? 'Nothing matches these filters' : 'Everyone is compliant'}
          body={d.rows.length ? undefined : 'No expired, missing or unverified documents and no overdue training.'} />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {groups.map((g) => {
            const name = `${g.officer.first_name} ${g.officer.last_name}`;
            return (
              <Tile key={g.officer.id}>
                <div className="mb-3 flex items-center gap-3">
                  <Avatar name={name} src={[g.officer.photo_thumb_url, g.officer.photo_url]} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-headline font-bold">{name}</div>
                    <div className="text-footnote text-muted">{g.rows.length} issue{g.rows.length === 1 ? '' : 's'}{g.officer.status === 'onboarding' ? ' · onboarding' : ''}</div>
                  </div>
                  <Button size="sm" variant="link" onClick={() => openStaff(g.officer.id)}>Profile</Button>
                </div>
                <div className="space-y-2">
                  {g.rows.map((r) => (
                    <div key={r.key} className="rounded-2xl bg-bg p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 text-subhead font-semibold">{r.title}</div>
                        <Pill tone={SEV[r.severity]?.tone || 'grey'}>{SEV[r.severity]?.label || r.severity}</Pill>
                      </div>
                      {r.detail && <p className="mt-0.5 text-footnote text-muted">{r.detail}</p>}
                      {r.shift && <p className="num mt-0.5 text-footnote text-muted">Next shift: {r.shift.venue_name} · {date(r.shift.starts_at)} {time(r.shift.starts_at)}</p>}
                      {(r.card_id || (openRtw && r.area === 'rtw')) && (
                        <div className="mt-1.5 flex justify-end gap-2">
                          {openRtw && r.area === 'rtw' && <Button size="sm" variant="soft" onClick={() => openRtw(g.officer.id)}>Check right to work</Button>}
                          {r.card_id && <Button size="sm" variant="ghost" disabled={busy} onClick={() => dismiss(r)}>Dismiss</Button>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                {g.advice && (
                  <div className="mt-3 flex gap-2 rounded-2xl bg-blue-soft p-3 text-footnote text-blue">
                    <Sparkles size={16} className="mt-0.5 shrink-0" />
                    <span>{g.advice}</span>
                  </div>
                )}
                {g.card_id && (
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" variant="soft" onClick={openCard}>Open in Today</Button>
                  </div>
                )}
              </Tile>
            );
          })}
        </div>
      )}
    </>
  );
}

function DigestPreview({ onClose }) {
  const q = useApi('compliance.digestPreview');
  return (
    <Sheet open onClose={onClose} title="Weekly compliance email" size="lg"
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      {!q.data ? <Spinner /> : (
        <>
          <p className="mb-2 text-footnote text-muted">Subject: {q.data.subject}. Sent to company managers after the weekly check (turn it off in Orb settings, under … on Today).</p>
          <iframe title="Email preview" srcDoc={q.data.html} className="h-[560px] max-h-full w-full rounded-2xl border border-sep bg-paper" />
        </>
      )}
    </Sheet>
  );
}
