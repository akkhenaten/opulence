import { Building2, ChevronRight, MapPin, NotebookPen, Phone, ShieldCheck, UsersRound } from 'lucide-react';
import { Avatar, Empty, List, Load, Page, Pressable, Row, Section, Tile, useApi } from '../../ui/index.jsx';
import { useVenue } from '../../venue.jsx';
import { DocumentsTab } from '../money/VenueDetail.jsx';
import { ClientPack } from './SitePack.jsx';

/** The venue manager's read-only view of their site: details, instructions, who to contact and shared documents. */
export default function Site() {
  const venues = useApi('venues.list', {});
  // With several venues the one chosen on the home tiles / top-bar chip shows; under "All venues" they pick one here
  const { venueId, setVenueId } = useVenue();
  return (
    <Load q={venues} skeleton="page">
      {(all) => {
        const list = all.filter((v) => v.active !== false);
        if (!list.length) return <Page title="My venue"><Empty icon={Building2} title="No venue linked" body="Ask the security company to give you access to your venue." /></Page>;
        const id = list.length === 1 ? list[0].id : venueId;
        if (!id) {
          return (
            <Page title="My venues" subtitle="Choose a venue to see its details, site pack and documents">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {list.map((v) => (
                  <Pressable key={v.id} card onClick={() => setVenueId(v.id)}
                    className="ui-panel flex items-center gap-3 rounded-tile border border-hairline bg-surface p-[var(--pad-tile)] shadow-tile">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-soft text-blue"><Building2 size={20} /></div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-callout font-bold">{v.name}</div>
                      <div className="truncate text-footnote text-muted">{[v.address, v.postcode].filter(Boolean).join(', ') || 'No address'}</div>
                    </div>
                    <ChevronRight size={18} className="shrink-0 text-faint" />
                  </Pressable>
                ))}
              </div>
            </Page>
          );
        }
        return (
          <Page title="My venue" subtitle="Details the security company keeps for your site">
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
          {v.instructions && (
            <Tile title="Short note for officers" icon={NotebookPen}>
              <p className="whitespace-pre-wrap text-body text-muted">{v.instructions}</p>
            </Tile>
          )}
          <Section title="Your security managers" icon={ShieldCheck} count={v.security.length} className="mt-0">
            {v.security.length ? (
              <List>{v.security.map((u) => <Row key={u.id} left={<Avatar name={u.name} size={38} />} title={u.name} subtitle={[u.phone, u.email].filter(Boolean).join(' · ')} />)}</List>
            ) : <Empty title="No one assigned yet" body="The company office looks after your venue." />}
          </Section>
          <Section title="Venue managers" icon={UsersRound} count={v.contacts.length} className="mt-0">
            <List>{v.contacts.map((u) => <Row key={u.id} left={<Avatar name={u.name} size={38} />} title={u.name} subtitle={u.email} />)}</List>
          </Section>
          <div className="lg:col-span-2"><ClientPack venueId={v.id} /></div>
          <div className="lg:col-span-2"><DocumentsTab venueId={v.id} readOnly /></div>
        </div>
      )}
    </Load>
  );
}
