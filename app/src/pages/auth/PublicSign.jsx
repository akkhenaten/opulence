// Signing from an email link, without a login: a business's signatory or an officer who has not been invited yet.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Clock, Download, FileX2, ShieldCheck } from 'lucide-react';
import { api, downloadAction } from '../../api.js';
import { Logo } from '../../layouts/Shell.jsx';
import { Button, dateTime, PoweredBy, Spinner, useAction } from '../../ui/index.jsx';
import SignFlow from '../officer/SignFlow.jsx';
import { contractFlow } from '../officer/Contract.jsx';

const STATE = {
  expired: [Clock, 'This link has expired'],
  revoked: [FileX2, 'This link has been replaced'],
  used: [ShieldCheck, 'Already signed'],
  void: [FileX2, 'Withdrawn'],
  invalid: [FileX2, 'Link not valid'],
};

function Frame({ children }) {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-30 flex h-14 items-center border-b border-hairline bg-surface/90 pt-[env(safe-area-inset-top)] [--px:1rem] sm:[--px:1.5rem] safe-x backdrop-blur-xl">
        <Logo />
      </header>
      <main className="mx-auto max-w-3xl py-5 [--px:1rem] sm:[--px:1.5rem] safe-x pb-28">{children}</main>
      <PoweredBy className="pb-8" />
    </div>
  );
}

export default function PublicSign() {
  const { token } = useParams();
  const [c, setC] = useState(null);
  const [err, setErr] = useState(null);
  const [run, busy] = useAction();
  const load = () => api('sign.link.open', { token }).then(setC, (x) => setErr({ message: x.message, state: x.data?.state || 'invalid' }));
  useEffect(() => { load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err) {
    const [Icon, title] = STATE[err.state] || STATE.invalid;
    return (
      <Frame>
        <div className="mx-auto mt-10 max-w-md rounded-tile bg-surface p-6 text-center shadow-tile">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-fill text-muted"><Icon size={28} /></div>
          <h1 className="mt-3 text-title3 font-bold">{title}</h1>
          <p className="mt-1 text-subhead text-muted">{err.message}</p>
        </div>
      </Frame>
    );
  }
  if (!c) return <Frame><Spinner className="py-20" /></Frame>;

  const d = contractFlow(c);
  const pdf = () => downloadAction('sign.link.pdf', { token });
  return (
    <Frame>
      <div className="mb-4">
        <div className="text-caption font-semibold uppercase tracking-wide text-muted">{c.brand?.name} · Document to sign</div>
        <h1 className="display text-title2 font-bold leading-tight">{c.title}</h1>
        <p className="mt-1 text-footnote text-muted">
          {c.party ? `For ${c.party}. ` : ''}{c.state === 'ok' ? `This link works until ${dateTime(c.expires_at)} and can be used once.` : `You can download the signed copy until ${dateTime(c.download_until)}.`}
        </p>
        {c.state === 'ok' && (
          <Button variant="secondary" size="sm" icon={Download} busy={busy} className="mt-2" onClick={() => run(pdf).catch(() => {})}>Download to read offline</Button>
        )}
      </div>
      <SignFlow d={d} defaultName={c.signer_name} onDownload={pdf}
        doneNote="A sealed copy with both signatures and a signing certificate has been sent to the company. Download yours now: this link stops working in 30 days."
        sign={(signature, signed_name) => api('sign.link.sign', { token, signature, signed_name })}
        onSigned={() => api('sign.link.open', { token }).then(setC).catch(() => {})} />
    </Frame>
  );
}
