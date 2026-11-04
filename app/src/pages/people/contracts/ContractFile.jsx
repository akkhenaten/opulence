// Contract file: the agreement plus the report of what went into it, on screen and as one PDF
import { useState } from 'react';
import { Download } from 'lucide-react';
import { downloadAction } from '../../../api.js';
import { Button, Empty, List, Pill, Row, Sheet, Tabs, useAction } from '../../../ui/index.jsx';
import { DocPaper } from '../../../ui/DocPaper.jsx';
import ReviewList from './ReviewList.jsx';
import { JUR_SHORT, ORIGIN, StatePill } from './_shared.jsx';

const TABS = [
  { value: 'agreement', label: 'Agreement' }, { value: 'particulars', label: 'Particulars' }, { value: 'clauses', label: 'Clauses' },
  { value: 'outstanding', label: 'Outstanding' }, { value: 'findings', label: 'Findings' }, { value: 'changes', label: 'Changes' }, { value: 'supporting', label: 'Supporting' },
];

export default function ContractFile({ v, onClose }) {
  const [tab, setTab] = useState('agreement');
  const [run, busy] = useAction();
  const { draft, result, pack, party } = v;
  const ch = draft.changes;
  return (
    <Sheet open onClose={onClose} title="Contract file" size="lg"
      footer={<>
        <span className="mr-auto self-center text-footnote text-muted">{result.legal ? 'Every clause legally reviewed' : 'Draft pending legal review'}</span>
        <Button icon={Download} busy={busy} onClick={() => run(() => downloadAction('contracts.draft.bundle', { id: draft.id })).catch(() => {})}>Download bundle</Button>
      </>}>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'agreement' && (
        <DocPaper preview={result.legal} status={result.legal ? undefined : 'draft'} doc={{
          typeLabel: pack.doc_title, title: draft.title, reference: 'Given when sent', issuedAt: new Date(), officerName: party?.name, blocks: result.blocks,
        }} signers={{ company: null }} />
      )}
      {tab === 'particulars' && (
        <List>
          {result.particulars.map((p) => (
            <Row key={p.id} title={p.label} subtitle={p.value ?? (p.prefilled ? 'Prefilled, waiting for you to confirm' : 'To be confirmed')}
              right={p.confirmed ? <Pill tone="green">Confirmed</Pill> : <Pill tone="amber">Outstanding</Pill>} />
          ))}
        </List>
      )}
      {tab === 'clauses' && (
        <List>
          {result.manifest.map((m) => (
            <Row key={m.slot} title={m.title} subtitle={[ORIGIN[m.origin], m.version ? `${JUR_SHORT[m.jurisdiction] || 'All UK'} v${m.version}` : null].filter(Boolean).join(' · ')}
              right={<StatePill state={m.state} />} />
          ))}
        </List>
      )}
      {tab === 'outstanding' && (result.outstanding.length
        ? <List>{result.outstanding.map((o) => <Row key={o.id} title={o.label} subtitle={o.prefilled ? 'Prefilled, waiting for you to confirm' : 'Not answered yet'} />)}</List>
        : <Empty title="Nothing outstanding" body="Every value the document needs is confirmed." />)}
      {tab === 'findings' && <ReviewList findings={result.findings} readOnly />}
      {tab === 'changes' && (!ch || (!ch.values?.length && !ch.clauses?.length)
        ? <Empty title={draft.amends_contract_id ? 'No changes yet' : 'A new agreement'} body={draft.amends_contract_id ? 'Nothing differs from the signed contract.' : 'There is no earlier contract to compare with.'} />
        : (
          <List>
            {(ch.values || []).map((x) => <Row key={x.id} title={x.label} subtitle={`${x.was ?? 'not set'} → ${x.now ?? 'removed'}`} />)}
            {(ch.clauses || []).map((x) => <Row key={x.slot} title={(x.now || x.was).title} subtitle={x.change} />)}
          </List>
        ))}
      {tab === 'supporting' && (result.supporting.length
        ? <List>{result.supporting.map((s) => <Row key={s.title} title={s.title} right={s.contractual ? <Pill tone="blue">Forms part</Pill> : <Pill tone="grey">Not contractual</Pill>} />)}</List>
        : <Empty title="No supporting documents" />)}
    </Sheet>
  );
}
