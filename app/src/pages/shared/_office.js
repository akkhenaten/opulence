import { useNavigate } from 'react-router-dom';
import { api } from '../../api.js';
import { useAction } from '../../ui/index.jsx';

/** Opens a venue's chat with the office, with an optional first line ready in the box (the composer keeps drafts per chat) */
export function useOfficeChat(base = '/venue') {
  const nav = useNavigate();
  const [run, busy] = useAction();
  const open = (venueId, text = '') => run(async () => {
    const { id } = await api('messages.office', { venue_id: venueId });
    if (text && !sessionStorage.getItem(`orb:msg:${id}`)) sessionStorage.setItem(`orb:msg:${id}`, text);
    nav(`${base}/messages/${id}`);
  }).catch(() => {});
  return [open, busy];
}
