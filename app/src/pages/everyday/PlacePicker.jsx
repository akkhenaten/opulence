import { useEffect, useState } from 'react';
import { Building2, MapPin } from 'lucide-react';
import { api } from '../../api.js';
import { Pressable, SearchInput, Sheet, Spinner } from '../../ui/index.jsx';

/** Tag a place: our venues first, then any named place (never a home address). */
export default function PlacePicker({ open, onClose, onPick }) {
  const [text, setText] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return undefined;
    let gone = false;
    setBusy(true);
    const t = setTimeout(() => {
      api('everyday.places', { q: text })
        .then((r) => { if (!gone) setRes(r); })
        .catch(() => { if (!gone) setRes((x) => x || { venues: [], places: [] }); })
        .finally(() => { if (!gone) setBusy(false); });
    }, text.trim().length >= 3 ? 450 : 150);
    return () => { gone = true; clearTimeout(t); };
  }, [text, open]);
  const Item = ({ p, icon: Icon, tone }) => (
    <Pressable press onClick={() => { onPick(p); onClose(); setText(''); }} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-bg">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${tone}`}><Icon size={18} /></span>
      <span className="min-w-0 flex-1"><span className="block truncate text-body font-medium">{p.name}</span>{p.address && <span className="block truncate text-caption text-muted">{p.address}</span>}</span>
    </Pressable>
  );
  return (
    <Sheet open={open} onClose={onClose} title="Where are you?">
      <SearchInput value={text} onChange={(e) => setText(e.target.value)} placeholder="Search a venue or place" autoFocus />
      <div className="mt-3 min-h-[200px]">
        {!res ? <Spinner /> : (
          <>
            {res.venues.length > 0 && <div className="px-2 pb-1 pt-2 text-footnote font-semibold uppercase tracking-wide text-muted">Our venues</div>}
            {res.venues.map((v) => <Item key={v.venue_id} p={v} icon={Building2} tone="bg-blue-soft text-blue" />)}
            {res.places.length > 0 && <div className="px-2 pb-1 pt-3 text-footnote font-semibold uppercase tracking-wide text-muted">Places</div>}
            {res.places.map((p, i) => <Item key={`${p.name}${i}`} p={p} icon={MapPin} tone="bg-red-soft text-red" />)}
            {busy && <p className="py-3 text-center text-footnote text-muted">Searching…</p>}
            {!busy && !res.venues.length && !res.places.length && (
              <p className="py-6 text-center text-subhead text-muted">{text.trim().length < 3 ? 'Type at least 3 letters to search places' : 'Nothing found. Try a name or a town.'}</p>
            )}
          </>
        )}
      </div>
    </Sheet>
  );
}
