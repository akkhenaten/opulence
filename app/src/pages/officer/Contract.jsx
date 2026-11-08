// Read and sign a contract or policy sent by the company
import { useParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { api, downloadAction } from '../../api.js';
import { Button, Load, Page, Pill, useAction, useApi } from '../../ui/index.jsx';
import SignFlow from './SignFlow.jsx';

const LABEL = { contract: 'Contract', policy: 'Policy' };
export const STATUS = { sent: ['To sign', 'amber'], signed: ['Signed', 'green'], void: ['Withdrawn', 'grey'], superseded: ['Replaced', 'grey'], signed_paper: ['Signed on paper', 'green'] };

export const contractFlow = (c) => ({
  kind: c.category || 'contract', status: c.status, reference: c.reference, company: c.company, pdfUrl: c.pdf_url || null,
  officer: c.signed_at ? { name: c.signed_name, png: c.signature, at: c.signed_at } : null,
  doc: {
    typeLabel: LABEL[c.category] || 'Contract', title: c.title, reference: c.reference, issuedAt: c.sent_at || c.created_at,
    version: c.template_version, officerName: c.officer_name, blocks: c.blocks, ack: c.ack,
    attachment: c.upload_pages ? { title: c.title, pages: c.upload_pages } : null,
  },
});

export default function Contract() {
  const { id } = useParams();
  const q = useApi('contracts.get', { id });
  const [run, busy] = useAction();
  const c = q.data;
  return (
    <Page title={LABEL[c?.category] || 'Contract'} back={{ to: '/officer/me', label: 'Me' }}
      actions={c && <>
        <Pill tone={STATUS[c.status]?.[1]}>{STATUS[c.status]?.[0]}</Pill>
        {c.status !== 'sent' && <Button variant="secondary" icon={Download} iconOnly="phone" busy={busy} onClick={() => run(() => downloadAction('contracts.pdf', { id })).catch(() => {})}>PDF</Button>}
      </>}>
      <Load q={q}>
        {(x) => <SignFlow d={contractFlow(x)} pdf={['contracts.pdf', { id }]} onSigned={q.reload}
          sign={(signature, signed_name) => api('contracts.sign', { id, signature, signed_name })} />}
      </Load>
    </Page>
  );
}
