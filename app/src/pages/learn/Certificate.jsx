import { useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { useAuth } from '../../auth.jsx';
import { Button, date, Load, Page, useApi } from '../../ui/index.jsx';
import { inkColor } from '../../ui/style.js';

export default function Certificate() {
  const { id } = useParams();
  const { user } = useAuth();
  const q = useApi('academy.certificate', { id });
  const back = user.role === 'officer' ? { to: '/officer/learn', label: 'Learn' } : { to: `/${user.role}/team/training?tab=results`, label: 'Results' };
  return (
    <Page title="Certificate" back={back} actions={<span className="no-print"><Button variant="secondary" icon={Printer} onClick={() => window.print()}>Print or save as PDF</Button></span>}>
      <Load q={q}>
        {(c) => {
          const color = inkColor(c.brand_color);
          return (
          <div className="print-sheet mx-auto max-w-2xl rounded-tile border-2 bg-surface p-8 text-center shadow-tile sm:p-12" style={{ borderColor: `${color}33` }}>
            {c.logo_url
              ? <img src={c.logo_url} alt={c.company_name} className="mx-auto h-20 w-auto max-w-[280px] object-contain" />
              : <svg viewBox="0 0 512 512" className="mx-auto h-12 w-12" aria-hidden><rect width="512" height="512" rx="120" fill={color} /><circle cx="256" cy="256" r="132" fill="none" stroke="#fff" strokeWidth="44" /><circle cx="256" cy="256" r="40" fill="#fff" /></svg>}
            <div className="mt-3 text-caption font-semibold uppercase tracking-[0.2em]" style={{ color }}>{c.company_name || 'Orb Security'} Academy</div>
            <div className="mt-6 text-[14px] text-muted">This is to record that</div>
            <div className="display mt-1 text-[30px] font-bold leading-tight sm:text-[36px]">{c.first_name} {c.last_name}</div>
            <div className="mt-3 text-[14px] text-muted">completed the course and passed the assessment for</div>
            <div className="mt-1 text-[22px] font-bold leading-snug">{c.title}</div>
            <div className="mx-auto mt-6 grid max-w-md grid-cols-3 gap-3 text-[13px]">
              <div><div className="text-faint">Score</div><div className="num font-bold">{c.score}%</div></div>
              <div><div className="text-faint">Issued</div><div className="font-bold">{date(c.issued_at)}</div></div>
              <div><div className="text-faint">{c.expires_at ? 'Renew by' : 'Valid'}</div><div className="font-bold">{c.expires_at ? date(c.expires_at) : 'No expiry'}</div></div>
            </div>
            <div className="num mt-6 text-[13px] font-semibold tracking-wide">{c.ref}</div>
            <p className="mx-auto mt-6 max-w-md border-t border-line pt-4 text-[12px] text-muted">
              In-house training record — not an SIA qualification or a certified first aid qualification.
            </p>
          </div>
          );
        }}
      </Load>
    </Page>
  );
}
