import { useState } from 'react';
import { EyeOff, ShieldCheck, Sparkles } from 'lucide-react';
import { api } from '../../api.js';
import { Button, Empty, Load, relative, Section, Sheet, Spinner, Tile, useAction, useApi } from '../../ui/index.jsx';
import PostCard from './PostCard.jsx';
import { PersonSheet } from './_parts.jsx';

const short = (s, n = 160) => (s && s.length > n ? `${s.slice(0, n)}…` : s || 'Photo only');

export default function Moderation({ onChanged }) {
  const q = useApi('everyday.reports');
  const [run, busy] = useAction();
  const [view, setView] = useState(null);
  const [person, setPerson] = useState(null);
  const done = () => { q.reload(); onChanged?.(); };

  const resolve = (r, status) => run(() => api('everyday.resolve', { id: r.id, status }), status === 'dismissed' ? 'Report dismissed' : 'Marked as dealt with').then(done).catch(() => {});
  const hideAndClose = (r) => run(async () => {
    await api('everyday.hide', { target_type: r.target_type, id: r.target_id, reason: r.reason || 'Breaks the community rules' });
    await api('everyday.resolve', { id: r.id, status: 'actioned' });
  }, 'Hidden and report closed').then(done).catch(() => {});
  const unhide = (h) => run(() => api('everyday.unhide', { target_type: h.target_type, id: h.id }), 'Visible again').then(done).catch(() => {});
  const unmute = (m) => run(() => api('everyday.unmute', { user_id: m.user_id }), `${m.name} can post again`).then(done).catch(() => {});

  return (
    <div className="mx-auto max-w-[760px]">
      <Load q={q}>
        {({ reports, hidden, mutes }) => (
          <div className="space-y-6">
            <Section title={`Reports to check (${reports.length})`}>
              {!reports.length ? <Empty icon={ShieldCheck} title="Nothing to check" body="Reports from staff and posts Orb AI flags will appear here." /> : (
                <div className="space-y-3">
                  {reports.map((r) => (
                    <Tile key={r.id}>
                      <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
                        {r.reporter_name ? <span>Reported by <b className="text-ink">{r.reporter_name}</b></span> : <span className="flex items-center gap-1 font-semibold text-blue"><Sparkles size={14} /> Flagged by Orb AI</span>}
                        <span>· {relative(r.created_at)}</span>
                        <span>· {r.target_type === 'comment' ? 'Comment' : 'Post'} by {r.author_name}</span>
                        {r.hidden_at && <span className="font-semibold text-red">· Already hidden</span>}
                      </div>
                      {r.reason && <div className="mt-2 rounded-xl bg-amber-soft px-3 py-2 text-[14px]">{r.reason}</div>}
                      <div className="mt-2 whitespace-pre-wrap break-words text-[15px]">{short(r.body, 400)}</div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {r.post_id && <Button size="sm" variant="secondary" onClick={() => setView(r.post_id)}>Open</Button>}
                        {!r.hidden_at && <Button size="sm" variant="danger" icon={EyeOff} disabled={busy} onClick={() => hideAndClose(r)}>Hide it</Button>}
                        {r.hidden_at && <Button size="sm" disabled={busy} onClick={() => resolve(r, 'actioned')}>Close report</Button>}
                        <Button size="sm" variant="ghost" disabled={busy} onClick={() => resolve(r, 'dismissed')}>It's fine — dismiss</Button>
                      </div>
                    </Tile>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Hidden from staff">
              {!hidden.length ? <p className="px-1 text-[14px] text-muted">Nothing hidden.</p> : (
                <div className="space-y-2">
                  {hidden.map((h) => (
                    <Tile key={`${h.target_type}-${h.id}`}>
                      <div className="text-[13px] text-muted">{h.target_type === 'comment' ? 'Comment' : 'Post'} by {h.author_name} · hidden {relative(h.hidden_at)}{h.hidden_by_name ? ` by ${h.hidden_by_name}` : ''}{h.reason ? ` — ${h.reason}` : ''}</div>
                      <div className="mt-1 whitespace-pre-wrap break-words text-[15px]">{short(h.body)}</div>
                      <div className="mt-3 flex gap-2">
                        {h.post_id && <Button size="sm" variant="secondary" onClick={() => setView(h.post_id)}>Open</Button>}
                        <Button size="sm" variant="secondary" disabled={busy} onClick={() => unhide(h)}>Unhide</Button>
                      </div>
                    </Tile>
                  ))}
                </div>
              )}
            </Section>

            <Section title="Paused from posting">
              {!mutes.length ? <p className="px-1 text-[14px] text-muted">Nobody is paused.</p> : (
                <div className="space-y-2">
                  {mutes.map((m) => (
                    <Tile key={m.user_id}>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <button type="button" className="font-semibold hover:text-blue" onClick={() => setPerson(m.user_id)}>{m.name}</button>
                          <div className="text-[13px] text-muted">Until {new Date(m.until).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}{m.by_name ? ` · by ${m.by_name}` : ''}{m.reason ? ` — ${m.reason}` : ''}</div>
                        </div>
                        <Button size="sm" variant="secondary" disabled={busy} onClick={() => unmute(m)}>Let them post</Button>
                      </div>
                    </Tile>
                  ))}
                </div>
              )}
            </Section>
          </div>
        )}
      </Load>
      <ViewPost id={view} onClose={() => setView(null)} onChanged={done} onPerson={(p) => { setView(null); setPerson(p); }} />
      <PersonSheet userId={person} onClose={() => { setPerson(null); done(); }} />
    </div>
  );
}

function ViewPost({ id, onClose, onChanged, onPerson }) {
  const q = useApi('everyday.post', { id }, { skip: !id });
  return (
    <Sheet open={!!id} onClose={onClose} title="Post" size="lg">
      {id && (q.error ? <p className="text-[14px] text-muted">{q.error.status === 404 ? 'This post has been deleted.' : q.error.message}</p>
        : !q.data ? <Spinner /> : <PostCard post={q.data} full onPerson={onPerson} onChanged={() => { onChanged(); q.reload(); }} />)}
    </Sheet>
  );
}
