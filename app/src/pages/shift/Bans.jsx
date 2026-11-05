// The ejection log and ban register for a venue: the venue's own screen, and a tab on the manager's venue page
import { useState } from 'react';
import { Ban, Plus } from 'lucide-react';
import { useAuth } from '../../auth.jsx';
import { Button, Load, Page, Select, Tabs, useApi } from '../../ui/index.jsx';
import { BanList, BanSheet } from './_bans.jsx';

const TABS = [
  { value: 'ejection', label: 'Ejections' }, { value: 'current', label: 'Current bans' }, { value: 'lapsed', label: 'Ended' },
  { value: 'revoked', label: 'Lifted' }, { value: 'all', label: 'All bans' },
];

export function BanRegister({ venueId }) {
  const { user } = useAuth();
  const [tab, setTab] = useState('ejection');
  const [adding, setAdding] = useState(null); // 'ejection' | 'ban'
  const venues = useApi('venues.list', {}, { skip: user.role !== 'venue' || !!venueId });
  const [picked, setPicked] = useState('');
  const many = (venues.data?.length || 0) > 1;
  const target = venueId || picked || (many ? '' : venues.data?.[0]?.id);
  const ejections = tab === 'ejection';
  const q = useApi('bans.list', { venue_id: target || undefined, ...(ejections ? { kind: 'ejection' } : { status: tab }) });
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Tabs value={tab} onChange={setTab} tabs={TABS} />
        <div className="flex flex-wrap gap-2">
          {target && <Button size="sm" variant="soft" icon={Plus} onClick={() => setAdding('ejection')}>Log ejection</Button>}
          {target && <Button size="sm" variant="soft" icon={Ban} onClick={() => setAdding('ban')}>Ban someone</Button>}
        </div>
      </div>
      {many && !venueId && (
        <Select className="max-w-xs" value={picked} onChange={(e) => setPicked(e.target.value)} placeholder="All my venues"
          options={venues.data.map((v) => ({ value: v.id, label: v.name }))} />
      )}
      <Load q={q} skeleton="rows">
        {(rows) => (
          <BanList bans={rows} canConfirm canManage canEscalate directBan venueId={target} onChanged={q.reload}
            empty={ejections ? 'No ejections logged' : tab === 'current' ? 'Nobody is banned right now' : 'Nothing here'} />
        )}
      </Load>
      {adding && <BanSheet open venueId={target} banOnly={adding === 'ban'} onClose={() => setAdding(null)} onDone={() => { setAdding(null); q.reload(); }} />}
    </>
  );
}

export default function Bans() {
  return (
    <Page title="Ejection log" subtitle="Everyone ejected or refused entry, and who is banned. The door team sees bans on every shift.">
      <BanRegister />
    </Page>
  );
}
