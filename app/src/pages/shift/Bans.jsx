// The ejection log and ban register for a venue: the venue's own screen, and a tab on the manager's venue page
import { useEffect, useState } from 'react';
import { Ban, Download, Plus } from 'lucide-react';
import { downloadAction } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useVenue } from '../../venue.jsx';
import { Button, Load, MoreMenu, Page, Segmented, Select, Tabs, ToolField, ToolMenu, useApi, useMedia } from '../../ui/index.jsx';
import { BanList, BanSheet } from './_bans.jsx';

const TABS = [
  { value: 'ejection', label: 'Ejections' }, { value: 'current', label: 'Current bans' }, { value: 'lapsed', label: 'Ended' },
  { value: 'revoked', label: 'Lifted' }, { value: 'all', label: 'All bans' },
];

// `all`: a manager's register across every venue they cover, with a venue filter (Incidents → Ejections register)
// `page`: Page props, to draw it as a whole page with its switches on the tab line
export function BanRegister({ venueId, all, onFilter, page }) {
  const { user } = useAuth();
  const wide = useMedia('(min-width: 640px)');
  const [tab, setTab] = useState('ejection');
  const [adding, setAdding] = useState(null); // 'ejection' | 'ban'
  // A venue manager's own venues and their chosen one come from the home tiles / top-bar chip; a manager picks here
  const venue = useVenue();
  const [picked, setPicked] = useState('');
  const vq = useApi('venues.list', {}, { skip: !all });
  const ownVenues = all ? (vq.data || []).filter((v) => v.active !== false) : venue.venues;
  const chosen = all ? picked : venue.venueId;
  const setVenueId = all ? setPicked : venue.setVenueId;
  const many = all ? ownVenues.length > 1 : venue.many;
  const mine = (user.role === 'venue' || all) && !venueId;
  const target = venueId || chosen || (mine && !many ? ownVenues[0]?.id : '');
  const ejections = tab === 'ejection';
  const body = { venue_id: target || undefined, ...(ejections ? { kind: 'ejection' } : { status: tab }) };
  const q = useApi('bans.list', body);
  const key = JSON.stringify(body);
  useEffect(() => { onFilter?.(JSON.parse(key)); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = (target || mine) && <>
    <Button size="sm" variant="soft" icon={Plus} iconOnly="phone" onClick={() => setAdding('ejection')}>Log ejection</Button>
    <Button size="sm" variant="soft" icon={Ban} iconOnly="phone" onClick={() => setAdding('ban')}>Ban someone</Button>
  </>;
  const tabs = <Segmented value={tab} onChange={setTab} options={TABS} />;
  const venuePick = mine && many && (
    <Select aria-label="Venue" value={chosen} onChange={(e) => setVenueId(e.target.value)} placeholder={all ? 'All venues' : 'All my venues'}
      options={ownVenues.map((v) => ({ value: v.id, label: v.name }))} />
  );
  const list = <>
    <Load q={q} skeleton="rows">
      {(rows) => (
        <BanList bans={rows} canConfirm canManage canEscalate directBan venueId={target} onChanged={q.reload}
          empty={ejections ? 'No ejections logged' : tab === 'current' ? 'Nobody is banned right now' : 'Nothing here'} />
      )}
    </Load>
    {adding && <BanSheet open venueId={target} venues={mine ? ownVenues : undefined} banOnly={adding === 'ban'} onClose={() => setAdding(null)} onDone={() => { setAdding(null); q.reload(); }} />}
  </>;
  // As a page: the tabs and venue sit on the tab line (venue under Filters on phones), the add buttons beside the title
  if (page) {
    return (
      <Page {...page} actions={<>{add}{page.actions}</>} tools={<>
        {tabs}
        {venuePick && <div className="hidden w-48 sm:block">{venuePick}</div>}
        {venuePick && !wide && <ToolMenu count={all && chosen ? 1 : 0} onClear={() => setVenueId('')}><ToolField label="Venue">{venuePick}</ToolField></ToolMenu>}
      </>}>
        {list}
      </Page>
    );
  }
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Tabs value={tab} onChange={setTab} tabs={TABS} />
        <div className="flex flex-wrap gap-2">{add}</div>
      </div>
      {venuePick && <div className="max-w-xs">{venuePick}</div>}
      {list}
    </>
  );
}

/** Managers: every ejection and refusal across their venues, a tab of Incidents */
export function Ejections() {
  const [body, setBody] = useState({});
  return (
    <BanRegister all onFilter={setBody} page={{
      title: 'Ejections register', subtitle: 'Everyone ejected or refused entry at your venues, newest first, and who is banned.',
      actions: <MoreMenu items={[{ icon: Download, label: 'Export to spreadsheet', hint: 'This list, as CSV', onClick: () => downloadAction('bans.exportCsv', body).catch(() => {}) }]} />,
    }} />
  );
}

export default function Bans() {
  return (
    <BanRegister page={{ title: 'Ejection log', subtitle: 'Everyone ejected or refused entry, and who is banned. The door team sees bans on every shift.' }} />
  );
}
