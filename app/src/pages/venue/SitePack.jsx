// The client's view of their venue's site pack: what officers sign, who has signed, and a way to suggest changes
import { useState } from 'react';
import { ArrowLeft, BookOpenCheck, BookText, CircleCheck, MessageSquarePlus, PenLine, UsersRound } from 'lucide-react';
import { api } from '../../api.js';
import { Button, Chip, date, Empty, Input, List, Load, Pill, Row, Section, Sheet, Textarea, useAction, useApi } from '../../ui/index.jsx';
import { docKind, PackPaper } from '../shared/PackPaper.jsx';
import { Register } from '../money/VenuePackTab.jsx';

export function ClientPack({ venueId }) {
  const q = useApi('venuePacks.get', { venue_id: venueId });
  const [open, setOpen] = useState(null);
  const [suggest, setSuggest] = useState(null);
  return (
    <Load q={q} skeleton="rows">
      {(d) => {
        const doc = open && d.pack.find((x) => x.procedure_id === open);
        return (
          <div className="space-y-6">
            <Section className="mt-0" title="Instructions and procedures officers sign" icon={BookOpenCheck} count={d.pack.length}>
              {doc ? (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={() => setOpen(null)}>All documents</Button>
                    <Button size="sm" variant="secondary" icon={MessageSquarePlus} onClick={() => setSuggest(doc)}>Suggest a change</Button>
                  </div>
                  <PackPaper doc={doc} />
                </div>
              ) : d.pack.length ? (
                <>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <Chip value={d.counts.booked} label="officers booked" icon={UsersRound} compact="phone" />
                    <Chip value={d.counts.ok} label="signed and up to date" tone={d.counts.ok ? 'green' : 'grey'} icon={CircleCheck} compact="phone" />
                    {d.counts.action > 0 && <Chip value={d.counts.action} label="still to sign" tone="amber" icon={PenLine} compact="phone" />}
                  </div>
                  <List>
                    {d.pack.map((x) => (
                      <Row key={x.procedure_id} onClick={() => setOpen(x.procedure_id)} left={<BookText size={18} className="text-muted" />} title={x.title}
                        subtitle={`${docKind(x)} · version ${x.version} · ${date(x.published_at)}`} chevron />
                    ))}
                  </List>
                  <p className="mt-1.5 px-1 text-caption text-faint">Every officer reads and signs these before their first shift here, and again after an important change. Only the security company can change them; you can suggest changes.</p>
                </>
              ) : <Empty icon={BookText} title="Nothing published yet" body="The security company is preparing the instructions for your site." />}
            </Section>
            {d.pack.length > 0 && <Register venueId={venueId} />}
            <MySuggestions venueId={venueId} key={suggest ? 'open' : 'closed'} />
            {suggest && <SuggestSheet doc={suggest} venueId={venueId} onClose={() => setSuggest(null)} />}
          </div>
        );
      }}
    </Load>
  );
}

function SuggestSheet({ doc, venueId, onClose }) {
  const [section, setSection] = useState('');
  const [body, setBody] = useState('');
  const [run, busy] = useAction();
  const send = () => run(() => api('venuePacks.suggest', { procedure_id: doc.procedure_id, venue_id: venueId, section, body }), 'Sent to the security company').then(onClose).catch(() => {});
  return (
    <Sheet open onClose={onClose} title={`Suggest a change: ${doc.title}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!body.trim()} onClick={send}>Send</Button></>}>
      <div className="space-y-4">
        <Input label="Which part (optional)" placeholder="e.g. 4. Fire and evacuation" value={section} onChange={(e) => setSection(e.target.value)} maxLength={200} />
        <Textarea label="What should change" rows={5} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} />
        <p className="text-footnote text-muted">The security company reviews it. If they change the document, officers are asked to read and sign the new version.</p>
      </div>
    </Sheet>
  );
}

function MySuggestions({ venueId }) {
  const q = useApi('venuePacks.suggestions', { venue_id: venueId });
  const rows = q.data?.suggestions || [];
  if (!rows.length) return null;
  const label = { open: 'With the company', accepted: 'Accepted', dismissed: 'Not taken forward' };
  return (
    <Section title="Your suggestions" icon={MessageSquarePlus} count={rows.length}>
      <List>
        {rows.map((s) => (
          <Row key={s.id} title={s.procedure_title} subtitle={`${date(s.created_at)} · ${s.body}${s.reply ? ` · Reply: ${s.reply}` : ''}`}
            right={<Pill tone={s.status === 'accepted' ? 'green' : s.status === 'open' ? 'blue' : 'grey'}>{label[s.status]}</Pill>} />
        ))}
      </List>
    </Section>
  );
}
