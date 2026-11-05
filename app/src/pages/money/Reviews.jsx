// Client reviews for the public website. Venue managers and company managers add what a client said;
// a venue manager's review waits here as Pending until a company manager publishes it.
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, EyeOff, Globe, Pencil, Plus, Quote, Star, Trash2 } from 'lucide-react';
import { api } from '../../api.js';
import {
  Button, cx, Empty, IconButton, Input, Load, Page, Pill, Pressable, SearchInput, Segmented, Select, Sheet, Textarea, Tile,
  date, useAction, useApi, useConfirm, useForm,
} from '../../ui/index.jsx';
import { useAuth } from '../../auth.jsx';

const STATUS = { published: { tone: 'green', label: 'On the website' }, pending: { tone: 'amber', label: 'Waiting for approval' }, hidden: { tone: 'grey', label: 'Hidden' } };
const VIEWS = [{ value: '', label: 'All' }, { value: 'published', label: 'Published' }, { value: 'pending', label: 'Pending' }, { value: 'hidden', label: 'Hidden' }];

export default function Reviews() {
  const { user } = useAuth();
  const isCo = user.role === 'company';
  const [sp, setSp] = useSearchParams();
  const status = VIEWS.some((v) => v.value === sp.get('status')) ? sp.get('status') : '';
  const [client, setClient] = useState('');
  const [search, setSearch] = useState('');
  const [edit, setEdit] = useState(null); // {} = new, row = edit
  const meta = useApi('reviews.clients');
  const list = useApi('reviews.list', { status: status || undefined, client: client || undefined, search });
  const mine = meta.data?.mine || [];
  const canAdd = mine.length > 0;
  const reload = () => { list.reload(); meta.reload(); };
  const names = useMemo(() => Object.fromEntries((meta.data?.clients || []).map((c) => [c.slug, c])), [meta.data]);
  const pending = Object.values(meta.data?.counts || {}).reduce((n, c) => n + (c.pending || 0), 0);

  return (
    <Page title="Reviews" subtitle="What clients say about you, shown on the venue tiles of your website"
      actions={canAdd && <Button icon={Plus} onClick={() => setEdit({})}>Add review</Button>}>
      {user.role === 'venue' && meta.data && (canAdd
        ? <p className="mb-4 text-subhead text-muted">Reviews you add are checked by the office before they appear on the website.</p>
        : <Empty icon={Globe} title="Your venue isn't on the website yet" body="Ask the office to link your venue to the website, then you can add the reviews you receive." />)}
      {(user.role !== 'venue' || canAdd) && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <Segmented value={status} onChange={(v) => setSp(v ? { status: v } : {}, { replace: true })}
              options={VIEWS.map((v) => (v.value === 'pending' && pending ? { ...v, label: `Pending (${pending})` } : v))} />
            {(isCo || mine.length > 1 || user.role === 'security') && (
              <Select className="min-w-0 basis-56" placeholder="All clients" value={client} onChange={(e) => setClient(e.target.value)}
                options={(meta.data?.clients || []).filter((c) => isCo || user.role === 'security' || mine.includes(c.slug)).map((c) => ({ value: c.slug, label: c.name }))} />
            )}
            <SearchInput className="min-w-0 flex-1 basis-60" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search reviews" />
          </div>
          <Load q={list}>{(rows) => (rows.length
            ? <ReviewGroups rows={rows} names={names} user={user} onEdit={setEdit} onChange={reload} />
            : <Empty icon={Quote} title={status || client || search ? 'No matching reviews' : 'No reviews yet'}
                body={canAdd ? 'Add a review a client gave you and it will appear when visitors flip their venue tile on the website.' : undefined} />)}
          </Load>
        </>
      )}
      {edit && <ReviewForm review={edit} clients={(meta.data?.clients || []).filter((c) => mine.includes(c.slug))} isCo={isCo}
        onClose={() => setEdit(null)} onSaved={reload} />}
    </Page>
  );
}

function ReviewGroups({ rows, names, user, onEdit, onChange }) {
  const groups = useMemo(() => {
    const g = {};
    for (const r of rows) (g[r.client] ||= []).push(r);
    return Object.entries(g);
  }, [rows]);
  return (
    <div className="space-y-4">
      {groups.map(([slug, items]) => (
        <Tile key={slug} title={names[slug]?.name || slug} action={<span className="text-footnote text-muted">{names[slug]?.city}</span>}>
          <div className="divide-y divide-hairline">
            {items.map((r, i) => <ReviewRow key={r.id} r={r} items={items} i={i} user={user} onEdit={onEdit} onChange={onChange} />)}
          </div>
        </Tile>
      ))}
    </div>
  );
}

const Stars = ({ n }) => (n ? (
  <span className="inline-flex gap-0.5 text-amber" role="img" aria-label={`${n} out of 5`}>
    {[1, 2, 3, 4, 5].map((k) => <Star key={k} size={14} fill={k <= n ? 'currentColor' : 'none'} />)}
  </span>
) : null);

