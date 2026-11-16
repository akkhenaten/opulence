import { useApi } from '../../ui/index.jsx';

// A venue's date waits on us when it is new or a change to it was asked
export const coverWaiting = (c) => c.status === 'pending' || c.change_status === 'pending';

// Numbers on the Rota tab row, the same on every tab of it. A page that already loads one of the lists passes it in
// A venue's Rota has one: its own requests waiting on the office
export function useRotaCounts({ reqs, cover, venue } = {}) {
  const ownReqs = useApi('shifts.pendingRequests', {}, { skip: !!reqs || venue });
  const ownCover = useApi('cover.list', {}, { skip: !!cover });
  const r = reqs || ownReqs;
  const c = cover || ownCover;
  if (venue) return { Requests: (c.data || []).filter(coverWaiting).length };
  return {
    'Shift requests': r.data?.length,
    'Venue requests': (c.data || []).filter(coverWaiting).length,
  };
}
