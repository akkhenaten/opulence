import { Mail, SquarePen } from 'lucide-react';
import { Button, List, Pressable, Section, useApi } from '../../ui/index.jsx';
import { BASE, whenLabel } from './_parts.jsx';

/** "Recent email" on a staff, venue or client page, from the mailboxes this person can use. Hidden when they have none. */
export default function RecentEmail({ type, id, className }) {
  const q = useApi('email.forRecord', { type, id });
  const d = q.data;
  if (!d?.connected) return null;
  const to = d.addrs?.[0];
  return (
    <Section title="Recent email" icon={Mail} className={className}
      action={to && <Button size="sm" variant="link" icon={SquarePen} to={`${BASE}?compose=1&to=${encodeURIComponent(to)}`}>Write</Button>}>
      {d.threads.length ? (
        <List>
          {d.threads.slice(0, 8).map((t) => (
            <Pressable key={`${t.account_id}/${t.id}`} to={`${BASE}/${t.account_id}/${t.id}`} className="block px-4 py-2.5">
              <div className="flex items-baseline gap-2">
                <span className={t.unread ? 'min-w-0 flex-1 truncate text-body font-bold' : 'min-w-0 flex-1 truncate text-body font-semibold'}>{t.subject || '(no subject)'}</span>
                <span className="shrink-0 text-caption text-faint">{whenLabel(t.last_at)}</span>
              </div>
              <div className="truncate text-footnote text-muted">{t.from_name || t.from_addr}: {t.snippet}</div>
            </Pressable>
          ))}
        </List>
      ) : (
        <div className="flex items-center gap-2 rounded-tile border border-dashed border-line px-4 py-3 text-subhead text-muted">
          <Mail size={16} className="shrink-0" />{d.addrs?.length ? 'No recent email with them in your connected mailboxes.' : 'No email address on file.'}
        </div>
      )}
    </Section>
  );
}
