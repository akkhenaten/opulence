// Signed shift logs for a venue: the venue's own screen, and a tab on the manager's venue page
import { NotebookPen } from 'lucide-react';
import { useAuth } from '../../auth.jsx';
import { useVenue } from '../../venue.jsx';
import { dayLabel, Empty, List, Load, Page, Pill, range, Row, useApi } from '../../ui/index.jsx';

export function ShiftLogList({ venueId: fixed }) {
  const { user } = useAuth();
  const { venueId: chosen, many } = useVenue();
  const venueId = fixed || chosen;
  // Under "All venues" each row says which venue it was
  const named = many && !venueId;
  const q = useApi('shiftlog.list', { venue_id: venueId || undefined });
  const link = (id) => (user.role === 'venue' ? `/venue/logs/${id}` : `/${user.role}/shifts/${id}`);
  return (
    <Load q={q} skeleton="rows">{(rows) => (!rows.length ? (
      <Empty icon={NotebookPen} title="No shift logs yet" body="When the shift lead signs off a shift, the log and the handover appear here." />
    ) : (
      <List>
        {rows.map((r) => (
          <Row key={r.shift_id} to={link(r.shift_id)} chevron
            title={<>{dayLabel(r.starts_at)} <span className="num font-normal text-muted">{range(r.starts_at, r.ends_at)}</span></>}
            subtitle={`${named ? `${r.venue_name} · ` : ''}${r.handover_summary || `${r.entries} entr${r.entries === 1 ? 'y' : 'ies'}${r.signed_by_name ? ` · signed by ${r.signed_by_name}` : ''}`}`}
            right={(
              <div className="flex flex-col items-end gap-1">
                <Pill tone={r.status === 'signed' ? 'green' : 'grey'}>{r.status === 'signed' ? 'Signed' : 'Open'}</Pill>
                {(r.incidents > 0 || r.ejections > 0 || r.bans > 0) && <span className="text-caption text-muted">{[r.incidents && `${r.incidents} incident${r.incidents > 1 ? 's' : ''}`, r.ejections && `${r.ejections} ejection${r.ejections > 1 ? 's' : ''}`, r.bans && `${r.bans} ban${r.bans > 1 ? 's' : ''}`].filter(Boolean).join(' · ')}</span>}
              </div>
            )} />
        ))}
      </List>
    ))}</Load>
  );
}

export default function ShiftLogs() {
  return (
    <Page title="Shift logs" subtitle="What happened on each shift, signed off by the shift lead">
      <ShiftLogList />
    </Page>
  );
}
