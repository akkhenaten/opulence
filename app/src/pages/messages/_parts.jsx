import { Banknote, CalendarDays, Megaphone, Sparkles } from 'lucide-react';
import { HOME, useAuth } from '../../auth.jsx';
import { Avatar, cx, dateShort, isoDate, time, weekday } from '../../ui/index.jsx';

export const useBase = () => `${HOME[useAuth().user.role]}/messages`;

// Tells the Shell to refresh the unread badge
export const messagesChanged = () => window.dispatchEvent(new Event('orb:messages'));

const KIND_ICON = { ops: Sparkles, cover: Megaphone, shift: CalendarDays, pay: Banknote };

// Picture for a conversation: an icon for automatic threads, the person for direct messages, stacked faces for groups
export function ConvAvatar({ c, others = c.others || [], size = 44 }) {
  const Icon = KIND_ICON[c.kind];
  if (Icon) return <div className={cx('grid shrink-0 place-items-center rounded-full', c.kind === 'ops' ? 'bg-blue text-white' : 'bg-blue-soft text-blue')} style={{ width: size, height: size }}><Icon size={size >= 40 ? 20 : 18} /></div>;
  if (c.kind === 'group' && others.length > 1) {
    const s = Math.round(size * 0.68);
    return (
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <Avatar name={others[0].name} src={others[0].photo_url} size={s} className="absolute left-0 top-0" />
        <Avatar name={others[1].name} src={others[1].photo_url} size={s} className="absolute bottom-0 right-0 ring-2 ring-surface" />
      </div>
    );
  }
  return <Avatar name={others[0]?.name || c.title} src={others[0]?.photo_url} size={size} />;
}

// 14:05 today, Tue this week, 3 Oct before that
export function whenLabel(d) {
  if (!d) return '';
  if (isoDate(d) === isoDate()) return time(d);
  if (Date.now() - new Date(d) < 6 * 86400000) return weekday(d);
  return dateShort(d);
}

export const isImage = (a) => /^image\//.test(a.mime || '') || /\.(jpe?g|png|gif|webp|heic)$/i.test(a.name || '');
