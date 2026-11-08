// Every compliance issue across the workforce in one place: what is wrong, how urgent, and what Orb advises
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, CalendarClock, Mail, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import GraceSheet, { GRACE_LABEL, GraceButton } from './_graceSheet.jsx';
import {
  Avatar, Button, date, Empty, Load, MoreMenu, Page, Pill, Segmented, Select, Sheet, Spinner, Tile, time, useAction, useApi, useConfirm, useUrlState,
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
  // Who can't work right now and who is on a grace period: one line on each officer's card, and the Who filter
  const gq = useApi('compliance.blocked');
  // Severity, area and who stay in the address so Back returns to the same view (?view=cantwork from Today and Orb's reminders)
  const [url, setUrl] = useUrlState({ severity: '', area: '', view: '' });
  const view = ['cantwork', 'grace'].includes(url.view) ? url.view : '';
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
      <Load q={q} skeleton="rows">
        {(d) => <Body d={d} gd={gq.data} company={company} reloadGrace={() => { gq.reload(); q.reload(); }} view={view} setView={(v) => setUrl({ view: v })} sev={sev} setSev={(v) => setUrl({ severity: v })} area={area} setArea={(v) => setUrl({ area: v })} dismiss={dismiss} busy={busy}
          openCard={() => nav(`/${user.role}`)} openStaff={(id) => nav(`/${user.role}/staff/${id}?tab=documents`)}
          openRtw={company ? (id) => nav(`/${user.role}/staff/${id}?tab=compliance&rtw=check`) : null} />}
      </Load>
      {preview && <DigestPreview onClose={() => setPreview(false)} />}
    </Page>
  );
}

