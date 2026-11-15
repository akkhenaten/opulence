// Compliance as a review queue: one row per officer and document, who acts next, and the document opened beside the list
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Eye, ShieldCheck, UserRound } from 'lucide-react';
import { api } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { openUrl } from './_parts.jsx';
import { Avatar, Button, Check, date, Empty, List, Pill, Pressable, Row, Sheet, Spinner, Table, time, useAction, useApi, useMedia, useUrlState } from '../../ui/index.jsx';

const SEV_TONE = { urgent: 'red', soon: 'amber', advisory: 'blue' };
const SEV_LABEL = { urgent: 'Urgent', soon: 'Soon', advisory: 'Advisory' };
const SEV_RANK = { urgent: 0, soon: 1, advisory: 2 };
const FIELD = { number: 'Number', expiry: 'Expiry', name: 'Name', photo: 'Photo' };
const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);
const name = (o) => `${o.first_name} ${o.last_name}`;

// "expires in 9 days" / "expired 3 Nov" / the finding itself when there is no date
function whenLine(r) {
  if (r.days_left == null) return r.title;
  if (r.days_left < 0) return `expired ${date(r.expiry)}`;
  if (r.days_left === 0) return 'expires today';
  return `expires in ${r.days_left} day${r.days_left === 1 ? '' : 's'}`;
}
const what = (r) => r.doc_label ? cap(r.doc_label) : r.area === 'training' ? 'Training' : r.area === 'venue_pack' ? 'Site pack' : 'Profile';

/** The rows of the overview folded into one item per officer and document, ordered can't work, on grace, then by urgency. */
export function queueItems(rows, work) {
  const m = new Map();
  for (const r of rows) {
    if (!m.has(r.group)) m.set(r.group, { id: r.group, officer: r.officer, rows: [] });
    m.get(r.group).rows.push(r);
  }
  const rank = (id) => (work.has(id) ? (work.get(id).grace ? 1 : 0) : 2);
  return [...m.values()].map((g) => {
    const top = [...g.rows].sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity])[0];
    return { ...g, top, severity: top.severity, owner_label: top.owner_label };
  }).sort((a, b) => rank(a.officer.id) - rank(b.officer.id) || SEV_RANK[a.severity] - SEV_RANK[b.severity]);
}

