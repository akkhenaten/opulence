import { useState } from 'react';
import { Building2, MapPin, Phone } from 'lucide-react';
import { Avatar, Empty, List, Load, Page, Row, Section, Segmented, Tile, useApi } from '../../ui/index.jsx';
import { DocumentsTab } from '../money/VenueDetail.jsx';

/** The venue manager's read-only view of their site: details, instructions, who to contact and shared documents. */
export default function Site() {
  const venues = useApi('venues.list', {});
  const [pick, setPick] = useState(null);
  return (
    <Load q={venues} skeleton="page">
      {(list) => {
        if (!list.length) return <Page title="My venue"><Empty icon={Building2} title="No venue linked" body="Ask the security company to give you access to your venue." /></Page>;
        const id = pick || list[0].id;
        return (
          <Page title="My venue" subtitle="Details the security company keeps for your site">
            {list.length > 1 && <div className="mb-4"><Segmented value={id} onChange={setPick} options={list.map((v) => ({ value: v.id, label: v.name }))} /></div>}
            <VenueView key={id} id={id} />
          </Page>
        );
      }}
    </Load>
  );
}

function VenueView({ id }) {
  const q = useApi('venues.get', { id });
  return (
    <Load q={q} skeleton="rows">
      {(v) => (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Tile tone="soft">
            <div className="flex items-start gap-4">
              {v.photo_url
                ? <img src={v.photo_url} alt="" className="h-14 w-14 shrink-0 rounded-2xl object-cover" />
                : <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-paper text-blue"><Building2 size={26} /></div>}
              <div className="min-w-0">
                <div className="truncate text-title3 font-bold">{v.name}</div>
                <div className="mt-1 flex items-start gap-1.5 text-subhead text-muted"><MapPin size={16} className="mt-0.5 shrink-0" /><span className="min-w-0">{[v.address, v.postcode].filter(Boolean).join(', ') || 'No address'}</span></div>
                {v.phone && <a href={`tel:${v.phone}`} className="mt-1 flex items-center gap-1.5 text-subhead font-semibold text-blue"><Phone size={14} />{v.phone}</a>}
              </div>
            </div>
          </Tile>
          <Tile title="Instructions for officers">
            <p className="whitespace-pre-wrap text-body text-muted">{v.instructions || 'No instructions yet. Message the security company to add them.'}</p>
          </Tile>
          <Section title="Your security managers" className="mt-0">
            {v.security.length ? (
              <List>{v.security.map((u) => <Row key={u.id} left={<Avatar name={u.name} size={38} />} title={u.name} subtitle={[u.phone, u.email].filter(Boolean).join(' · ')} />)}</List>
            ) : <Empty title="No one assigned yet" body="The company office looks after your venue." />}
          </Section>
          <Section title="Venue managers" className="mt-0">
            <List>{v.contacts.map((u) => <Row key={u.id} left={<Avatar name={u.name} size={38} />} title={u.name} subtitle={u.email} />)}</List>
          </Section>
          <div className="lg:col-span-2"><DocumentsTab venueId={v.id} readOnly /></div>
        </div>
      )}
    </Load>
  );
}
