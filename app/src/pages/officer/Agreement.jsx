// Read and sign a pay-rise agreement sent by the company
import { useParams } from 'react-router-dom';
import { Download } from 'lucide-react';
import { api, downloadAction } from '../../api.js';
import { Button, Load, Page, Pill, useAction, useApi } from '../../ui/index.jsx';
import SignFlow from './SignFlow.jsx';

const STATUS = { sent: ['To sign', 'amber'], signed: ['Signed', 'blue'], applied: ['In effect', 'green'], void: ['Withdrawn', 'grey'] };

const flow = (a) => ({
  kind: 'pay_rise', status: a.status === 'applied' ? 'signed' : a.status, reference: a.reference, company: a.company,
  officer: a.signed_at ? { name: a.signed_name, png: a.signature, at: a.signed_at } : null,
  doc: {
    typeLabel: 'Pay rise agreement', title: 'Pay rise agreement', reference: a.reference, issuedAt: a.sent_at || a.created_at,
    version: a.template_version, officerName: `${a.first_name} ${a.last_name}`, blocks: a.blocks, terms: a.terms,
  },
});

export default function Agreement() {
  const { id } = useParams();
  const q = useApi('payAgreements.get', { id });
  const [run, busy] = useAction();
  const a = q.data;
  return (
    <Page title="Pay rise" back={{ to: '/officer/me/growth', label: 'Goals' }}
      actions={a && <>
        <Pill tone={STATUS[a.status]?.[1]}>{STATUS[a.status]?.[0]}</Pill>
        {a.status !== 'sent' && <Button variant="secondary" icon={Download} iconOnly="phone" busy={busy} onClick={() => run(() => downloadAction('payAgreements.pdf', { id })).catch(() => {})}>PDF</Button>}
      </>}>
      <Load q={q}>
        {(x) => <SignFlow d={flow(x)} pdf={['payAgreements.pdf', { id }]} onSigned={q.reload}
          sign={(signature, signed_name) => api('payAgreements.sign', { id, signature, signed_name })} />}
      </Load>
    </Page>
  );
}
