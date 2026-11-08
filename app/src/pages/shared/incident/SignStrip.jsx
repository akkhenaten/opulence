// Who has signed an incident report, in order: officer, manager, venue. Signatures voided by an edit or a send-back
// stay listed underneath, so the trail shows every version that was signed.
import { CheckCircle2, Circle, History } from 'lucide-react';
import { cx, dateTime, Pill } from '../../../ui/index.jsx';

export const STAGE = {
  manager: { label: 'Awaiting manager', tone: 'blue' },
  venue: { label: 'Awaiting venue', tone: 'blue' },
  complete: { label: 'Complete', tone: 'green' },
};
export const stageLabel = (inc) => (inc.sign_stage === 'officer'
  ? (inc.resign_reason === 'edited' ? 'Re-sign (edited)' : 'Sent back')
  : STAGE[inc.sign_stage]?.label || '');
export const stageTone = (inc) => (inc.sign_stage === 'officer' ? 'amber' : STAGE[inc.sign_stage]?.tone || 'grey');

/** The signing stage, or nothing for reports from before signing (they keep their review status) */
export function StagePill({ inc, className }) {
  if (!inc?.sign_stage) return null;
  return <Pill tone={stageTone(inc)} className={className}>{stageLabel(inc)}</Pill>;
}

const STEPS = [
  { role: 'officer', label: 'Officer', wait: 'Officer to sign' },
  { role: 'manager', label: 'Manager', wait: 'Manager to sign' },
  { role: 'venue', label: 'Venue', wait: 'Venue to sign' },
];
const ORDER = ['officer', 'manager', 'venue', 'complete'];

export function SignStrip({ inc }) {
  const sigs = inc.signatures || [];
  const live = sigs.filter((s) => !s.void_at);
  const voided = sigs.filter((s) => s.void_at);
  const at = ORDER.indexOf(inc.sign_stage);
  return (
    <section aria-label="Signatures" className="rounded-tile bg-surface p-4 shadow-tile sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-headline font-bold">Signatures</h2>
        {inc.reference && <span className="num text-caption font-semibold text-muted">{inc.reference}</span>}
      </div>
      <ol className="mt-3 grid gap-2 sm:grid-cols-3">
        {STEPS.map((st, i) => {
          const s = live.filter((x) => x.role === st.role).pop();
          const now = !s && i === at;
          return (
            <li key={st.role} style={{ animationDelay: `${i * 45}ms` }}
              className={cx('anim-fade-in relative rounded-2xl border p-3', s ? 'border-green/30 bg-green-soft/40' : now ? 'border-blue/40 bg-blue-soft/50' : 'border-hairline bg-bg')}>
              <div className="flex items-center gap-1.5 text-footnote font-semibold">
                {s ? <CheckCircle2 size={16} className="text-green" aria-hidden /> : <Circle size={16} className={now ? 'text-blue' : 'text-faint'} aria-hidden />}
                <span className={s ? 'text-green' : now ? 'text-blue' : 'text-muted'}>{st.label}</span>
              </div>
              {s ? (
                <>
                  <div className="mt-2 grid h-16 place-items-center rounded-xl bg-white"><img src={s.png} alt={`Signature of ${s.name}`} className="max-h-14 max-w-[90%] object-contain" /></div>
                  <div className="mt-1.5 truncate text-subhead font-semibold">{s.name}</div>
                  <div className="truncate text-caption text-muted">{s.title ? `${s.title} · ` : ''}{dateTime(s.at)}</div>
                </>
              ) : (
                <div className={cx('mt-2 text-subhead', now ? 'font-semibold text-blue' : 'text-faint')}>{now ? st.wait : 'Not yet'}</div>
              )}
            </li>
          );
        })}
      </ol>
      {inc.sealed_at && <p className="mt-3 text-footnote text-muted">Sealed {dateTime(inc.sealed_at)}. The signed copy can no longer change.</p>}
      {voided.length > 0 && (
        <details className="mt-3 group">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 text-footnote font-semibold text-muted">
            <History size={16} aria-hidden />Earlier signatures ({voided.length})
          </summary>
          <ul className="mt-1 space-y-1.5">
            {voided.map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-xl bg-bg px-3 py-2 text-footnote">
                <img src={s.png} alt="" className="h-8 w-16 shrink-0 rounded bg-white object-contain opacity-60" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold capitalize">{s.role} · {s.name}</span>
                  <span className="block truncate text-muted">Signed {dateTime(s.at)}{s.version ? ` (version ${s.version})` : ''}, voided {dateTime(s.void_at)}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
