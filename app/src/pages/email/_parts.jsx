import { Link } from 'react-router-dom';
import { Archive, Briefcase, Building2, Inbox, PencilLine, Send, Trash2, UserRound, Users } from 'lucide-react';
import { api } from '../../api.js';
import { cx } from '../../ui/index.jsx';

export { whenLabel } from '../messages/_parts.jsx';

export const BASE = '/company/email';
export const PROVIDER_NAME = { google: 'Gmail / Google Workspace', microsoft: 'Outlook / Microsoft 365' };
export const PROVIDER_SHORT = { google: 'Google', microsoft: 'Microsoft' };
export const FOLDERS = [
  { value: 'inbox', label: 'Inbox', icon: Inbox }, { value: 'sent', label: 'Sent', icon: Send }, { value: 'drafts', label: 'Drafts', icon: PencilLine },
  { value: 'archive', label: 'Archive', icon: Archive }, { value: 'trash', label: 'Bin', icon: Trash2 },
];

// Tells the Shell to refresh the unread badge
export const emailChanged = () => window.dispatchEvent(new Event('orb:email'));

// Off to Google / Microsoft to sign in; they send the person back to /company/email/callback
export async function connect(provider, { shared, account_id } = {}) {
  const { url } = await api('email.connectStart', { provider, shared: !!shared, account_id, origin: window.location.origin });
  window.location.assign(url);
}

// The last mailbox opened, so the inbox comes back to it
const LAST = 'orb.email.account';
export const lastAccount = () => localStorage.getItem(LAST);
export const rememberAccount = (id) => (id ? localStorage.setItem(LAST, id) : localStorage.removeItem(LAST));

const MATCH = {
  officer: { icon: UserRound, cls: 'bg-blue-soft text-blue' },
  venue: { icon: Building2, cls: 'bg-green-soft text-green' },
  client: { icon: Briefcase, cls: 'bg-amber-soft text-amber' },
  team: { icon: Users, cls: 'bg-fill text-muted' },
};

/** Who on the thread we know: officers, venue contacts, clients, our own team. */
export function MatchChips({ matches = [], max = 3, link = true, className }) {
  if (!matches.length) return null;
  const shown = matches.slice(0, max);
  return (
    <div className={cx('flex flex-wrap gap-1', className)}>
      {shown.map((m) => {
        const { icon: Icon, cls } = MATCH[m.type] || MATCH.team;
        const inner = <><Icon size={14} className="shrink-0" /><span className="truncate">{m.label}</span></>;
        const c = cx('inline-flex max-w-[180px] items-center gap-1 rounded-full px-2 py-0.5 text-caption font-semibold', cls);
        return link && m.link
          ? <Link key={m.type + m.id} to={m.link} className={cx(c, 'pressable')} title={m.person ? `${m.person}, ${m.label}` : m.label}>{inner}</Link>
          : <span key={m.type + m.id} className={c} title={m.person ? `${m.person}, ${m.label}` : m.label}>{inner}</span>;
      })}
      {matches.length > max && <span className="px-1 text-caption font-semibold text-faint">+{matches.length - max}</span>}
    </div>
  );
}

export const addrLabel = (a) => (a ? a.name || a.email : '');
export const addrFull = (a) => (a ? (a.name ? `${a.name} <${a.email}>` : a.email) : '');
export const sizeLabel = (n) => (!n ? '' : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`);