export default function Queue({ rows, work, company, reload, workLine, openRtw }) {
  const nav = useNavigate();
  const [url, setUrl] = useUrlState({ doc: '' });
  const [, setSp] = useSearchParams();
  const wide = useMedia('(min-width: 1024px)');
  const items = useMemo(() => queueItems(rows, work), [rows, work]);
  // Opening a document adds a step to history, so the phone's Back returns to the list; stepping through replaces it
  const pushed = useRef(false);
  const open = (it) => {
    if (url.doc) return setUrl({ doc: it.id });
    pushed.current = true;
    setSp((cur) => { const n = new URLSearchParams(cur); n.set('doc', it.id); return n; });
  };
  const close = () => { if (pushed.current) { pushed.current = false; nav(-1); } else setUrl({ doc: '' }); };
  useEffect(() => { if (!url.doc) pushed.current = false; }, [url.doc]);
  const at = items.findIndex((x) => x.id === url.doc);
  const step = (i) => (at >= 0 && items[i] ? () => setUrl({ doc: items[i].id }) : undefined);
  const sel = at >= 0 ? items[at] : null;

  if (!items.length) return null;
  const state = (it) => {
    const w = work.get(it.officer.id);
    return w ? (w.grace ? <Pill tone="amber">On grace</Pill> : <Pill tone="red">Can't work</Pill>) : null;
  };
  const columns = [
    { key: 'who', label: 'Officer', render: (it) => (
      <div className="flex items-center gap-3"><Avatar name={name(it.officer)} src={it.officer.photo_url} size={32} />
        <div className="min-w-0"><div className="truncate font-semibold">{name(it.officer)}</div>{it.officer.status === 'onboarding' && <div className="text-footnote text-muted">Onboarding</div>}</div></div>
    ) },
    { key: 'doc', label: 'Document', render: (it) => (
      <div className="min-w-0"><div className="truncate font-semibold">{what(it.top)}</div>
        <div className="truncate text-footnote text-muted">{whenLine(it.top)}{it.rows.length > 1 ? ` · ${it.rows.length} findings` : ''}{it.top.handled ? ' · handled' : ''}</div></div>
    ) },
    { key: 'owner', label: 'Who acts', render: (it) => <span className="text-subhead font-semibold">{it.owner_label}</span> },
    { key: 'sev', label: 'Urgency', render: (it) => <div className="flex flex-wrap gap-1.5">{state(it)}<Pill tone={SEV_TONE[it.severity]}>{SEV_LABEL[it.severity]}</Pill></div> },
  ];
  return (
    <>
      {wide ? <Table columns={columns} rows={items} onRow={open} selected={sel?.id} /> : (
        <List>
          {items.map((it) => (
            <Row key={it.id} onClick={() => open(it)} chevron
              left={<Avatar name={name(it.officer)} src={it.officer.photo_url} size={40} />}
              title={`${name(it.officer)} · ${what(it.top)}`}
              subtitle={`${whenLine(it.top)} · ${it.owner_label}`}
              right={<div className="flex flex-col items-end gap-1">{state(it)}<Pill tone={SEV_TONE[it.severity]}>{SEV_LABEL[it.severity]}</Pill></div>} />
          ))}
        </List>
      )}
      {sel && <DocPanel key={sel.id} it={sel} company={company} reload={reload} workLine={workLine} openRtw={openRtw} onClose={close} onPrev={step(at - 1)} onNext={step(at + 1)} />}
    </>
  );
}

function statusLine(r, d) {
  const up = d?.upload;
  const parts = [];
  parts.push(up ? `Uploaded ${date(up.uploaded_at)}` : 'Nothing uploaded');
  if (up) parts.push(up.checked === 'person' ? `checked${up.checked_by ? ` by ${up.checked_by}` : ''}${up.checked_at ? ` ${date(up.checked_at)}` : ''}` : up.checked === 'orb' ? 'Checked by Orb' : 'not checked yet');
  if (r.expiry) parts.push(r.days_left < 0 ? `expired ${date(r.expiry)}` : `in date until ${date(r.expiry)}`);
  return parts.join(' · ');
}

function DocPanel({ it, company, reload, workLine, openRtw, onClose, onPrev, onNext }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const r = it.top;
  const docId = it.rows.find((x) => x.doc_id)?.doc_id || null;
  const q = useApi('compliance.document', { officer_id: it.officer.id, doc_id: docId || undefined, doc: docId ? undefined : r.doc || undefined }, { skip: !docId && !r.doc });
  const d = q.data;
  const base = `/${user.role}`;
  const affected = useMemo(() => {
    const m = new Map();
    for (const x of it.rows) for (const s of x.affected || []) m.set(s.assignment_id || s.shift_id || s.starts_at, s);
    return [...m.values()].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  }, [it]);
  const [run, busy] = useAction();
  const view = () => run(() => openUrl(() => api('docs.url', { id: d.upload.doc_id })));
  return (
    <Sheet open side full onClose={onClose} title={`${name(it.officer)} · ${what(r)}`} onPrev={onPrev} onNext={onNext}
      footer={<div className="flex flex-wrap justify-end gap-2">
        {d?.upload?.has_file && <Button variant="secondary" icon={Eye} busy={busy} onClick={view}>View file</Button>}
        <Button variant="secondary" icon={UserRound} onClick={() => nav(`${base}/staff/${it.officer.id}?tab=documents`)}>Open profile</Button>
      </div>}>
      {workLine(it.officer.id, it.rows.length > 0)}
      <div className="text-subhead font-semibold">{(!docId && !r.doc) || q.error ? r.title : d ? statusLine(r, d) : <Spinner />}</div>
      {r.handled && <p className="mt-1 text-footnote text-muted">Handled {date(r.handled.at)}: {r.handled.note}</p>}

      {d?.rows?.length > 0 && (
        <section aria-label="What we have and what Orb read" className="mt-4">
          <h3 className="mb-1.5 text-footnote font-bold uppercase tracking-wide text-muted">What we have vs what Orb read</h3>
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full text-footnote">
              <thead><tr className="border-b border-line text-left text-caption font-semibold uppercase tracking-wide text-faint">
                <th className="px-2.5 py-2">Field</th><th className="px-2.5 py-2">On profile</th><th className="px-2.5 py-2">On the upload</th><th className="px-2.5 py-2">Read by Orb</th>
              </tr></thead>
              <tbody className="divide-y divide-line">
                {d.rows.map((x) => (
                  <tr key={x.field} className={x.mismatch ? 'bg-amber-soft' : ''}>
                    <td className="px-2.5 py-2 font-semibold">{FIELD[x.field]}{x.mismatch && <div className="text-caption font-bold text-amber">Doesn't match</div>}</td>
                    {['profile', 'upload', 'orb'].map((k) => <td key={k} className={`num px-2.5 py-2 ${x.field === 'number' ? 'break-all' : ''}`}>{x[k] ? (x.field === 'expiry' ? date(x[k]) : x[k]) : <span className="text-faint">—</span>}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-footnote text-muted">Orb's reading is shown for comparison. It doesn't change anything here and never counts as a person's check.</p>
          {d.orb?.concerns?.length > 0 && <p className="mt-1 text-footnote text-amber">Orb noticed: {d.orb.concerns.join('; ')}</p>}
        </section>
      )}

      {d?.why && <section className="mt-4"><h3 className="mb-1 text-footnote font-bold uppercase tracking-wide text-muted">Why it matters</h3><p className="text-subhead">{d.why}</p></section>}

      <section className="mt-4">
        <h3 className="mb-1 text-footnote font-bold uppercase tracking-wide text-muted">Shifts affected</h3>
        {!affected.length ? <p className="text-subhead text-muted">No booked shifts affected in the next 14 days</p> : (
          <ul className="space-y-1">
            {affected.map((s) => (
              <li key={s.assignment_id || s.starts_at} className="num text-subhead">
                {s.shift_id ? <Link className="font-semibold text-blue" to={`${base}/shifts/${s.shift_id}`}>{s.venue_name} · {date(s.starts_at)} {time(s.starts_at)}</Link> : `${s.venue_name} · ${date(s.starts_at)} ${time(s.starts_at)}`}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-4">
        <h3 className="mb-1.5 text-footnote font-bold uppercase tracking-wide text-muted">{it.rows.length > 1 ? `${it.rows.length} findings` : 'Finding'}</h3>
        <div className="space-y-2">
          {it.rows.map((x, n) => <Finding key={x.key} r={x} company={company} reload={() => { reload(); q.reload(); }} rtw={openRtw && x.area === 'rtw' && !n ? () => openRtw(it.officer.id) : null} />)}
        </div>
      </section>
    </Sheet>
  );
}

// One finding with the actions its Orb card offers, run the same way the card runs them
function Finding({ r, company, reload, rtw }) {
  const [picked, setPicked] = useState(() => new Set(r.actions.filter((a) => a.default).map((a) => a.id)));
  const [run, busy] = useAction();
  const toggle = (id) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const apply = () => run(() => api('compliance.act', { officer_id: r.officer.id, key: r.key, card_id: r.card_id, action_ids: [...picked] }), (x) => x.done?.join('. ') || 'Done').then(reload).catch(() => {});
  const dismiss = () => run(() => api('ops.dismissIssue', { id: r.card_id, key: r.key }), 'Dismissed').then(reload).catch(() => {});
  return (
    <div className="rounded-2xl bg-bg p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 text-subhead font-semibold">{r.title}</div>
        <Pill tone={SEV_TONE[r.severity]}>{SEV_LABEL[r.severity]}</Pill>
      </div>
      {r.detail && <p className="mt-0.5 text-footnote text-muted">{r.detail}</p>}
      <p className="mt-0.5 text-footnote font-semibold">{r.owner_label}</p>
      {r.actions.length > 0 && (
        <ul className="mt-2 space-y-2">
          {r.actions.map((a) => (
            <li key={a.id} className="flex items-start gap-2.5">
              <Check checked={picked.has(a.id)} onChange={() => toggle(a.id)} label={a.label} />
              <Pressable press className="min-w-0 text-left text-subhead" onClick={() => toggle(a.id)}>{a.label}</Pressable>
            </li>
          ))}
        </ul>
      )}
      {!company && r.actions.length === 0 && <p className="mt-1 text-footnote text-muted">A company manager decides this one.</p>}
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        {rtw && <Button size="sm" variant="soft" onClick={rtw}>Check right to work</Button>}
        {r.card_id && <Button size="sm" variant="ghost" disabled={busy} onClick={dismiss}>Dismiss</Button>}
        {r.actions.length > 0 && <Button size="sm" icon={ShieldCheck} busy={busy} disabled={!picked.size} onClick={apply}>Apply{picked.size > 1 ? ` ${picked.size}` : ''}</Button>}
      </div>
    </div>
  );
}

export function QueueEmpty({ filtered }) {
  return <Empty icon={ShieldCheck} title={filtered ? 'Nothing matches these filters' : 'Everyone is compliant'} body={filtered ? undefined : 'No expired, missing or unverified documents and no overdue training.'} />;
}
