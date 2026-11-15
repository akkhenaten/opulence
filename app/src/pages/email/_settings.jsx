import { useState } from 'react';
import { AlertTriangle, ExternalLink, Inbox, KeyRound, Mail, RefreshCw, Trash2, Users } from 'lucide-react';
import { Button, Chips, Empty, Input, Load, Pill, Pressable, Section, Textarea, Tile, relative, useAction, useApi, useConfirm } from '../../ui/index.jsx';
import { api } from '../../api.js';
import { CopyLink } from '../people/_parts.jsx';
import { BASE, connect, emailChanged, PROVIDER_NAME, PROVIDER_SHORT } from './_parts.jsx';

/** Connect Gmail / Outlook buttons. A provider whose keys are not set up yet is shown but disabled. */
export function ConnectButtons({ providers = {}, ready, shared, variant = 'primary', inSettings }) {
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
      {off && !inSettings && (
        <p className="max-w-sm text-center text-footnote text-faint">
          Email sign-in is not switched on yet. Add the Google or Microsoft keys under <Pressable press to="/company/settings?tab=email" className="inline font-semibold text-blue">Settings → Email → Connection setup</Pressable>.
        </p>
      )}
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

const GUIDE = {
  google: {
    link: 'https://console.cloud.google.com/apis/credentials',
    steps: [
      'Open Google Cloud console with a Google Workspace admin account and create (or pick) a project.',
      'APIs & Services → Library: enable the Gmail API.',
      'OAuth consent screen: choose Internal for Workspace-only use, or External and add the people who will connect as test users (or publish the app).',
      'Credentials → Create credentials → OAuth client ID → Web application. Under Authorised redirect URIs paste the redirect URI above.',
      'Copy the Client ID and Client secret here.',
    ],
  },
  microsoft: {
    link: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade',
    steps: [
      'Open Microsoft Entra admin centre → App registrations → New registration.',
      'Supported account types: "Any organisational directory and personal Microsoft accounts" to allow Outlook.com too, or "This organisation only" (then enter the Directory (tenant) ID below).',
      'Redirect URI: choose Web and paste the redirect URI above.',
      'API permissions → Microsoft Graph → Delegated: Mail.ReadWrite, Mail.Send, offline_access, User.Read.',
      'Certificates & secrets → New client secret. Copy its Value (not the Secret ID) and the Application (client) ID from Overview.',
    ],
  },
};

/** Settings → Email → the Google / Microsoft app keys that let people sign in. */
// Last and folded away: it is done once by an admin, and opens by itself until it is
function SetupSection({ ready, onChanged }) {
  const [open, setOpen] = useState(!ready);
  const q = useApi('email.setup.get', { origin: window.location.origin }, { skip: !open });
  const changed = () => { q.reload(); onChanged(); emailChanged(); };
  return (
    <Section title="Connection setup (admin)" icon={KeyRound}
      action={<Button size="sm" variant="link" aria-expanded={open} onClick={() => setOpen((x) => !x)}>{open ? 'Hide' : 'Show'}</Button>}>
      {!open ? <p className="px-1 text-subhead text-muted">{ready ? 'Done. Only change these keys if signing in with Google or Microsoft stops working.' : 'Not finished yet.'}</p> : <Load q={q}>
        {(d) => (
          <div className="space-y-3">
            <p className="text-subhead text-muted">
              Once per company, an admin registers Orb with Google and/or Microsoft and pastes the keys here. Then everyone can connect their mailbox. Secrets are stored encrypted and are never shown again.
            </p>
            {d.redirect
              ? <CopyLink link={d.redirect} label="Redirect URI" hint="Register this exact address with Google and Microsoft" />
              : <p className="text-footnote text-amber">The app address is not known yet, so the redirect URI cannot be shown.</p>}
            {['google', 'microsoft'].map((p) => <ProviderSetup key={p} provider={p} s={d.providers[p]} onChanged={changed} />)}
          </div>
        )}
      </Load>}
    </Section>
  );
}

function ProviderSetup({ provider, s, onChanged }) {
  const confirm = useConfirm();
  const [run, busy] = useAction();
  const [f, setF] = useState({ client_id: s.client_id, client_secret: '', tenant: s.tenant });
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const dirty = f.client_id !== s.client_id || f.client_secret || f.tenant !== s.tenant;
  const save = () => run(() => api('email.setup.save', { provider, ...f }), `${PROVIDER_SHORT[provider]} keys saved`)
    .then(() => { setF((x) => ({ ...x, client_secret: '' })); onChanged(); });
  const remove = async () => {
    const ok = await confirm({
      title: `Remove the ${PROVIDER_SHORT[provider]} keys?`,
      body: `Nobody will be able to connect a ${PROVIDER_SHORT[provider]} mailbox, and connected ones stop working until the keys are added again.`,
      confirm: 'Remove', danger: true,
    });
    if (!ok) return;
    await run(() => api('email.setup.clear', { provider }), 'Keys removed');
    setF({ client_id: '', client_secret: '', tenant: '' });
    onChanged();
  };
  const g = GUIDE[provider];
  return (
    <Tile>
      <div className="flex flex-wrap items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-blue-soft text-blue"><KeyRound size={20} /></div>
        <div className="min-w-0 flex-1">
          <div className="text-body font-semibold">{PROVIDER_NAME[provider]}</div>
          {s.updated_at && <div className="text-footnote text-muted">Updated {relative(s.updated_at)}</div>}
        </div>
        {s.from_env ? <Pill tone="green">Set on the server</Pill> : s.configured ? <Pill tone="green">Ready</Pill> : <Pill>Not set up</Pill>}
      </div>
      {s.from_env ? (
        <p className="mt-3 text-footnote text-muted">These keys are set on the server ({s.client_id}) and cannot be changed here.</p>
      ) : (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Input label={provider === 'google' ? 'Client ID' : 'Application (client) ID'} value={f.client_id} onChange={set('client_id')} autoComplete="off" spellCheck={false}
              placeholder={provider === 'google' ? '…apps.googleusercontent.com' : '1a2b3c4d-…'} />
            <Input label={provider === 'google' ? 'Client secret' : 'Client secret value'} type="password" value={f.client_secret} onChange={set('client_secret')} autoComplete="new-password"
              hint={s.secret_hint ? `Saved ${s.secret_hint}. Leave blank to keep it.` : undefined} />
            {provider === 'microsoft' && (
              <Input label="Directory (tenant) ID" value={f.tenant} onChange={set('tenant')} autoComplete="off" spellCheck={false} placeholder="Optional"
                hint="Only for apps limited to your organisation" />
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" busy={busy} disabled={!dirty || !f.client_id || (!s.configured && !f.client_secret)} onClick={save}>Save keys</Button>
            {(s.configured || s.client_id) && <Button size="sm" variant="danger" icon={Trash2} busy={busy} onClick={remove}>Remove</Button>}
          </div>
        </>
      )}
      <details className="mt-4 rounded-xl bg-bg px-3 py-2">
        <summary className="cursor-pointer text-footnote font-semibold">How to get these</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-footnote text-muted">
          {g.steps.map((t) => <li key={t}>{t}</li>)}
        </ol>
        <Pressable press href={g.link} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-footnote font-semibold text-blue">
          Open {provider === 'google' ? 'Google Cloud console' : 'Microsoft Entra'}<ExternalLink size={14} />
        </Pressable>
      </details>
    </Tile>
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
        // Set up once at least one provider has its keys
        const configured = Object.values(d.providers || {}).some(Boolean);
        return (
          <div className="max-w-3xl">
            <p className="mb-4 text-subhead text-muted">
              Connect Gmail, Google Workspace, Outlook or Microsoft 365 to read and answer email inside Orb. Mail stays with Google or Microsoft; Orb keeps only a short list of recent subjects, so managers see recent email on a staff member's, venue's or client's page.
            </p>
            <Section title="Your mailbox" icon={Mail} count={personal.length}>
              {personal.length
                ? <div className="space-y-3">{personal.map((a) => <AccountCard key={a.id} a={a} onChanged={q.reload} />)}</div>
                : <Empty icon={Mail} title="No mailbox connected" body={configured ? 'Sign in with Google or Microsoft. Only you will see this mailbox.' : 'Connection setup below has to be finished once before anyone can connect a mailbox.'}
                    action={<ConnectButtons providers={d.providers} ready={d.ready} inSettings />} />}
            </Section>
            <Section title="Shared mailboxes and who can use them" icon={Users} count={shared.length}>
              {shared.length > 0 && <div className="mb-3 space-y-3">{shared.map((a) => <AccountCard key={a.id} a={a} onChanged={q.reload} />)}</div>}
              <Tile>
                <div className="mb-3 flex items-start gap-3">
                  <Inbox size={20} className="mt-0.5 shrink-0 text-blue" />
                  <div className="text-subhead text-muted">A mailbox like ops@ or bookings@ that several managers answer. Sign in as that mailbox, then choose who can use it. Emails sent from a shared mailbox are recorded in the audit log.</div>
                </div>
                <ConnectButtons providers={d.providers} ready={d.ready} shared variant="secondary" inSettings />
              </Tile>
            </Section>
            <SetupSection ready={configured} onChanged={q.reload} />
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
