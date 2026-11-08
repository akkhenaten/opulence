// The ejection log and ban register for a venue: the venue's own screen, and a tab on the manager's venue page
import { useEffect, useState } from 'react';
import { Ban, Download, Plus } from 'lucide-react';
import { downloadAction } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useVenue } from '../../venue.jsx';
import { Button, Load, MoreMenu, Page, Select, Tabs, useApi } from '../../ui/index.jsx';
import { BanList, BanSheet } from './_bans.jsx';

const TABS = [
  { value: 'ejection', label: 'Ejections' }, { value: 'current', label: 'Current bans' }, { value: 'lapsed', label: 'Ended' },
  { value: 'revoked', label: 'Lifted' }, { value: 'all', label: 'All bans' },
];

// `all`: a manager's register across every venue they cover, with a venue filter (Incidents → Ejections register)
export function BanRegister({ venueId, all, onFilter }) {
  const { user } = useAuth();
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
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Tabs value={tab} onChange={setTab} tabs={TABS} />
        <div className="flex flex-wrap gap-2">
          {(target || mine) && <Button size="sm" variant="soft" icon={Plus} onClick={() => setAdding('ejection')}>Log ejection</Button>}
          {(target || mine) && <Button size="sm" variant="soft" icon={Ban} onClick={() => setAdding('ban')}>Ban someone</Button>}
        </div>
      </div>
      {mine && many && (
        <Select className="max-w-xs" value={chosen} onChange={(e) => setVenueId(e.target.value)} placeholder={all ? 'All venues' : 'All my venues'}
          options={ownVenues.map((v) => ({ value: v.id, label: v.name }))} />
      )}
      <Load q={q} skeleton="rows">
        {(rows) => (
          <BanList bans={rows} canConfirm canManage canEscalate directBan venueId={target} onChanged={q.reload}
            empty={ejections ? 'No ejections logged' : tab === 'current' ? 'Nobody is banned right now' : 'Nothing here'} />
        )}
      </Load>
      {adding && <BanSheet open venueId={target} venues={mine ? ownVenues : undefined} banOnly={adding === 'ban'} onClose={() => setAdding(null)} onDone={() => { setAdding(null); q.reload(); }} />}
    </>
  );
}

/** Managers: every ejection and refusal across their venues, a tab of Incidents */
export function Ejections() {
  const [body, setBody] = useState({});
  return (
    <Page title="Ejections register" subtitle="Everyone ejected or refused entry at your venues, newest first, and who is banned."
      actions={<MoreMenu items={[{ icon: Download, label: 'Export to spreadsheet', hint: 'This list, as CSV', onClick: () => downloadAction('bans.exportCsv', body).catch(() => {}) }]} />}>
      <BanRegister all onFilter={setBody} />
    </Page>
  );
}

export default function Bans() {
  return (
    <Page title="Ejection log" subtitle="Everyone ejected or refused entry, and who is banned. The door team sees bans on every shift.">
      <BanRegister />
    </Page>
  );
}
