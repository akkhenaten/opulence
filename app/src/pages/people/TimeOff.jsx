import { useMemo, useState } from 'react';
import { CalendarOff, Plus } from 'lucide-react';
import { Bento, Button, Empty, List, Load, Page, Section, Segmented, Stat, Tile, addDays, isoDate, useApi } from '../../ui/index.jsx';
import { TIMEOFF_KINDS } from './_parts.jsx';
import { TimeOffRow, TimeOffSheet } from './_profileTabs.jsx';

export default function TimeOff() {
  const today = isoDate();
  const q = useApi('timeoff.list', { from: addDays(today, -60) });
  const officers = useApi('officers.list');
  const [kind, setKind] = useState('all');
  const [adding, setAdding] = useState(false);

  const groups = useMemo(() => {
    const all = (q.data || []).filter((t) => kind === 'all' || t.kind === kind);
    const byStart = (a, b) => a.start_date.localeCompare(b.start_date);
    return {
      pending: all.filter((t) => t.status === 'pending').sort(byStart),
      now: all.filter((t) => t.status === 'approved' && t.start_date <= today && t.end_date >= today).sort(byStart),
      upcoming: all.filter((t) => t.status === 'approved' && t.start_date > today).sort(byStart),
      past: all.filter((t) => t.end_date < today || ['rejected', 'cancelled'].includes(t.status)).filter((t) => t.status !== 'pending'),
    };
  }, [q.data, kind, today]);
  const all = q.data || [];
  const in14 = all.filter((t) => t.status === 'approved' && t.start_date > today && t.start_date <= addDays(today, 14)).length;
  const sickNow = all.filter((t) => t.status === 'approved' && t.kind === 'sick' && t.start_date <= today && t.end_date >= today).length;

  return (
    <Page title="Time off" subtitle="Holidays, sickness and unavailability"
      actions={<Button icon={Plus} onClick={() => setAdding(true)}>Add for officer</Button>}>
      <Load q={q}>
        {() => (
          <>
            <Bento className="mb-5">
              <Tile tone={groups.pending.length ? 'blue' : undefined}><Stat value={all.filter((t) => t.status === 'pending').length} label="To decide" hint="Pending requests" /></Tile>
              <Tile><Stat value={all.filter((t) => t.status === 'approved' && t.start_date <= today && t.end_date >= today).length} label="Off today" /></Tile>
              <Tile><Stat value={sickNow} label="Off sick" tone={sickNow ? 'red' : undefined} /></Tile>
              <Tile><Stat value={in14} label="Starting soon" hint="Next 14 days" /></Tile>
            </Bento>
            <Segmented value={kind} onChange={setKind} options={[{ value: 'all', label: 'All' }, ...TIMEOFF_KINDS.map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) }))]} />
            <Block title="Pending" rows={groups.pending} onDone={q.reload} empty="No requests waiting" />
            <Block title="Off now" rows={groups.now} onDone={q.reload} />
            <Block title="Upcoming" rows={groups.upcoming} onDone={q.reload} empty="Nothing approved ahead" />
            <Block title="Recent" rows={groups.past.slice(0, 30)} onDone={q.reload} />
          </>
        )}
      </Load>
      {adding && <TimeOffSheet officers={(officers.data || []).filter((o) => o.status !== 'left')} onClose={() => setAdding(false)} onDone={q.reload} />}
    </Page>
  );
}

function Block({ title, rows, onDone, empty }) {
  if (!rows.length && !empty) return null;
  return (
    <Section title={`${title} · ${rows.length}`}>
      {rows.length ? <List>{rows.map((t) => <TimeOffRow key={t.id} t={t} onDone={onDone} showName />)}</List>
        : <Empty icon={CalendarOff} title={empty} />}
    </Section>
  );
}
