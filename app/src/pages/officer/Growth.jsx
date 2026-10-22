// The officer's goals, notes from shared one-to-ones and pay rises sent to them
import { useState } from 'react';
import { Check, FileSignature, MessageSquare } from 'lucide-react';
import { api } from '../../api.js';
import { Button, date, dateTime, Empty, Input, List, Load, money, Page, Pill, Row, Section, Tile, useAction, useApi } from '../../ui/index.jsx';

const GOAL = { open: ['In progress', 'blue'], met: ['Met', 'green'], missed: ['Missed', 'red'], dropped: ['Dropped', 'grey'] };
const AGREEMENT = { sent: ['To sign', 'amber'], signed: ['Signed', 'blue'], applied: ['In effect', 'green'], void: ['Withdrawn', 'grey'] };

export default function Growth() {
  const q = useApi('growth.mine');
  const [note, setNote] = useState({});
  const [run, busy] = useAction();
  const add = (g) => run(() => api('goals.addNote', { goal_id: g.id, body: note[g.id] }), 'Update sent to your manager')
    .then(() => { setNote((n) => ({ ...n, [g.id]: '' })); q.reload(); }).catch(() => {});
  return (
    <Page title="Goals and one-to-ones" back={{ to: '/officer/me', label: 'Me' }}>
      <Load q={q}>
        {(d) => (
          <>
            {d.agreements.length > 0 && (
              <Section title="Pay rises">
                <List>
                  {d.agreements.map((a) => (
                    <Row key={a.id} to={`/officer/agreements/${a.id}`} left={<FileSignature size={20} className="text-blue" />}
                      title={<span className="num">{money(a.new_rate)}/h</span>}
                      subtitle={`${a.role_name} · from ${date(a.effective_from)}${a.conditions.length ? ` · ${a.conditions.filter((g) => g.status === 'met').length}/${a.conditions.length} goals met` : ''}`}
                      right={<Pill tone={AGREEMENT[a.status]?.[1]}>{AGREEMENT[a.status]?.[0]}</Pill>} />
                  ))}
                </List>
              </Section>
            )}
            <Section title="My goals">
              {d.goals.length ? (
                <div className="space-y-2">
                  {d.goals.map((g) => (
                    <Tile key={g.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-body font-semibold">{g.title}</div>
                          {g.target && <p className="text-subhead text-muted">{g.target}</p>}
                          {g.due_on && <p className="text-footnote text-faint">Due {date(g.due_on)}</p>}
                        </div>
                        <Pill tone={GOAL[g.status][1]}>{GOAL[g.status][0]}</Pill>
                      </div>
                      {g.notes.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {g.notes.map((n) => (
                            <div key={n.id} className="rounded-xl bg-bg px-3 py-2 text-subhead">
                              <span className="whitespace-pre-wrap">{n.body}</span>
                              <span className="block text-caption text-faint">{n.author_name || 'Someone'} · {dateTime(n.created_at)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {g.status === 'open' && (
                        <div className="mt-2 flex gap-2">
                          <Input className="flex-1" aria-label="Progress update" placeholder="Tell your manager how it's going" value={note[g.id] || ''} onChange={(e) => setNote((n) => ({ ...n, [g.id]: e.target.value }))} />
                          <Button variant="secondary" disabled={busy || !(note[g.id] || '').trim()} onClick={() => add(g)}>Send</Button>
                        </div>
                      )}
                    </Tile>
                  ))}
                </div>
              ) : <Empty icon={Check} title="No goals yet" body="Goals you agree with your manager in a one-to-one show here." />}
            </Section>
            <Section title="One-to-one notes">
              {d.meetings.length ? (
                <div className="space-y-2">
                  {d.meetings.map((m) => (
                    <Tile key={m.id}>
                      <div className="text-subhead font-semibold">{date(m.held_on)}<span className="font-normal text-muted"> · {m.manager_name || 'Your manager'}</span></div>
                      <p className="mt-1 whitespace-pre-wrap text-subhead">{m.notes || 'No notes'}</p>
                    </Tile>
                  ))}
                </div>
              ) : <Empty icon={MessageSquare} title="Nothing shared yet" body="When your manager shares notes from a one-to-one, they appear here." />}
            </Section>
          </>
        )}
      </Load>
    </Page>
  );
}
