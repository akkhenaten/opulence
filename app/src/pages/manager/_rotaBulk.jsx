import { Fragment, useMemo, useState } from 'react';
import { Check, Hand, Megaphone, MegaphoneOff, MousePointerClick, Send, Trash2, UserPlus, X } from 'lucide-react';
import { ActionBar, Avatar, Button, cx, displayName, Empty, IconButton, Input, List, Load, MoreMenu, Pressable, Sheet, nameMatches, useAction, useApi, useConfirm } from '../../ui/index.jsx';
import { api } from '../../api.js';

/* Several rota shifts at once. Each action goes through the same checks as on one shift; whatever does not fit is
   left out and listed with the reason, e.g. "Sat 21 Nov · The Ivy — full". */

export const MAX_PICK = 200;
// Cancelled and finished shifts cannot be picked
export const pickable = (s, now = Date.now()) => s.status !== 'cancelled' && new Date(s.ends_at) > now;
const n = (k, one, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
const lines = (list, max = 6) => (
  <>{list.slice(0, max).map((x, i) => <Fragment key={x.id + i}>{i > 0 && <br />}<span className="text-ink">{x.label}</span> — {x.why}</Fragment>)}
    {list.length > max && <><br />and {list.length - max} more</>}</>
);
const said = (r, word) => `${r.done} ${word}${r.skipped?.length ? ` · ${r.skipped.length} skipped` : ''}`;

/** The bar under a rota selection. shifts: the picked shifts; total: how many could be picked. */
export function RotaBar({ pick, shifts, total, onDone }) {
  const [run, busy] = useAction();
  const confirm = useConfirm();
  const [assigning, setAssigning] = useState(false);
  const [left, setLeft] = useState(null); // { title, list } of what was skipped
  const ids = shifts.map((s) => s.id);
  const drafts = shifts.filter((s) => s.status === 'draft');
  const live = shifts.filter((s) => s.status === 'published');
  const reqs = live.reduce((k, s) => k + s.assignments.filter((a) => a.status === 'requested').length, 0);
  const toOpen = live.filter((s) => !s.open);
  const toClose = live.filter((s) => s.open);
  const booked = live.filter((s) => s.assignments.some((a) => ['assigned', 'accepted'].includes(a.status))).length;
  const over = shifts.length > MAX_PICK;
  const off = over || busy;
  const tooMany = `Select up to ${MAX_PICK} shifts`;

  // Done: the selection goes, unless something was skipped; then the list of what and why shows first
  const after = (word) => (r) => {
    if (r?.skipped?.length) setLeft({ title: `${n(r.skipped.length, 'shift')} not ${word}`, list: r.skipped });
    else pick.stop();
    onDone();
  };
  const act = (action, body, word) => run(() => api(action, { ids, ...body }), (r) => said(r, word)).then(after(word)).catch(() => onDone());

  const publish = async () => {
    if (!(await confirm({ title: `Publish ${n(drafts.length, 'draft')}?`, body: 'Assigned officers are told, and open shifts are offered to officers.', confirm: 'Publish' }))) return;
    run(() => api('shifts.publish', { ids: drafts.map((s) => s.id) }), (r) => `${r.published} published`).then(() => { pick.stop(); onDone(); }).catch(() => {});
  };
  const decide = async (approve) => {
    if (!approve && !(await confirm({ title: `Decline ${n(reqs, 'request')}?`, body: 'Each officer is told their request was not approved.', confirm: 'Decline', danger: true }))) return;
    act('shifts.decideRequests', { approve }, approve ? 'approved' : 'declined');
  };
  const cancel = async () => {
    const pub = shifts.length - drafts.length;
    const what = [pub && `cancel ${n(pub, 'shift')}`, drafts.length && `delete ${n(drafts.length, 'draft')}`].filter(Boolean).join(' and ');
    if (!(await confirm({ title: `${what[0].toUpperCase()}${what.slice(1)}?`, body: booked ? 'Officers booked on them are told.' : 'Nobody is booked on them yet.', confirm: pub ? 'Cancel shifts' : 'Delete drafts', cancel: 'Keep', danger: true }))) return;
    run(() => api('shifts.cancelMany', { ids }), (r) => [r.cancelled && `${r.cancelled} cancelled`, r.deleted && `${r.deleted} deleted`, r.skipped.length && `${r.skipped.length} skipped`].filter(Boolean).join(' · ') || 'Nothing to cancel')
      .then(after('cancelled')).catch(() => onDone());
  };

  const more = [
    shifts.length < total && { label: `Select all ${total}`, icon: MousePointerClick, hint: 'Ctrl+A', onClick: () => pick.setAll() },
    { label: reqs ? `Approve ${n(reqs, 'request')}` : 'Approve requests', icon: Check, disabled: off || !reqs, hint: over ? tooMany : reqs ? 'Oldest first, while places last' : 'No officer requests on these shifts', onClick: () => decide(true) },
    { label: reqs ? `Decline ${n(reqs, 'request')}` : 'Decline requests', icon: Hand, disabled: off || !reqs, hint: over ? tooMany : reqs ? undefined : 'No officer requests on these shifts', onClick: () => decide(false) },
    { label: toOpen.length ? `Offer ${n(toOpen.length, 'shift')} as open` : 'Offer as open', icon: Megaphone, disabled: off || !toOpen.length, hint: over ? tooMany : toOpen.length ? 'Officers can ask to work them' : 'Only published shifts not open yet', onClick: () => act('shifts.setOpen', { open: true }, 'offered') },
    { label: toClose.length ? `Stop offering ${n(toClose.length, 'shift')}` : 'Stop offering', icon: MegaphoneOff, disabled: off || !toClose.length, hint: over ? tooMany : toClose.length ? undefined : 'None of these is open', onClick: () => act('shifts.setOpen', { open: false }, 'no longer offered') },
    { label: drafts.length === shifts.length ? `Delete ${n(drafts.length, 'draft')}` : `Cancel ${n(shifts.length, 'shift')}`, icon: Trash2, danger: true, disabled: off || !shifts.length, hint: over ? tooMany : drafts.length && drafts.length < shifts.length ? 'Drafts are deleted, published shifts cancelled' : undefined, onClick: cancel },
  ];

  return (
    <>
      <ActionBar show={pick.picking || shifts.length > 0}>
        <span className="num mr-1 text-subhead font-semibold">{shifts.length ? `${n(shifts.length, 'shift')} selected` : 'Tap shifts to select'}</span>
        {shifts.length > 0 && <Button size="sm" icon={UserPlus} disabled={off} title={over ? tooMany : 'Put one officer on these shifts'} onClick={() => setAssigning(true)}>Assign</Button>}
        {drafts.length > 0 && <Button size="sm" variant="secondary" icon={Send} disabled={off} onClick={publish}>Publish {drafts.length}</Button>}
        <MoreMenu items={more} label="More for the selected shifts" title={shifts.length ? `${n(shifts.length, 'shift')} selected` : 'Select shifts'} tone="dark" size="sm" />
        <IconButton icon={X} label="Clear selection (Esc)" tone="dark" size="sm" onClick={pick.stop} />
      </ActionBar>
      {assigning && <AssignMany shifts={shifts} onClose={() => setAssigning(false)} onDone={(r) => { setAssigning(false); after('assigned')(r); }} />}
      {left && (
        <Sheet open onClose={() => { setLeft(null); pick.stop(); }} title={left.title} size="sm"
          footer={<Button onClick={() => { setLeft(null); pick.stop(); }}>OK</Button>}>
          <List inset>
            {left.list.map((x, i) => (
              <div key={x.id + i} className="px-4 py-3">
                <div className="text-body font-semibold">{x.label}</div>
                <div className="text-footnote text-muted">{x.why}</div>
              </div>
            ))}
          </List>
        </Sheet>
      )}
    </>
  );
}

/* One officer on all the picked shifts: the list shows how many each can take and why not the rest */
function AssignMany({ shifts, onClose, onDone }) {
  const body = useMemo(() => ({ ids: shifts.map((s) => s.id) }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const q = useApi('shifts.candidatesMany', body);
  const [run] = useAction();
  const confirm = useConfirm();
  const [busyId, setBusyId] = useState(null);
  const [search, setSearch] = useState('');
  const ask = (c, warnings) => confirm({ title: `Assign ${c.name} anyway?`, body: lines(warnings), confirm: 'Assign anyway' });
  const go = async (c) => {
    if (c.warnings.length && !(await ask(c, c.warnings))) return;
    setBusyId(c.id);
    const send = (override) => run(() => api('shifts.assignMany', { ...body, officer_id: c.id, override }),
      (r) => (r.needs_override ? undefined : `${c.name}: ${n(r.done, 'shift')} assigned${r.skipped.length ? ` · ${r.skipped.length} skipped` : ''}`));
    try {
      let r = await send(c.warnings.length > 0);
      // Something changed since the list was made: ask about the new warnings once
      if (r.needs_override) r = (await ask(c, r.warnings)) ? await send(true) : null;
      if (r && !r.needs_override) onDone(r);
    } catch { /* toasted */ } finally { setBusyId(null); }
  };
  return (
    <Sheet open onClose={onClose} title={`Assign to ${n(shifts.length, 'shift')}`} size="md">
      <p className="mb-3 text-subhead text-muted">Pick one officer. Each shift gets the usual checks; any they can't take are skipped and listed.</p>
      <Input placeholder="Search officers" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-3" />
      <Load q={q}>{(d) => {
        const shown = d.officers.filter((c) => nameMatches(c, search));
        if (!d.shifts) return <Empty title="Nothing to fill" body="These shifts are full or have finished." />;
        if (!shown.length) return <Empty title="No officers found" />;
        return (
          <>
            {shifts.length > d.shifts && <p className="mb-2 text-footnote text-muted">Counted on the {d.shifts} shifts with open places{shifts.length > 40 ? ' (the first 40)' : ''}.</p>}
            <List inset>
              {shown.map((c) => {
                const none = c.fits === 0;
                return (
                  <Pressable press key={c.id} disabled={none || busyId != null} onClick={() => go(c)}
                    className={cx('flex w-full items-center gap-3 px-4 py-3 text-left transition', none ? 'opacity-60' : 'hover:bg-surface active:bg-surface')}>
                    <Avatar name={c.name} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-body font-semibold">{displayName(c)}</div>
                      <div className={cx('num text-caption font-semibold', none ? 'text-red' : c.fits === d.shifts ? 'text-green' : 'text-amber')}>
                        {none ? "Can't take any of these" : c.fits === d.shifts ? `Can take all ${d.shifts}` : `Can take ${c.fits} of ${d.shifts}`}
                      </div>
                      {c.blocked.length > 0 && <div className="line-clamp-2 text-caption text-muted">{c.blocked.slice(0, 2).map((x) => `${x.label}: ${x.why}`).join(' · ')}{c.blocked.length > 2 ? ` · +${c.blocked.length - 2}` : ''}</div>}
                      {c.warnings.length > 0 && <div className="line-clamp-2 text-caption text-amber">{c.warnings.slice(0, 2).map((x) => `${x.label}: ${x.why}`).join(' · ')}{c.warnings.length > 2 ? ` · +${c.warnings.length - 2}` : ''}</div>}
                    </div>
                    {busyId === c.id ? <span className="text-footnote text-muted">Assigning…</span> : !none && <UserPlus size={18} className="text-blue" />}
                  </Pressable>
                );
              })}
            </List>
          </>
        );
      }}</Load>
    </Sheet>
  );
}
