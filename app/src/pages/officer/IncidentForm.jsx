// Writing an incident report: a new one from its draft, or an existing one being corrected and signed again.
// The page itself is the Composer (shared/incident); this file picks what it opens with.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useParams, useSearchParams } from 'react-router-dom';
import { Plus, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../auth.jsx';
import { Button, Empty, Load, Page, relative, Sheet, Spinner, useApi } from '../../ui/index.jsx';
import { NotLinked, typeLabel } from './_parts.jsx';
import { readLocal } from './_draft.js';
import Composer from '../shared/incident/Composer.jsx';

export default function IncidentForm() {
  const { id } = useParams();
  const { user } = useAuth();
  const { pathname } = useLocation();
  // Managers file from /company or /security/incidents/new for any venue and date
  const office = user.role !== 'officer' && !pathname.startsWith('/officer');
  // The office edits a report from /company or /security/incidents/:id/edit before signing it
  if (office) return id ? <EditLoader id={id} manager /> : <DraftLoader manager />;
  if (!user.officer_id) return <Page title="Report incident"><NotLinked /></Page>;
  return id ? <EditLoader id={id} /> : <DraftLoader />;
}

// A new report opens its draft (?draft=), or the copy kept on this phone; opening from a shift that already has a draft asks which to use
function DraftLoader({ manager }) {
  const { user } = useAuth();
  const base = manager ? `/${user.role}` : '/officer';
  const [sp, setSp] = useSearchParams();
  const urlDraft = sp.get('draft');
  const [draftId, setDraftId] = useState(urlDraft);
  const created = useRef(new Set());
  // A reminder link to another draft while the form is open
  useEffect(() => { if (urlDraft && urlDraft !== draftId && !created.current.has(urlDraft)) setDraftId(urlDraft); }, [urlDraft]); // eslint-disable-line react-hooks/exhaustive-deps
  const q = useApi('incidents.draftGet', { id: draftId }, { skip: !draftId });
  const shiftParam = sp.get('shift');
  const others = useApi('incidents.drafts', {}, { skip: !!draftId || !shiftParam || manager });
  const same = !draftId && (others.data || []).find((d) => !d.manager && d.shift_id === shiftParam);
  const [fresh, setFresh] = useState(false);
  const onCreated = useCallback((nid) => {
    created.current.add(nid);
    setSp((cur) => { const n = new URLSearchParams(cur); n.set('draft', nid); return n; }, { replace: true });
  }, [setSp]);

  if (draftId && q.error) {
    return (
      <Page title="Report incident" back={{ to: `${base}/incidents`, label: 'Incidents' }}>
        <Empty icon={ShieldAlert} title="This draft is no longer here" body="It was sent as a report, deleted, or removed after 30 days without changes."
          action={<Button icon={Plus} onClick={() => { setSp(new URLSearchParams(), { replace: true }); setDraftId(null); }}>Start a new report</Button>} />
      </Page>
    );
  }
  // Officers start a report from the shift card; drafts (and this phone's copy of one) still open here
  if (!manager && !draftId && !shiftParam && !readLocal(null)?.snapshot?.data?.shift_id) {
    return (
      <Page title="Report incident" back={{ to: '/officer/incidents', label: 'Reports' }}>
        <Empty icon={ShieldAlert} title="Reports start from the shift" body="Open the shift the incident happened on and tap a report tile (Ejection, Injury, Damage, Theft or Other). On shift now? They're on your Home screen. For an earlier shift, find it under Shifts."
          action={<Button to="/officer/shifts?tab=mine">Open my shifts</Button>} />
      </Page>
    );
  }
  if ((draftId && !q.data) || (!draftId && shiftParam && !manager && others.loading)) return <Page title="Report incident"><Spinner className="py-16" /></Page>;
  // The server copy, unless this phone holds newer changes that never reached it
  let initial = null;
  if (draftId) {
    const local = readLocal(draftId);
    const d = q.data;
    initial = local && local.at > Date.parse(d.updated_at) ? { ...d, ...local.snapshot, unsynced: true } : d;
  } else if (!fresh) {
    const local = readLocal(null);
    const snapShift = local?.snapshot?.data?.shift_id || null;
    if (local && !!local.snapshot?.data?.manager === !!manager && (!shiftParam || snapShift === shiftParam)) initial = { ...local.snapshot, unsynced: true };
  }
  return (
    <>
      <Composer key={draftId || 'new'} manager={manager} initial={initial} draftId={draftId} onCreated={onCreated} />
      <Sheet open={!!same && !fresh} onClose={() => setFresh(true)} title="You have a draft for this shift" size="sm"
        footer={<><Button variant="secondary" onClick={() => setFresh(true)}>Start a new report</Button><Button onClick={() => { setDraftId(same.id); setSp((cur) => { const n = new URLSearchParams(cur); n.set('draft', same.id); return n; }, { replace: true }); }}>Carry on with your draft</Button></>}>
        {same && (
          <p className="text-body">
            {typeLabel(same.type) || 'An untitled report'}{same.venue_name ? ` at ${same.venue_name}` : ''}, saved {relative(same.updated_at)}. {same.progress.done} of {same.progress.total} parts written.
          </p>
        )}
      </Sheet>
    </>
  );
}

// Signed reports can be changed only while they wait for the officer (by them) or the manager (by the office)
function EditLoader({ id, manager }) {
  const { user } = useAuth();
  const q = useApi('incidents.get', { id });
  const base = manager ? `/${user.role}` : '/officer';
  return (
    <Load q={q}>
      {(inc) => {
        const s = inc.sign_stage;
        const why = ['venue', 'complete'].includes(s) ? 'A manager has signed this report, so it can no longer be changed.'
          : manager && s === 'officer' ? 'This report is with the officer to check and sign. You can edit it again once they have.'
            : !s && inc.status === 'closed' ? 'This report is closed and can no longer be edited.' : null;
        return why
          ? <Page title="Edit report" back={{ to: `${base}/incidents/${id}`, label: inc.reference || inc.ref }}><div className="rounded-2xl bg-bg p-4 text-body text-muted">{why}</div></Page>
          : <Composer existing={inc} />;
      }}
    </Load>
  );
}
