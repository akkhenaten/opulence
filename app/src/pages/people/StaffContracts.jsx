import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FileSignature, Search } from 'lucide-react';
import { api } from '../../api.js';
import { Button, Empty, List, Load, Page, SearchInput, Segmented, useAction, useApi, useConfirm } from '../../ui/index.jsx';
import { ContractRow, ContractView, SendContractSheet } from './_profileTabs.jsx';

const FILTERS = [{ value: '', label: 'All' }, { value: 'sent', label: 'Awaiting signature' }, { value: 'signed', label: 'Signed' }, { value: 'void', label: 'Void' }];

/** Every contract issued across the workforce; each officer's profile shows the same contracts */
export default function StaffContracts() {
  const [status, setStatus] = useState('');
  const [text, setText] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => { const t = setTimeout(() => setSearch(text.trim()), 250); return () => clearTimeout(t); }, [text]);
  const q = useApi('contracts.list', { status: status || undefined, q: search || undefined });
  const [sending, setSending] = useState(false);
  const [viewing, setViewing] = useState(null);
  const confirm = useConfirm();
  const [run] = useAction();
  const voidIt = async (c) => {
    if (!(await confirm({ title: `Void "${c.title}"?`, body: `${c.officer_name} will no longer be able to sign it.`, confirm: 'Void', danger: true }))) return;
    await run(() => api('contracts.void', { id: c.id }), 'Contract voided');
    q.reload();
  };
  return (
    <Page title="Staff contracts" subtitle="Contracts issued to officers and where each one stands"
      actions={<Button icon={FileSignature} onClick={() => setSending(true)}>Send contract</Button>}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SearchInput className="min-w-0 flex-1 basis-60" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search officers or contracts" />
        <Segmented value={status} onChange={setStatus} options={FILTERS} />
      </div>
      <Load q={q} skeleton="rows">
        {(rows) => rows.length ? (
          <List>
            {rows.map((c) => (
              <ContractRow key={c.id} c={c} onView={() => setViewing(c.id)} onVoid={() => voidIt(c)}
                who={<Link to={`/company/staff/${c.officer_id}?tab=contracts`} className="block truncate text-footnote font-semibold text-blue">{c.officer_name}</Link>} />
            ))}
          </List>
        ) : search || status
          ? <Empty icon={Search} title="No matching contracts" />
          : <Empty icon={FileSignature} title="No contracts yet" body="Send a contractor agreement for e-signature. Templates live in Settings → Templates." />}
      </Load>
      {sending && <SendContractSheet onClose={() => setSending(false)} onDone={q.reload} />}
      {viewing && <ContractView id={viewing} onClose={() => setViewing(null)} />}
    </Page>
  );
}
