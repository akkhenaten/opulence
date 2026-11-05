import { useState } from 'react';
import { AlertTriangle, Inbox, Mail, RefreshCw, Trash2, Users } from 'lucide-react';
import { Button, Chips, Empty, Load, Pill, Section, Textarea, Tile, relative, useAction, useApi, useConfirm } from '../../ui/index.jsx';
import { api } from '../../api.js';
import { BASE, connect, emailChanged, PROVIDER_NAME, PROVIDER_SHORT } from './_parts.jsx';

/** Connect Gmail / Outlook buttons. A provider whose keys are not set up yet is shown but disabled. */
export function ConnectButtons({ providers = {}, ready, shared, variant = 'primary' }) {
  const [run, busy] = useAction();
  const [which, setWhich] = useState(null);
  const go = (p) => { setWhich(p); run(() => connect(p, { shared })).catch(() => setWhich(null)); };
  const off = !ready || (!providers.google && !providers.microsoft);
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex flex-wrap justify-center gap-2">
        {['google', 'microsoft'].map((p) => (
          <Button key={p} variant={variant} icon={Mail} busy={busy && which === p} disabled={busy || !ready || !providers[p]} onClick={() => go(p)}>
            {shared ? `Shared ${PROVIDER_SHORT[p]} mailbox` : PROVIDER_NAME[p]}
          </Button>
        ))}
      </div>
      {off && <p className="max-w-sm text-center text-footnote text-faint">Email sign-in is not switched on yet. It needs the Google and Microsoft app keys adding to the server.</p>}
    </div>
  );
}

export function ReconnectBanner({ acc }) {
  const [run, busy] = useAction();
  return (
    <div className="flex items-start gap-3 rounded-2xl bg-amber-soft p-3 text-subhead">
      <AlertTriangle size={20} className="mt-0.5 shrink-0 text-amber" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{acc.address} needs reconnecting</div>
        <div className="text-footnote text-muted">{acc.last_error && !/needs reconnecting/.test(acc.last_error) ? acc.last_error : 'The sign-in has expired or access was removed.'}</div>
        <Button size="sm" className="mt-2" icon={RefreshCw} busy={busy} onClick={() => run(() => connect(acc.provider, { account_id: acc.id }))}>Reconnect</Button>
      </div>
    </div>
  );
}

/** Settings → Email: your own mailbox, shared mailboxes, signatures and who can use a shared one. */
export function EmailTab() {
  const q = useApi('email.accounts');
  return (
    <Load q={q}>
      {(d) => {
        const personal = d.accounts.filter((a) => !a.shared);
        const shared = d.accounts.filter((a) => a.shared);
        return (
          <div className="max-w-3xl">
            <p className="mb-4 text-subhead text-muted">
              Connect Gmail, Google Workspace, Outlook or Microsoft 365 to read and answer email inside Orb. Mail stays with Google or Microsoft; Orb keeps only a short list of recent subjects so it can show email on staff, venue and client pages.
            </p>
            <Section title="Your mailbox" className="mt-0">
              {personal.length
                ? <div className="space-y-3">{personal.map((a) => <AccountCard key={a.id} a={a} onChanged={q.reload} />)}</div>
                : <Empty icon={Mail} title="No mailbox connected" body="Sign in with Google or Microsoft. Only you will see this mailbox." action={<ConnectButtons providers={d.providers} ready={d.ready} />} />}
            </Section>
            <Section title="Shared mailboxes">
              {shared.length > 0 && <div className="mb-3 space-y-3">{shared.map((a) => <AccountCard key={a.id} a={a} onChanged={q.reload} />)}</div>}
              <Tile>
                <div className="mb-3 flex items-start gap-3">
                  <Inbox size={20} className="mt-0.5 shrink-0 text-blue" />
                  <div className="text-subhead text-muted">A mailbox like ops@ or bookings@ that several managers answer. Sign in as that mailbox, then choose who can use it. Emails sent from a shared mailbox are recorded in the audit log.</div>
                </div>
                <ConnectButtons providers={d.providers} ready={d.ready} shared variant="secondary" />
              </Tile>
            </Section>
          </div>
        );
      }}
    </Load>
  );
}

function AccountCard({ a, onChanged }) {
  const confirm = useConfirm();
  const [run, busy] = useAction();
  const [sig, setSig] = useState(a.signature || '');
  const disconnect = async () => {
    const ok = await confirm({
      title: `Disconnect ${a.address}?`,
      body: a.shared ? 'Nobody will be able to use this mailbox in Orb until it is connected again. Your email itself is not touched.' : 'Orb will stop showing this mailbox. Your email itself is not touched.',
      confirm: 'Disconnect', danger: true,
    });
    if (!ok) return;
    await run(() => api('email.disconnect', { id: a.id }), 'Disconnected');
    emailChanged();
    onChanged();
  };
  return (
    <Tile>
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-blue-soft text-blue"><Mail size={20} /></div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-body font-semibold">{a.address}</div>
          <div className="text-footnote text-muted">
            {PROVIDER_NAME[a.provider]}{a.shared ? ' · shared' : ''}{a.last_sync ? ` · checked ${relative(a.last_sync)}` : ''}
          </div>
        </div>
        {a.status === 'connected' ? <Pill tone="green">Connected</Pill> : <Pill tone="amber">Needs reconnecting</Pill>}
      </div>
      {a.status !== 'connected' && <div className="mt-3"><ReconnectBanner acc={a} /></div>}
      <Textarea className="mt-4" label="Signature" rows={3} value={sig} onChange={(e) => setSig(e.target.value)} hint="Added to new emails and replies from this mailbox" />
      <div className="mt-3 flex flex-wrap gap-2">
        {sig !== (a.signature || '') && <Button size="sm" busy={busy} onClick={() => run(() => api('email.signature', { id: a.id, signature: sig }), 'Signature saved').then(onChanged)}>Save signature</Button>}
        <Button size="sm" variant="secondary" icon={Inbox} to={`${BASE}?a=${a.id}`}>Open</Button>
        <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => run(() => connect(a.provider, { account_id: a.id }))}>Reconnect</Button>
        <Button size="sm" variant="danger" icon={Trash2} busy={busy} onClick={disconnect}>Disconnect</Button>
      </div>
      {a.shared && <Grants a={a} onChanged={onChanged} />}
    </Tile>
  );
}

function Grants({ a, onChanged }) {
  const users = useApi('users.list', { role: 'company' });
  const [ids, setIds] = useState((a.users || []).map((u) => u.id));
  const [run, busy] = useAction();
  const changed = ids.slice().sort().join() !== (a.users || []).map((u) => u.id).sort().join();
  return (
    <div className="mt-4 border-t border-line pt-4">
      <div className="mb-2 flex items-center gap-2 text-footnote font-semibold text-muted"><Users size={16} />Who can use it (besides whoever connected it)</div>
      <Load q={users}>
        {(list) => (
          <Chips value={ids} onChange={setIds} options={list.filter((u) => u.status !== 'disabled').map((u) => ({ value: u.id, label: u.name || u.email }))} />
        )}
      </Load>
      {changed && <Button size="sm" className="mt-3" busy={busy} onClick={() => run(() => api('email.grant', { id: a.id, user_ids: ids }), 'Access saved').then(onChanged)}>Save access</Button>}
    </div>
  );
}
