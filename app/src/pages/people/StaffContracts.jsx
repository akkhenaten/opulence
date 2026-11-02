import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileSignature, ScrollText, Search } from 'lucide-react';
import { api } from '../../api.js';
import { Button, Empty, List, Load, Page, Progress, SearchInput, Segmented, useAction, useApi, useConfirm } from '../../ui/index.jsx';
import { ContractRow } from './_profileTabs.jsx';
import { ContractView, SendDocSheet } from './_esign.jsx';

const FILTERS = [{ value: '', label: 'All' }, { value: 'sent', label: 'Awaiting' }, { value: 'signed', label: 'Signed' }, { value: 'void', label: 'Void' }];
const KINDS = [{ value: '', label: 'Everything' }, { value: 'contract', label: 'Contracts' }, { value: 'policy', label: 'Policies' }];

/** Each policy: how many have signed its current version, and who still needs to */
function PolicySummary({ rows }) {
  const [open, setOpen] = useState(null);
  const policies = useMemo(() => {
    const by = new Map();
    for (const c of rows) {
      if (c.category !== 'policy' || !['sent', 'signed'].includes(c.status)) continue;
      const p = by.get(c.template_id) || { id: c.template_id, title: c.title, signed: 0, waiting: [] };
      if (c.status === 'signed') p.signed += 1; else p.waiting.push(c.officer_name);
      by.set(c.template_id, p);
    }
    return [...by.values()];
  }, [rows]);
  if (!policies.length) return null;
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {policies.map((p) => {
        const total = p.signed + p.waiting.length;
        return (
          <div key={p.id} className="rounded-tile bg-surface p-4 shadow-tile">
            <div className="flex items-center gap-2">
              <ScrollText size={17} className="shrink-0 text-blue" />
              <div className="min-w-0 flex-1 truncate text-subhead font-semibold">{p.title}</div>
              <span className="num text-subhead font-bold">{p.signed} / {total}</span>
            </div>
            <Progress value={p.signed} max={total} className="mt-2.5" />
            {p.waiting.length > 0 && (
              <button type="button" onClick={() => setOpen(open === p.id ? null : p.id)} className="mt-2 text-left text-footnote text-muted">
                {open === p.id ? `Not signed yet: ${p.waiting.join(', ')}` : `${p.waiting.length} still to sign · show who`}
              </button>
            )}
            {!p.waiting.length && <div className="mt-2 text-footnote font-semibold text-green">Everyone has signed</div>}
          </div>
        );
      })}
    </div>
  );
}

/** Every contract issued across the workforce; each officer's profile shows the same contracts */
export default function StaffContracts() {
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState('');
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => { const t = setTimeout(() => setSearch(text.trim()), 250); return () => clearTimeout(t); }, [text]);
  const q = useApi('contracts.list', { status: status || undefined, category: category || undefined, q: search || undefined });
  const [sending, setSending] = useState(false);
  const [viewing, setViewing] = useState(null);
  const confirm = useConfirm();
  const [run] = useAction();
  const voidIt = async (c) => {
    if (!(await confirm({ title: `Void "${c.title}"?`, body: `${c.officer_name} will no longer be able to sign ${c.reference}. It stays on record marked void.`, confirm: 'Void', danger: true }))) return;
    await run(() => api('contracts.void', { id: c.id }), 'Voided');
    q.reload();
  };
  return (
    <Page title="Staff contracts" subtitle="Contracts and policies sent for signature, and where each one stands"
      actions={<Button icon={FileSignature} onClick={() => setSending(true)}>Send for signature</Button>}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput className="min-w-0 flex-1 basis-60" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search officers or contracts" />
        <Segmented value={category} onChange={setCategory} options={KINDS} />
        <Segmented value={status} onChange={setStatus} options={FILTERS} />
      </div>
      <Load q={q} skeleton="rows">
        {(rows) => rows.length ? (
          <>
            {!status && !search && category !== 'contract' && <PolicySummary rows={rows} />}
            <List>
              {rows.map((c) => (
                <ContractRow key={c.id} c={c} onView={() => setViewing(c.id)} onVoid={() => voidIt(c)} onDone={q.reload}
                  who={<Link to={`/company/staff/${c.officer_id}?tab=contracts`} className="block truncate text-footnote font-semibold text-blue">{c.officer_name}</Link>} />
              ))}
            </List>
          </>
        ) : search || status || category
          ? <Empty icon={Search} title="No matching contracts" />
          : <Empty icon={FileSignature} title="Nothing sent yet" body="Send a contract or policy for e-signature. Templates live in Settings → Templates." />}
      </Load>
      {sending && <SendDocSheet onClose={() => setSending(false)} onDone={q.reload} />}
      {viewing && <ContractView id={viewing} onClose={() => setViewing(null)} />}
    </Page>
  );
}