function ReviewRow({ r, items, i, user, onEdit, onChange }) {
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const isCo = user.role === 'company';
  const mineToEdit = isCo || (r.created_by === user.id && r.status === 'pending');
  const setStatus = (status, msg) => run(() => api('reviews.setStatus', { id: r.id, status }), msg).then(onChange).catch(() => {});
  const move = (d) => {
    const ids = items.map((x) => x.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    run(() => api('reviews.reorder', { client: r.client, ids })).then(onChange).catch(() => {});
  };
  const remove = async () => {
    if (!(await confirm({ title: 'Delete this review?', body: 'It is removed from the website and from this list.', confirm: 'Delete', danger: true }))) return;
    run(() => api('reviews.delete', { id: r.id }), 'Review deleted').then(onChange).catch(() => {});
  };
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Pill>
        <Stars n={r.rating} />
        <span className="ml-auto text-caption text-faint">{r.received_on ? `Received ${date(r.received_on)}` : `Added ${date(r.created_at)}`}</span>
      </div>
      <p className="mt-2 whitespace-pre-line text-callout leading-relaxed">“{r.quote}”</p>
      <div className="mt-1 text-footnote text-muted">
        {[r.reviewer, r.reviewer_role].filter(Boolean).join(', ') || 'No name given'}
        {r.created_by_name && <span className="text-faint"> · added by {r.created_by_name}{r.venue_name ? ` (${r.venue_name})` : ''}</span>}
      </div>
      {mineToEdit && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {isCo && r.status !== 'published' && <Button size="sm" icon={Globe} busy={busy} onClick={() => setStatus('published', 'Published on the website')}>Publish</Button>}
          {isCo && r.status === 'published' && <Button size="sm" variant="secondary" icon={EyeOff} busy={busy} onClick={() => setStatus('hidden', 'Hidden from the website')}>Hide</Button>}
          <Button size="sm" variant="secondary" icon={Pencil} onClick={() => onEdit(r)}>Edit</Button>
          <Button size="sm" variant="secondary" icon={Trash2} onClick={remove}>Delete</Button>
          {isCo && items.length > 1 && (
            <div className="ml-auto flex gap-1">
              <IconButton icon={ArrowUp} label="Show earlier" size="sm" disabled={i === 0 || busy} onClick={() => move(-1)} />
              <IconButton icon={ArrowDown} label="Show later" size="sm" disabled={i === items.length - 1 || busy} onClick={() => move(1)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReviewForm({ review, clients, isCo, onClose, onSaved }) {
  const [run, busy] = useAction();
  const f = useForm({
    client: review.client || (clients.length === 1 ? clients[0].slug : ''), quote: review.quote || '', reviewer: review.reviewer || '',
    reviewer_role: review.reviewer_role || '', rating: review.rating || null, received_on: review.received_on ? String(review.received_on).slice(0, 10) : '',
  });
  const save = async () => {
    await run(() => api('reviews.save', { ...(review.id ? { id: review.id } : {}), ...f.v, received_on: f.v.received_on || null }),
      review.id ? 'Review saved' : isCo ? 'Review added to the website' : 'Review sent to the office for approval');
    onSaved();
    onClose();
  };
  return (
    <Sheet open onClose={onClose} title={review.id ? 'Edit review' : 'Add review'}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={busy} disabled={!f.v.client || !f.v.quote.trim()} onClick={save}>Save</Button></>}>
      <div className="space-y-4">
        <Select label="Client" placeholder="Choose the client" disabled={!!review.id || clients.length === 1}
          options={clients.map((c) => ({ value: c.slug, label: c.name }))} {...f.bind('client')} />
        <Textarea label="What they said" rows={5} maxLength={600} hint={`${f.v.quote.length}/600`} autoFocus {...f.bind('quote')} />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Input label="Their name" placeholder="Sarah M." maxLength={80} {...f.bind('reviewer')} />
          <Input label="Their role" placeholder="General Manager" maxLength={80} {...f.bind('reviewer_role')} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 text-footnote font-semibold">Rating <span className="font-normal text-faint">(optional)</span></div>
            <div className="flex h-11 items-center gap-1">
              {[1, 2, 3, 4, 5].map((k) => (
                <Pressable press key={k} aria-label={`${k} star${k > 1 ? 's' : ''}`} onClick={() => f.set('rating', f.v.rating === k ? null : k)}
                  className={cx('grid h-10 w-10 place-items-center rounded-full', k <= (f.v.rating || 0) ? 'text-amber' : 'text-faint')}>
                  <Star size={24} fill={k <= (f.v.rating || 0) ? 'currentColor' : 'none'} />
                </Pressable>
              ))}
            </div>
          </div>
          <Input label="Date received" type="date" {...f.bind('received_on')} />
        </div>
        {!isCo && <p className="text-footnote text-muted">The office checks each review before it appears on the website.</p>}
      </div>
    </Sheet>
  );
}
