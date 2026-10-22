import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, Button, Check, Empty, Input, Load, Pressable, SearchInput, Sheet, useAction, useApi } from '../../ui/index.jsx';
import { api } from '../../api.js';
import { ROLE_LABEL } from '../../layouts/nav.js';
import { messagesChanged, useBase } from './_parts.jsx';

/**
 * Choose people to message. One person opens (or reuses) a direct conversation; several make a group.
 * With `addTo` (a group conversation) the chosen people are added instead.
 */
export default function NewMessage({ open, onClose, addTo, exclude = [], onAdded }) {
  const people = useApi('messages.people', {}, { skip: !open });
  const [picked, setPicked] = useState([]);
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  const [run, busy] = useAction();
  const nav = useNavigate();
  const base = useBase();

  const close = () => { setPicked([]); setSearch(''); setTitle(''); onClose(); };
  const toggle = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const list = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (people.data || []).filter((p) => !exclude.includes(p.id) && (!s || `${p.name} ${p.venues} ${ROLE_LABEL[p.role]}`.toLowerCase().includes(s)));
  }, [people.data, search, exclude]);

  const go = () => run(async () => {
    if (addTo) {
      await api('messages.addMembers', { id: addTo, user_ids: picked });
      onAdded?.();
      return close();
    }
    const { id } = picked.length === 1
      ? await api('messages.startDirect', { user_id: picked[0] })
      : await api('messages.createGroup', { user_ids: picked, title });
    messagesChanged();
    close();
    nav(`${base}/${id}`);
  });

  const label = addTo ? `Add ${picked.length || ''}`.trim() : picked.length > 1 ? 'Start group' : 'Message';
  return (
    <Sheet open={open} onClose={close} title={addTo ? 'Add people' : 'New message'}
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button onClick={go} busy={busy} disabled={!picked.length}>{label}</Button></>}>
      <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search people, roles or venues" />
      {!addTo && picked.length > 1 && <Input className="mt-3" label="Group name (optional)" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Friday door team" maxLength={80} />}
      <div className="mt-3 -mx-1">
        <Load q={people} skeleton="rows">
          {() => (list.length ? list.map((p) => (
            <div key={p.id} className="flex items-center gap-2 pr-2">
              <Pressable onClick={() => toggle(p.id)} className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-2 py-2">
                <Avatar name={p.name} src={p.photo_url} size={40} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body font-semibold">{p.name}</div>
                  <div className="truncate text-footnote text-muted">{[ROLE_LABEL[p.role], p.venues].filter(Boolean).join(' · ')}</div>
                </div>
              </Pressable>
              <Check round checked={picked.includes(p.id)} onChange={() => toggle(p.id)} label={`Choose ${p.name}`} />
            </div>
          )) : <Empty title="No one found" body="Try a different name." />)}
        </Load>
      </div>
    </Sheet>
  );
}
