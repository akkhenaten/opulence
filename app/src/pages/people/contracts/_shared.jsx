// Shared pieces for contract packs: content-state badges, finding severities and the live PDF preview
import { useEffect, useState } from 'react';
import { AlertTriangle, Info, OctagonAlert } from 'lucide-react';
import { api } from '../../../api.js';
import { Pill } from '../../../ui/index.jsx';

export const JURISDICTIONS = { ew: 'England and Wales', sc: 'Scotland', ni: 'Northern Ireland' };
export const JUR_SHORT = { ew: 'E&W', sc: 'Scotland', ni: 'NI' };

// Every piece of wording carries one of these; nothing is presented as legally approved unless a review was recorded
export const STATE = {
  draft: { label: 'Research-based draft', tone: 'amber' },
  company: { label: 'Company-approved', tone: 'blue' },
  legal: { label: 'Legally reviewed', tone: 'green' },
};
export const StatePill = ({ state, className }) => (STATE[state] ? <Pill tone={STATE[state].tone} className={className}>{STATE[state].label}</Pill> : null);

export const SEVERITY = {
  blocker: { label: 'Blockers', one: 'Blocker', tone: 'red', icon: OctagonAlert, text: 'text-red', soft: 'bg-red-soft' },
  review: { label: 'Needs review', one: 'Needs review', tone: 'amber', icon: AlertTriangle, text: 'text-amber', soft: 'bg-amber-soft' },
  note: { label: 'Notes', one: 'Note', tone: 'blue', icon: Info, text: 'text-blue', soft: 'bg-blue-soft' },
};

export const ORIGIN = { standard: 'Standard', alternative: 'Alternative', bespoke: 'Written for this document' };

// Where a prefilled value came from, in words
export const SOURCE = {
  'company.name': 'company settings', 'company.address': 'company settings', 'company.number': 'company settings',
  'officer.name': 'staff profile', 'officer.address': 'staff profile', 'officer.role': 'staff profile', 'officer.sia_type': 'SIA licence',
  'officer.start_date': 'staff profile', 'officer.email': 'staff profile',
  'organisation.name': 'business record', 'organisation.address': 'business record', 'organisation.number': 'business record',
  'organisation.signatory': 'business record', 'organisation.signatory_title': 'business record',
};

/** The real PDF for wide screens, fetched after each saved change (rev) with a short debounce */
export function useDraftPdf(id, rev, enabled) {
  const [out, setOut] = useState({ loading: true });
  useEffect(() => {
    if (!enabled) return undefined;
    let live = true;
    setOut((o) => ({ ...o, loading: true }));
    const t = setTimeout(async () => {
      try {
        const r = await api('contracts.draft.preview', { id });
        if (!live) return;
        const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(r.pdf), (ch) => ch.charCodeAt(0))], { type: 'application/pdf' }));
        setOut((o) => { if (o.url) URL.revokeObjectURL(o.url); return { url, loading: false }; });
      } catch (e) {
        if (live) setOut((o) => ({ ...o, loading: false, error: e.message }));
      }
    }, 450);
    return () => { live = false; clearTimeout(t); };
  }, [id, rev, enabled]);
  useEffect(() => () => out.url && URL.revokeObjectURL(out.url), []); // eslint-disable-line react-hooks/exhaustive-deps
  return out;
}

// Scroll a workspace item into view and flash it, once its tab has rendered
export function flash(elId) {
  setTimeout(() => {
    const el = document.getElementById(elId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-blue/40');
    setTimeout(() => el.classList.remove('ring-2', 'ring-blue/40'), 1600);
    el.querySelector('input,select,textarea,button')?.focus({ preventScroll: true });
  }, 80);
}