// Can't work / on grace, at the top of the officer's card, with the grace period button where the licence and right to work issues are
function WorkLine({ r, d, company, reload, listed }) {
  const [sheet, setSheet] = useState(false);
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const state = { keys: r.keys, grace: r.grace, lapsed: r.lapsed, maxDays: d.max_days, maxRenewals: d.max_renewals };
  const end = async () => {
    const ok = await confirm({ title: `End ${r.officer.name}'s grace period now?`, body: "They can't clock in or be rostered again until their documents are in. They are told.", confirm: 'End now', danger: true });
    if (ok) run(() => api('compliance.grace.end', { officer_id: r.officer.id, reason: 'Ended early from Compliance' }), 'Grace period ended').then(reload).catch(() => {});
  };
  const next = r.next && <span className="num"> · next shift {r.next.venue_name}, {date(r.next.starts_at)} {time(r.next.starts_at)}</span>;
  const g = r.grace;
  if (g) {
    return (
      <div className="mb-3 rounded-2xl bg-amber-soft p-3">
        <div className="flex items-center gap-2">
          <CalendarClock size={16} className="shrink-0 text-amber" aria-hidden />
          <div className="min-w-0 flex-1 text-subhead font-semibold">On grace until {date(g.ends_on)}</div>
          <Pill tone={g.days_left <= 3 ? 'red' : 'amber'}>{g.days_left <= 0 ? 'Last day' : `${g.days_left} day${g.days_left === 1 ? '' : 's'} left`}</Pill>
          {company && (
            <MoreMenu size="sm" items={[
              { label: g.renewals >= d.max_renewals ? `Extended ${d.max_renewals} times already` : 'Extend', disabled: g.renewals >= d.max_renewals, onClick: () => setSheet(true) },
              { label: 'End now', danger: true, disabled: busy, onClick: end },
            ]} />
          )}
        </div>
        <p className="mt-1 text-footnote text-muted">
          Covers {g.covers.map((k) => GRACE_LABEL[k] || k).join(', ').toLowerCase()}{g.renewals ? ` · extended ${g.renewals} of ${d.max_renewals}` : ''} · "{g.reason}"{g.granted_by ? `, ${g.granted_by}` : ''}{next}
        </p>
        {r.issues.length > 0 && <p className="mt-1 text-footnote font-semibold text-red">Still can't work: {r.issues.join(', ')}</p>}
        {sheet && <GraceSheet officer={r.officer} mode="renew" keys={r.keys} grace={g} maxDays={d.max_days} maxRenewals={d.max_renewals} onClose={() => setSheet(false)} onDone={reload} />}
      </div>
    );
  }
  return (
    <div className="mb-3 rounded-2xl bg-red-soft p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Ban size={16} className="shrink-0 text-red" aria-hidden />
        <div className="min-w-0 flex-1 text-subhead font-semibold text-red">Can't work: can't clock in or be rostered</div>
        {company && <GraceButton officer={r.officer} state={state} onDone={reload} />}
      </div>
      <p className="mt-1 text-footnote text-muted">
        {listed ? 'They need to send what is listed below' : r.issues.join(', ')}{r.lapsed ? ` · grace period ended ${date(r.lapsed.ends_on)}, extended ${r.lapsed.renewals} of ${d.max_renewals}` : ''}{next}
        {!company && ' · a company manager can give them a grace period'}
      </p>
    </div>
  );
}

function Body({ d, gd, company, reloadGrace, view, setView, sev, setSev, area, setArea, dismiss, busy, openCard, openStaff, openRtw }) {
  const counts = useMemo(() => d.rows.reduce((m, r) => ({ ...m, [r.severity]: (m[r.severity] || 0) + 1 }), {}), [d.rows]);
  // officer id → their can't work / on grace row
  const work = useMemo(() => new Map([...(gd?.blocked || []), ...(gd?.onGrace || [])].map((r) => [r.officer.id, r])), [gd]);
  const groups = useMemo(() => {
    const m = new Map();
    const inView = (id) => !view || (view === 'grace' ? !!work.get(id)?.grace : work.has(id) && !work.get(id).grace);
    for (const r of d.rows) {
      if ((sev && r.severity !== sev) || (area && r.area !== area) || !inView(r.officer.id)) continue;
      if (!m.has(r.officer.id)) m.set(r.officer.id, { officer: r.officer, advice: r.advice, card_id: r.card_id, rows: [] });
      m.get(r.officer.id).rows.push(r);
    }
    // Can't work or on grace without an issue on the list (say, dismissed): they still get a card
    if (!sev && !area) {
      for (const [id, r] of work) {
        if (!m.has(id) && inView(id)) m.set(id, { officer: { ...r.officer, status: 'active' }, rows: [] });
      }
    }
    // Can't work first, then on grace, then everyone else
    const rank = (id) => (work.has(id) ? (work.get(id).grace ? 1 : 0) : 2);
    return [...m.values()].sort((a, b) => rank(a.officer.id) - rank(b.officer.id));
  }, [d.rows, sev, area, view, work]);
  const blocked = gd?.blocked.length || 0;
  const onGrace = gd?.onGrace.length || 0;

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
        {(blocked > 0 || onGrace > 0 || view) && (
          <Segmented value={view} onChange={setView} options={[{ value: '', label: 'Everyone' }, { value: 'cantwork', label: `Can't work (${blocked})` }, { value: 'grace', label: `On grace (${onGrace})` }]} />
        )}
        <Segmented value={sev} onChange={setSev} options={[{ value: '', label: 'Any' }, ...Object.entries(SEV).map(([value, s]) => ({ value, label: s.label }))]} />
        <Select aria-label="Area" className="w-48" value={area} onChange={(e) => setArea(e.target.value)} options={AREAS} />
      </div>
      {!groups.length ? (
        <Empty icon={ShieldCheck} title={d.rows.length || view ? 'Nothing matches these filters' : 'Everyone is compliant'}
          body={d.rows.length || view ? undefined : 'No expired, missing or unverified documents and no overdue training.'} />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {groups.map((g) => {
            const name = `${g.officer.first_name} ${g.officer.last_name}`;
            const w = work.get(g.officer.id);
            return (
              <Tile key={g.officer.id}>
                <div className="mb-3 flex items-center gap-3">
                  <Avatar name={name} src={[g.officer.photo_thumb_url, g.officer.photo_url]} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-headline font-bold">{name}</div>
                    <div className="text-footnote text-muted">{g.rows.length ? `${g.rows.length} issue${g.rows.length === 1 ? '' : 's'}` : 'Not on the issues list'}{g.officer.status === 'onboarding' ? ' · onboarding' : ''}</div>
                  </div>
                  <Button size="sm" variant="link" onClick={() => openStaff(g.officer.id)}>Profile</Button>
                </div>
                {w && <WorkLine r={w} d={gd} company={company} reload={reloadGrace} listed={g.rows.length > 0} />}
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
