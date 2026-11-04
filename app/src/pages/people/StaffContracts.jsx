import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FilePen, FilePlus2, FileSignature, ScrollText, Search, Trash2 } from 'lucide-react';
import { api } from '../../api.js';
import { Button, dateTime, Empty, IconButton, List, Load, Page, Pill, Progress, Row, SearchInput, Segmented, useAction, useApi, useConfirm } from '../../ui/index.jsx';
import { ContractRow } from './_profileTabs.jsx';
import { ContractView, SendDocSheet } from './_esign.jsx';
import StartSheet from './contracts/StartSheet.jsx';
import { JUR_SHORT } from './contracts/_shared.jsx';

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

const VIEWS = [{ value: 'issued', label: 'Issued' }, { value: 'drafts', label: 'Drafts' }];

/** Contracts being drafted in the workspace, not sent yet */
function Drafts() {
  const q = useApi('contracts.draft.list', {});
  const confirm = useConfirm();
  const [run] = useAction();
  const remove = async (d) => {
    if (!(await confirm({ title: `Delete "${d.title}"?`, body: 'The draft and its answers are deleted. Nothing was sent.', confirm: 'Delete', danger: true }))) return;
    await run(() => api('contracts.draft.delete', { id: d.id }), 'Draft deleted').catch(() => {});
    q.reload();
  };
  return (
    <Load q={q} skeleton="rows">
      {(rows) => rows.length ? (
        <List>
          {rows.map((d) => (
            <div key={d.id} className="flex items-center pr-2">
              <Row className="min-w-0 flex-1" left={<FilePen size={18} className="text-blue" />} title={d.title} to={`/company/people/contracts/draft/${d.id}`}
                subtitle={`${d.party_name} · ${d.pack_title} · ${JUR_SHORT[d.jurisdiction]} · edited ${dateTime(d.updated_at)}${d.created_by_name ? ` by ${d.created_by_name}` : ''}`}
                right={d.amend_kind ? <Pill tone="blue">{d.amend_kind}</Pill> : null} />
              <IconButton icon={Trash2} label="Delete draft" onClick={() => remove(d)} />
            </div>
          ))}
        </List>
      ) : <Empty icon={FilePen} title="No drafts" body="Create a contract to draft it with the guide, the clause library and a live preview." />}
    </Load>
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
  const [creating, setCreating] = useState(false);
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'drafts' ? 'drafts' : 'issued';
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
      actions={<>
        <Button variant="secondary" icon={FileSignature} onClick={() => setSending(true)}>Send a template</Button>
        <Button icon={FilePlus2} onClick={() => setCreating(true)}>Create contract</Button>
      </>}>
      <Segmented className="mb-4" value={view} onChange={(x) => setParams(x === 'drafts' ? { view: x } : {}, { replace: true })} options={VIEWS} />
      {view === 'drafts' ? <Drafts /> : <>
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
      </>}
      {creating && <StartSheet onClose={() => setCreating(false)} />}
      {sending && <SendDocSheet onClose={() => setSending(false)} onDone={q.reload} />}
      {viewing && <ContractView id={viewing} onClose={() => setViewing(null)} />}
    </Page>
  );
}
