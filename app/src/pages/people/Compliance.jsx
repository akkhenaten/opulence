// Every compliance issue across the workforce in one place: what is wrong, how urgent, and what Orb advises
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Ban, CalendarClock, Hourglass, Info, Layers, ListTodo, Mail, RefreshCw, ShieldAlert, ShieldCheck, Sparkles, Users } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import GraceSheet, { GRACE_LABEL, GraceButton } from './_graceSheet.jsx';
import Queue from './_complianceQueue.jsx';
import {
  Avatar, Button, Chip, date, Empty, Load, MoreMenu, Page, Pill, Segmented, Select, Sheet, Spinner, Tile, time, ToolField, ToolMenu, useAction, useApi, useConfirm, useMedia, useUrlState,
} from '../../ui/index.jsx';

const SEV = {
  urgent: { label: 'Urgent', tone: 'red', icon: ShieldAlert },
  soon: { label: 'Soon', tone: 'amber', icon: CalendarClock },
  advisory: { label: 'Advisory', tone: 'blue', icon: Info },
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
  // by: one row per document (the queue, default) or today's card per person
  const [url, setUrl] = useUrlState({ severity: '', area: '', view: '', by: '' });
  const person = url.by === 'person';
  const view = ['cantwork', 'grace'].includes(url.view) ? url.view : '';
  const sev = SEV[url.severity] ? url.severity : '';
  const area = AREAS.some((a) => a.value === url.area) ? url.area : '';
  const [preview, setPreview] = useState(false);
  const [run, busy] = useAction();
  const company = user.role === 'company';
  const wide = useMedia('(min-width: 640px)');

  // Who and area sit on the tab line (area under Filters on phones); the severities are chips above the cards
  const blocked = gq.data?.blocked.length || 0;
  const onGrace = gq.data?.onGrace.length || 0;
  const areaPick = <Select aria-label="Area" value={area} onChange={(e) => setUrl({ area: e.target.value })} options={AREAS} />;
  const tools = <>
    <Segmented value={person ? 'person' : ''} onChange={(v) => setUrl({ by: v, doc: '' })} options={[{ value: '', label: 'Queue', icon: ListTodo }, { value: 'person', label: 'By person', icon: Users }]} />
    {(blocked > 0 || onGrace > 0 || view) && (
      <Segmented value={view} onChange={(v) => setUrl({ view: v })} options={[{ value: '', label: 'Everyone', icon: Layers }, { value: 'cantwork', label: `Can't work (${blocked})`, icon: Ban }, { value: 'grace', label: `On grace (${onGrace})`, icon: Hourglass }]} />
    )}
    <div className="hidden w-44 sm:block">{areaPick}</div>
    {!wide && <ToolMenu count={area ? 1 : 0} onClear={() => setUrl({ area: '' })}><ToolField label="Area">{areaPick}</ToolField></ToolMenu>}
  </>;

  const check = () => run(() => api('ops.complianceRun', {}), (r) => `Checked ${r.checked} people · ${r.attention} need attention`).then(q.reload).catch(() => {});
  const dismiss = (r) => run(() => api('ops.dismissIssue', { id: r.card_id, key: r.key }), 'Dismissed').then(q.reload).catch(() => {});

  return (
    <Page title="Compliance" subtitle="Licences, right to work, documents and training, checked against the rota" tools={tools}
      actions={company && (
        <>
          <MoreMenu items={[{ label: 'Weekly email preview', icon: Mail, onClick: () => setPreview(true) }]} />
          <Button icon={RefreshCw} busy={busy} onClick={check}>Run check now</Button>
        </>
      )}>
      <Load q={q} skeleton="rows">
        {(d) => <Body d={d} gd={gq.data} person={person} company={company} reloadGrace={() => { gq.reload(); q.reload(); }} view={view} sev={sev} setSev={(v) => setUrl({ severity: v })} area={area} dismiss={dismiss} busy={busy}
          openCard={(id) => nav(id ? `/${user.role}?card=${id}` : `/${user.role}`)} openStaff={(id) => nav(`/${user.role}/staff/${id}?tab=documents`)}
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
          <div className="min-w-0 flex-1 text-subhead font-semibold">On grace until {date(g.ends_on)}: can work while they send {g.covers.map((k) => GRACE_LABEL[k] || k).join(', ').toLowerCase()}</div>
          <Pill tone={g.days_left <= 3 ? 'red' : 'amber'}>{g.days_left <= 0 ? 'Last day' : `${g.days_left} day${g.days_left === 1 ? '' : 's'} left`}</Pill>
          {company && (
            <MoreMenu size="sm" items={[
              { label: g.renewals >= d.max_renewals ? `Extended ${d.max_renewals} times already` : 'Extend', disabled: g.renewals >= d.max_renewals, onClick: () => setSheet(true) },
              { label: 'End now', danger: true, disabled: busy, onClick: end },
            ]} />
          )}
        </div>
        <p className="mt-1 text-footnote text-muted">
          {g.renewals ? `Extended ${g.renewals} of ${d.max_renewals} · ` : ''}"{g.reason}"{g.granted_by ? `, ${g.granted_by}` : ''}{next}
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

// A person's findings, one block per document (worst first, as the rows come); person-level items stay on their own
function byDoc(rows) {
  const m = new Map();
  for (const r of rows) {
    const k = r.doc || `item:${r.key}`;
    if (!m.has(k)) m.set(k, { doc: k, label: r.doc_label ? r.doc_label[0].toUpperCase() + r.doc_label.slice(1) : '', rows: [] });
    m.get(k).rows.push(r);
  }
  return [...m.values()];
}

function Body({ d, gd, person, company, reloadGrace, view, sev, setSev, area, dismiss, busy, openCard, openStaff, openRtw }) {
  const counts = useMemo(() => d.rows.reduce((m, r) => ({ ...m, [r.severity]: (m[r.severity] || 0) + 1 }), {}), [d.rows]);
  // officer id → their can't work / on grace row
  const work = useMemo(() => new Map([...(gd?.blocked || []), ...(gd?.onGrace || [])].map((r) => [r.officer.id, r])), [gd]);
  const inView = (id) => !view || (view === 'grace' ? !!work.get(id)?.grace : work.has(id) && !work.get(id).grace);
  const shown = d.rows.filter((r) => !(sev && r.severity !== sev) && !(area && r.area !== area) && inView(r.officer.id));
  const groups = useMemo(() => {
    const m = new Map();
    for (const r of shown) {
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
  }, [d.rows, sev, area, view, work]); // eslint-disable-line react-hooks/exhaustive-deps
  const tiles = person ? groups : groups.filter((g) => !g.rows.length);
  const workLine = (id, listed) => work.get(id) && <WorkLine r={work.get(id)} d={gd} company={company} reload={reloadGrace} listed={listed} />;
  return (
    <>
      {/* One slim line: the severities with something in them (tap to filter) and when the last check ran */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {Object.entries(SEV).filter(([k]) => counts[k] || sev === k).map(([k, s]) => (
          <Chip key={k} label={s.label} value={counts[k] || 0} tone={s.tone} icon={s.icon} compact="phone" active={sev === k} onClick={() => setSev(sev === k ? '' : k)} />
        ))}
        <span className="text-footnote text-muted">
          {d.checked} people checked{d.last_run ? ` · last full check ${date(d.last_run)} ${time(d.last_run)}` : ''}
        </span>
      </div>
      {!person && shown.length > 0 && <Queue rows={shown} work={work} company={company} reload={reloadGrace} workLine={workLine} openRtw={openRtw} />}
      {/* In the queue, people who can't work or are on grace with nothing listed still get their card, below it */}
      {!person && shown.length > 0 && !tiles.length ? null : !tiles.length ? (
        <Empty icon={ShieldCheck} title={d.rows.length || view ? 'Nothing matches these filters' : 'Everyone is compliant'}
          body={d.rows.length || view ? undefined : 'No expired, missing or unverified documents and no overdue training.'} />
      ) : (
        <div className={`grid grid-cols-1 gap-3 lg:grid-cols-2${person ? '' : ' mt-4'}`}>
          {tiles.map((g) => {
            const name = `${g.officer.first_name} ${g.officer.last_name}`;
            const w = work.get(g.officer.id);
            // In a document block, the right to work check button shows once, on its first finding
            const finding = (r, n) => (
              <div key={r.key} className="rounded-2xl bg-bg p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 text-subhead font-semibold">{r.title}</div>
                  <Pill tone={SEV[r.severity]?.tone || 'grey'}>{SEV[r.severity]?.label || r.severity}</Pill>
                </div>
                {r.detail && <p className="mt-0.5 text-footnote text-muted">{r.detail}</p>}
                {r.shift && <p className="num mt-0.5 text-footnote text-muted">Next shift: {r.shift.venue_name} · {date(r.shift.starts_at)} {time(r.shift.starts_at)}</p>}
                {(r.card_id || (openRtw && r.area === 'rtw' && !n)) && (
                  <div className="mt-1.5 flex justify-end gap-2">
                    {openRtw && r.area === 'rtw' && !n && <Button size="sm" variant="soft" onClick={() => openRtw(g.officer.id)}>Check right to work</Button>}
                    {r.card_id && <Button size="sm" variant="ghost" disabled={busy} onClick={() => dismiss(r)}>Dismiss</Button>}
                  </div>
                )}
              </div>
            );
            return (
              <Tile key={g.officer.id}>
                <div className="mb-3 flex items-center gap-3">
                  <Avatar name={name} src={[g.officer.photo_thumb_url, g.officer.photo_url]} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-headline font-bold">{name}</div>
                    <div className="text-footnote text-muted">{g.rows.length ? `${g.rows.length} finding${g.rows.length === 1 ? '' : 's'}` : 'Not on the issues list'}{g.officer.status === 'onboarding' ? ' · onboarding' : ''}</div>
                  </div>
                  <Button size="sm" variant="link" onClick={() => openStaff(g.officer.id)}>Profile</Button>
                </div>
                {w && <WorkLine r={w} d={gd} company={company} reload={reloadGrace} listed={g.rows.length > 0} />}
                <div className="space-y-2">
                  {byDoc(g.rows).map((b) => (b.rows.length > 1 ? (
                    <section key={b.doc} aria-label={`${b.label}: ${b.rows.length} findings`} className="rounded-2xl border border-line p-2">
                      <h3 className="px-1 pb-1.5 pt-0.5 text-footnote font-bold">{b.label}: {b.rows.length} findings</h3>
                      <div className="space-y-1.5">{b.rows.map(finding)}</div>
                    </section>
                  ) : finding(b.rows[0])))}
                </div>
                {g.advice && (
                  <div className="mt-3 flex gap-2 rounded-2xl bg-blue-soft p-3 text-footnote text-blue">
                    <Sparkles size={16} className="mt-0.5 shrink-0" />
                    <span>{g.advice}</span>
                  </div>
                )}
                {g.card_id && (
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" variant="soft" onClick={() => openCard(g.card_id)}>Open in Today</Button>
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
          <p className="mb-2 text-footnote text-muted">Subject: {q.data.subject}. Sent to company managers after the weekly check (turn it off in Settings → Orb).</p>
          <iframe title="Email preview" srcDoc={q.data.html} className="h-[560px] max-h-full w-full rounded-2xl border border-sep bg-paper" />
        </>
      )}
    </Sheet>
  );
}
