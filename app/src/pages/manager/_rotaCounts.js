import { useApi } from '../../ui/index.jsx';

// A venue's date waits on us when it is new or a change to it was asked
export const coverWaiting = (c) => c.status === 'pending' || c.change_status === 'pending';

// Numbers on the Rota tab row, the same on every tab of it. A page that already loads one of the lists passes it in
export function useRotaCounts({ reqs, cover } = {}) {
  const ownReqs = useApi('shifts.pendingRequests', {}, { skip: !!reqs });
  const ownCover = useApi('cover.list', {}, { skip: !!cover });
  const r = reqs || ownReqs;
  const c = cover || ownCover;
  return {
    'Shift requests': r.data?.length,
    'Venue requests': (c.data || []).filter(coverWaiting).length,
  };
}
