// The ban register for a venue: the venue's own screen, and a tab on the manager's venue page
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useAuth } from '../../auth.jsx';
import { Button, Load, Page, Tabs, useApi } from '../../ui/index.jsx';
import { BanList, BanSheet } from './_bans.jsx';

export function BanRegister({ venueId }) {
  const { user } = useAuth();
  const [status, setStatus] = useState('current');
  const [adding, setAdding] = useState(false);
  const q = useApi('bans.list', { venue_id: venueId || undefined, status });
  const venues = useApi('venues.list', {}, { skip: user.role !== 'venue' || !!venueId });
  const target = venueId || venues.data?.[0]?.id;
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <Tabs value={status} onChange={setStatus} tabs={[{ value: 'current', label: 'Current' }, { value: 'lapsed', label: 'Ended' }, { value: 'revoked', label: 'Lifted' }, { value: 'all', label: 'All' }]} />
        {target && <Button size="sm" variant="soft" icon={Plus} onClick={() => setAdding(true)}>Ban someone</Button>}
      </div>
      <Load q={q} skeleton="rows">{(rows) => <BanList bans={rows} canConfirm canManage onChanged={q.reload} empty={status === 'current' ? 'Nobody is banned right now' : 'Nothing here'} />}</Load>
      {adding && <BanSheet open venueId={target} onClose={() => setAdding(false)} onDone={() => { setAdding(false); q.reload(); }} />}
    </>
  );
}

export default function Bans() {
  return (
    <Page title="Bans" subtitle="People barred from your venue. The door team sees this on every shift.">
      <BanRegister />
    </Page>
  );
}
