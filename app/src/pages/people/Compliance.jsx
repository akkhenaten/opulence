// Every compliance issue across the workforce in one place: what is wrong, how urgent, and what Ops AI advises
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, RefreshCw, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import {
  Avatar, Button, date, Empty, Load, Page, Pill, Segmented, Sheet, Spinner, Tile, time, useAction, useApi,
} from '../../ui/index.jsx';

const SEV = {
  urgent: { label: 'Urgent', tone: 'red', text: 'text-red' },
  soon: { label: 'Soon', tone: 'amber', text: 'text-amber' },
  advisory: { label: 'Advisory', tone: 'blue', text: 'text-blue' },
};
const AREAS = [
  { value: '', label: 'All' }, { value: 'licence', label: 'Licences' }, { value: 'rtw', label: 'Right to work' },
  { value: 'training', label: 'Training' }, { value: 'documents', label: 'Documents' },
];

export default function Compliance() {
  const { user } = useAuth();
  const nav = useNavigate();
  const q = useApi('compliance.overview');
  const [sev, setSev] = useState('');
  const [area, setArea] = useState('');
  const [preview, setPreview] = useState(false);
  const [run, busy] = useAction();
  const company = user.role === 'company';

  const check = () => run(() => api('ops.complianceRun', {}), (r) => `Checked ${r.checked} people · ${r.attention} need attention`).then(q.reload).catch(() => {});
  const dismiss = (r) => run(() => api('ops.dismissIssue', { id: r.card_id, key: r.key }), 'Dismissed').then(q.reload).catch(() => {});

  return (
    <Page title="Compliance" subtitle="Licences, right to work, documents and training, checked against the rota"
      actions={company && (
        <>
          <Button variant="secondary" icon={Mail} onClick={() => setPreview(true)}>Weekly email</Button>
          <Button icon={RefreshCw} busy={busy} onClick={check}>Run check now</Button>
        </>
      )}>
      <Load q={q} skeleton="rows">
        {(d) => <Body d={d} sev={sev} setSev={setSev} area={area} setArea={setArea} dismiss={dismiss} busy={busy}
          openCard={() => nav(`/${user.role}/ops`)} openStaff={(id) => nav(`/${user.role}/staff/${id}?tab=documents`)} />}
      </Load>
      {preview && <DigestPreview onClose={() => setPreview(false)} />}
    </Page>
  );
}

function Body({ d, sev, setSev, area, setArea, dismiss, busy, openCard, openStaff }) {
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
        <div className="no-scrollbar max-w-full overflow-x-auto"><Segmented value={area} onChange={setArea} options={AREAS} /></div>
      </div>
      {!groups.length ? (
        <Empty icon={ShieldCheck} title={d.rows.length ? 'Nothing matches these filters' : 'Everyone is compliant'}
          body={d.rows.length ? undefined : 'No expired, missing or unverified documents and no overdue training.'} />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {groups.map((g) => {
            const name = `${g.officer.first_name} ${g.officer.last_name}`;
            return (
              <Tile key={g.officer.id}>
                <div className="mb-3 flex items-center gap-3">
                  <Avatar name={name} src={g.officer.photo_url} size={40} />
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
                      {r.card_id && (
                        <div className="mt-1.5 flex justify-end">
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => dismiss(r)}>Dismiss</Button>
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
                    <Button size="sm" variant="soft" onClick={openCard}>Open in Ops AI</Button>
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
          <p className="mb-2 text-footnote text-muted">Subject: {q.data.subject}. Sent to company managers after the weekly check (turn it off in Ops AI › Settings).</p>
          <iframe title="Email preview" srcDoc={q.data.html} className="h-[560px] max-h-full w-full rounded-2xl border border-sep bg-white" />
        </>
      )}
    </Sheet>
  );
}
