// A record's own History (company managers only, as the audit log is), and the record links the Audit page uses
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '../../auth.jsx';
import { actionLabel, changeLine } from './_auditText.js';
import { Button, cx, date, LoadFail, Pressable, Spinner, time, titleCase, useApi } from '../../ui/index.jsx';

// Where a record opens in the company portal; types with no page of their own have none
export function recordLink(r) {
  const id = r.entity_id;
  if (!id) return null;
  return {
    officer: `/company/staff/${id}`, venue: `/company/venues/${id}`, invoice: `/company/invoices/${id}`, statement: `/company/pay/${id}`,
    incident: `/company/incidents/${id}`, shift: `/company/shifts/${id}`,
    contract: `/company/people/contracts?contract=${id}`, pay_run: `/company/pay/runs/${id}`,
  }[r.entity] || null;
}

export function DetailView({ detail, className = 'ml-12' }) {
  return (
    <dl className={cx(className, 'mt-2 grid gap-x-4 gap-y-1 rounded-xl bg-bg p-3 text-caption sm:grid-cols-[auto_1fr]')}>
      {Object.entries(detail).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="font-semibold text-muted">{titleCase(k.replace(/_/g, ' '))}</dt>
          <dd className="min-w-0 break-words font-mono text-ink">{typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

const PAGE = 10;

/** History · N changes, collapsed; entity + id of the record, related: include its parts (documents of an officer, assignments of a shift). */
export default function RecordHistory(props) {
  const { user } = useAuth();
  if (user?.role !== 'company' || !props.id) return null;
  return <History {...props} />;
}

function History({ entity, id, related = false, className }) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const body = { entity, entity_id: String(id), related: related || undefined };
  const n = useApi('audit.count', body);
  const q = useApi('audit.list', { ...body, limit }, { skip: !open });
  const count = n.data?.n;
  if (n.error || count === 0) return null;
  const rows = q.data || [];
  return (
    <section className={cx('mt-6', className)} aria-label="History">
      <Pressable onClick={() => setOpen((x) => !x)} aria-expanded={open}
        className="flex w-full items-center gap-2 px-1 text-left text-footnote font-semibold uppercase tracking-wide text-muted">
        <span className="min-w-0 flex-1">History{count != null ? ` · ${count} change${count === 1 ? '' : 's'}` : ''}</span>
        <ChevronDown size={16} className={cx('shrink-0 transition', open && 'rotate-180')} aria-hidden />
      </Pressable>
      {open && (
        <div className="mt-2 rounded-tile border border-hairline bg-surface p-4 shadow-tile">
          <LoadFail q={q} what="history" />
          {!q.data && !q.error ? <Spinner /> : (
            <ol className="space-y-3">
              {rows.map((r) => <HistoryEntry key={r.id} r={r} own={r.entity === entity && String(r.entity_id) === String(id)} />)}
            </ol>
          )}
          {rows.length >= limit && count > limit && <Button variant="link" className="mt-2" onClick={() => setLimit((x) => x + PAGE)}>Show more ({count - limit})</Button>}
        </div>
      )}
    </section>
  );
}

export function HistoryEntry({ r, own }) {
  const [more, setMore] = useState(false);
  const detail = r.detail && typeof r.detail === 'object' && Object.keys(r.detail).length ? r.detail : null;
  const line = changeLine(r);
  return (
    <li className="text-footnote">
      <div>
        <span className="num text-muted">{date(r.created_at)} {time(r.created_at)}</span>
        <span className="text-muted"> · {r.user_name || 'System'} · </span>
        <span className="font-semibold">{actionLabel(r.action)}</span>
        {!own && r.record_name && <span className="text-muted"> · {r.record_name}</span>}
      </div>
      {line && <div className="text-muted">{line}</div>}
      {detail && (
        <>
          <Pressable press onClick={() => setMore((x) => !x)} className="relative mt-0.5 inline-flex items-center gap-1 text-caption font-semibold text-blue before:absolute before:-inset-x-2 before:-inset-y-2">
            {more ? 'Hide detail' : 'Show detail'}<ChevronDown size={14} className={cx('transition', more && 'rotate-180')} />
          </Pressable>
          {more && <DetailView detail={detail} className="" />}
        </>
      )}
    </li>
  );
}
