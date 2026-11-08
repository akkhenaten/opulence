// An incident report as one page: a title, the properties as chips, then the writer's own notes with photos, people and
// facts dropped in between. Orb ✦ turns the notes into the report; the writer checks it, then approves and signs.
// The draft saves as it is written, the same as before.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Cloud, CloudOff, FilePen, FileSignature, NotebookPen, Save, Sparkles, X } from 'lucide-react';
import { api } from '../../../api.js';
import { useAuth } from '../../../auth.jsx';
import { Button, Callout, cx, Page, Segmented, time, toLocalInput, useAction, useConfirm, useKeyboardOpen, useToast } from '../../../ui/index.jsx';
import { Lightbox } from '../../../ui/Lightbox.jsx';
import { INCIDENT_TYPES, typeLabel } from '../../officer/_parts.jsx';
import { useIncidentDraft } from '../../officer/_draft.js';
import { DOC_ACCEPT, isImage, MAX_FILES, useUploads } from '../evidence.jsx';
import { BACKDATE_DAYS, Props, useWhen } from './Props.jsx';
import { blankPerson, Blocks, FACTS, insertAt, newId, Prose, textBlock } from './Blocks.jsx';
import { InsertBar } from './InsertBar.jsx';
import { OrbWrite, PhotoSheet } from './OrbWrite.jsx';
import { SignSheet } from './SignSheet.jsx';

const BLANK = {
  type: '', severity: '', occurred_at: '', location: '',
  force_used: false, force_justification: '', police_called: false, police_ref: '', ambulance_called: false, ambulance_ref: '',
};
const NO_SECTIONS = { what: '', people: '', injuries: '', actions: '' };
const FACT_KEY = { police: 'police_called', ambulance: 'ambulance_called', force: 'force_used' };
const FACT_OF = Object.fromEntries(Object.entries(FACT_KEY).map(([a, b]) => [b, a]));
const CHIP_KEYS = ['type', 'severity', 'location', 'police_called', 'ambulance_called', 'force_used'];

// Reports and drafts written before the page had blocks: notes, witnesses and files become blocks in that order
function fromLegacy({ notes, witnesses = [], files = [] }) {
  const out = [];
  if (notes?.trim()) out.push(textBlock(notes));
  witnesses.forEach((w) => out.push({ ...blankPerson(), name: w.name || '', contact: w.contact || '', statement: w.statement || '' }));
  const photos = files.filter((f) => isImage(f.mime)).map((f) => f.key);
  const docs = files.filter((f) => !isImage(f.mime)).map((f) => f.key);
  if (photos.length) out.push({ id: newId(), kind: 'photo', items: photos });
  if (docs.length) out.push({ id: newId(), kind: 'file', items: docs });
  out.push(textBlock());
  return out;
}
// Fact blocks follow their yes/no: one block for each fact that is yes
const withFacts = (blocks, v) => {
  let out = blocks.filter((b) => !FACTS.includes(b.kind) || v[FACT_KEY[b.kind]]);
  FACTS.forEach((k) => { if (v[FACT_KEY[k]] && !out.some((b) => b.kind === k)) out = insertAt(out, null, [{ id: newId(), kind: k }]); });
  return out.length ? out : [textBlock()];
};
// Saved blocks hold storage keys; ones still on the page as uploads are swapped for their key once uploaded
const loadBody = (body) => (Array.isArray(body) && body.length ? body.map((b) => ({ ...b, id: b.id || newId(), ...(b.items ? { items: b.items.map((x) => (typeof x === 'string' ? x : x?.key)).filter(Boolean) } : {}) })) : null);

export default function Composer({ existing, manager, initial, draftId, onCreated }) {
  const nav = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const confirm = useConfirm();
  const [sp] = useSearchParams();
  const keyboard = useKeyboardOpen();
  const edit = !!existing;
  const base = manager || (edit && user.role !== 'officer') ? `/${user.role}` : '/officer';
  const d0 = initial?.data || {};

  const [v, setV] = useState(() => (edit
    ? { ...BLANK, ...Object.fromEntries(Object.keys(BLANK).map((k) => [k, existing[k] ?? BLANK[k]])), occurred_at: toLocalInput(existing.occurred_at) }
    : { ...BLANK, occurred_at: toLocalInput(new Date()), type: INCIDENT_TYPES.some((t) => t.value === sp.get('type')) ? sp.get('type') : '', ...Object.fromEntries(Object.keys(BLANK).filter((k) => d0[k] != null).map((k) => [k, d0[k]])) }));
  const w = useWhen({ edit, manager, existing, d0, v, setV });
  const [title, setTitle] = useState(() => existing?.title || d0.title || '');

  // Files the page already knows by key: the report's own, or ones uploaded into the draft earlier
  const [known] = useState(() => Object.fromEntries((edit
    ? (existing.attachments || []).map((a) => ({ key: a.s3_key, name: a.name, mime: a.mime, url: a.url, id: a.id, can_remove: a.can_remove }))
    : (initial?.attachments || [])).map((a) => [a.key, a])));
  const [captions, setCaptions] = useState(() => (edit
    ? Object.fromEntries((existing.attachments || []).map((a) => [a.s3_key, { caption: a.caption || '', section: a.section || '' }]))
    : d0.captions || {}));
  const [blocks, setBlocks] = useState(() => {
    const src = edit ? existing : d0;
    const b = loadBody(src.body) || fromLegacy({
      notes: src.notes || '',
      witnesses: src.witnesses || [],
      files: Object.values(known),
    });
    return withFacts(b, v);
  });
  const [sections, setSections] = useState(() => (edit
    ? { what: existing.description || '', people: existing.people_involved || '', injuries: existing.injuries || '', actions: existing.actions_taken || '' }
    : { ...NO_SECTIONS, ...(d0.orb?.sections || { what: d0.description || '', people: d0.people_involved || '', injuries: d0.injuries || '', actions: d0.actions_taken || '' }) }));
  const [questions, setQuestions] = useState(() => d0.orb?.questions || []);
  const [filled, setFilled] = useState(() => new Set(d0.orb?.filled || []));
  const [orbVersions, setOrbVersions] = useState(() => existing?.orb_versions || d0.orb?.versions || []);
  const [aiAssisted, setAiAssisted] = useState(!!(existing?.ai_assisted || d0.ai_assisted));
  const hasSections = Object.values(sections).some((x) => x?.trim());
  const [view, setView] = useState(() => (edit || hasSections ? 'final' : 'notes'));
  const [writing, setWriting] = useState(null); // 'all' | section key
  const [orbError, setOrbError] = useState(null);
  const [sheet, setSheet] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const [signing, setSigning] = useState(false);
  const [removed, setRemoved] = useState([]); // the report's own files taken off, removed when it is saved
  const [run, busy] = useAction();

  const refsIn = (bs) => bs.flatMap((b) => b.items || []);
  const placedCount = refsIn(blocks).filter((r) => known[r]).length;
  const uploads = useUploads({ existingCount: placedCount, toast });
  const resolve = (ref) => {
    const u = uploads.items.find((x) => x.uid === ref);
    if (u) return u;
    return known[ref] ? { ...known[ref], status: 'done' } : {};
  };
  const files = refsIn(blocks).map((r) => ({ ref: r, ...resolve(r) }));
  const ready = files.filter((f) => f.key && f.status === 'done');
  const keys = ready.map((f) => f.key);

  // From the shift page: ?entry= links the report to a shift log note and starts from its words
  const entryId = edit ? null : sp.get('entry');
  useEffect(() => {
    if (!entryId || !sp.get('shift')) return;
    api('shifts.detail', { id: sp.get('shift') }).then((d) => {
      const e = d?.entries?.find((x) => x.id === entryId);
      if (e?.body) setBlocks((bs) => (bs.some((b) => b.kind === 'text' && b.text.trim()) ? bs : [textBlock(e.body), ...bs.filter((b) => b.kind !== 'text' || b.text.trim())]));
    }).catch(() => {});
  }, [entryId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Where the next photo, person or dictation goes: the last place the cursor was in the notes
  const cursor = useRef(null);
  const target = useRef(null);
  const cam = useRef(null);
  const lib = useRef(null);
  const doc = useRef(null);
  const pick = (e) => { const fl = [...(e.target.files || [])]; e.target.value = ''; if (fl.length) uploads.add(fl); };
  // New uploads land in the block they were added from, or a new one where the cursor is
  useEffect(() => {
    const placed = new Set(refsIn(blocks));
    const fresh = uploads.items.filter((x) => !placed.has(x.uid));
    if (!fresh.length) return;
    const t = target.current || { at: cursor.current };
    let out = blocks;
    for (const kind of ['photo', 'file']) {
      const refs = fresh.filter((x) => (kind === 'photo') === isImage(x.mime)).map((x) => x.uid);
      if (!refs.length) continue;
      if (t[kind] && out.some((b) => b.id === t[kind])) out = out.map((b) => (b.id === t[kind] ? { ...b, items: [...b.items, ...refs] } : b));
      else { const nb = { id: newId(), kind, items: refs }; t[kind] = nb.id; out = insertAt(out, t.at, [nb]); t.at = { id: nb.id }; }
    }
    target.current = t;
    setBlocks(out);
  }, [uploads.items]); // eslint-disable-line react-hooks/exhaustive-deps

  const setFact = (kind, on, at = cursor.current) => {
    setV((x) => ({ ...x, [FACT_KEY[kind]]: on }));
    setFilled((f) => { const n = new Set(f); n.delete(FACT_KEY[kind]); return n; });
    setBlocks((bs) => (on
      ? (bs.some((b) => b.kind === kind) ? bs : insertAt(bs, at, [{ id: newId(), kind }]))
      : (bs.filter((b) => b.kind !== kind).length ? bs.filter((b) => b.kind !== kind) : [textBlock()])));
  };
  const insert = (kind, at = cursor.current) => {
    if (view !== 'notes') setView('notes');
    if (['camera', 'photo', 'file'].includes(kind)) {
      target.current = { at };
      ({ camera: cam, photo: lib, file: doc })[kind].current?.click();
      return;
    }
    if (kind === 'person') { setBlocks((bs) => insertAt(bs, at, [blankPerson()])); return; }
    setFact(kind, true, at);
  };
  const removeRef = (ref) => {
    if (uploads.items.some((x) => x.uid === ref)) uploads.remove(ref);
    else if (known[ref]?.id) setRemoved((xs) => [...xs, known[ref]]);
  };
  // Dictation goes in at the cursor, or at the end of the notes
  const voice = (text) => {
    const at = cursor.current;
    setBlocks((bs) => {
      const i = at ? bs.findIndex((b) => b.id === at.id && b.kind === 'text') : -1;
      const j = i >= 0 ? i : bs.map((b) => b.kind).lastIndexOf('text');
      if (j < 0) return [...bs, textBlock(text)];
      const b = bs[j];
      const pos = i >= 0 ? Math.min(at.pos ?? b.text.length, b.text.length) : b.text.length;
      const head = b.text.slice(0, pos);
      const joined = `${head}${head && !/\s$/.test(head) ? ' ' : ''}${text}${b.text.slice(pos)}`;
      cursor.current = { id: b.id, pos: pos + joined.length - b.text.length };
      return bs.map((x, k) => (k === j ? { ...x, text: joined } : x));
    });
  };

  const notes = blocks.filter((b) => b.kind === 'text').map((b) => b.text.trim()).filter(Boolean).join('\n\n');
  const people = blocks.filter((b) => b.kind === 'person');
  const witnesses = people.filter((p) => p.name.trim()).map(({ name, contact, statement }) => ({ name: name.trim(), contact, statement }));
  const S = { ...sections, force_justification: v.force_justification };
  const setSection = (k, val) => (k === 'force_justification' ? setV((x) => ({ ...x, force_justification: val })) : setSections((s) => ({ ...s, [k]: val })));
  const serialBody = blocks.map((b) => (b.items ? { ...b, items: b.items.map((r) => resolve(r).key).filter(Boolean) } : b))
    .filter((b) => !b.items || b.items.length);
  const reportCaptions = Object.fromEntries(keys.filter((k) => captions[k]).map((k) => [k, captions[k]]));

  // Orb writes the report (or redoes one part) from the notes, people, facts and photos
  const write = async ({ section, instruction, answers } = {}) => {
    if (!section && !answers && hasSections && view === 'notes'
      && !(await confirm({ title: 'Write the report again?', body: 'Orb writes it fresh from your notes. Changes you made to the wording are replaced. Earlier versions are kept with the report.', confirm: 'Write it again' }))) return;
    setWriting(section || 'all');
    setOrbError(null);
    if (!section) setView('final');
    try {
      const r = await api('incidents.aiWrite', {
        notes, keys, captions: reportCaptions,
        people: people.map(({ name, role, contact, statement, injuries }) => ({ name, role, contact, statement, injuries })),
        chips: { type: v.type, severity: v.severity, occurred_at: w.at, location: v.location, police_called: v.police_called, police_ref: v.police_ref, ambulance_called: v.ambulance_called, ambulance_ref: v.ambulance_ref, force_used: v.force_used },
        shift_id: manager ? w.m.shift_id || undefined : w.shiftId || existing?.shift_id || undefined, occurred_at: w.at, incident_id: existing?.id,
        ...(section ? { section, instruction, current: S } : answers ? { answers, current: S } : {}),
      });
      const out = r.sections || {};
      setSections((s) => ({ ...s, ...Object.fromEntries(Object.keys(NO_SECTIONS).filter((k) => !section || k === section).map((k) => [k, out[k] || ''])) }));
      if (out.force_justification && (!section || section === 'force_justification')) setV((x) => ({ ...x, force_justification: out.force_justification }));
      setOrbVersions((vs) => [...vs, { at: new Date().toISOString(), sections: out }].slice(-10));
      setAiAssisted(true);
      if (!section) {
        setQuestions(r.questions || []);
        if (r.title) setTitle((t) => (t.trim() ? t : r.title));
        // Photos Orb placed: its caption unless the writer wrote one
        setCaptions((m) => ({ ...m, ...Object.fromEntries((r.photos || []).map((p) => [p.key, { caption: m[p.key]?.caption || p.caption || '', section: p.section || '' }])) }));
        // Facts Orb found fill only what is still empty, and carry a ✦ until someone checks them
        const c = r.chips || {};
        const got = CHIP_KEYS.filter((k) => c[k] && c[k].value !== undefined && (typeof v[k] === 'boolean' ? !v[k] && c[k].value === true : !v[k]));
        got.forEach((k) => { if (FACT_OF[k]) setFact(FACT_OF[k], true, null); });
        setV((x) => ({ ...x, ...Object.fromEntries(got.filter((k) => typeof x[k] !== 'boolean').map((k) => [k, String(c[k].value)])) }));
        setFilled((f) => new Set([...f, ...got]));
      }
    } catch (e) {
      if (section) toast(e.message, 'error'); else setOrbError(e.message);
    }
    setWriting(null);
  };
  const confirmChip = (k) => setFilled((f) => { if (!f.has(k)) return f; const n = new Set(f); n.delete(k); return n; });

  // Each gap points at what fixes it
  const focusSection = (label) => () => { setView('final'); setTimeout(() => document.querySelector(`textarea[aria-label="${label}"]`)?.focus(), 60); };
  const problems = [
    (!v.type || !v.severity) && { text: 'Choose what happened and how serious it was', fix: () => setSheet(v.type ? 'severity' : 'type') },
    !S.what.trim() && { text: 'Describe what happened', fix: focusSection('What happened') },
    (!w.at || w.future) && { text: !w.at ? 'Add the time it happened' : 'The time cannot be in the future', fix: () => setSheet('when') },
    !edit && !manager && !w.shift && { text: 'Choose the shift you were working', fix: () => setSheet('when') },
    manager && !w.m.venue_id && { text: 'Choose the venue', fix: () => setSheet('when') },
    w.outsideShift && { text: 'The time must be within 2 hours of your shift', fix: () => setSheet('when') },
    w.tooOld && { text: `Officers can report up to ${BACKDATE_DAYS} days back. Ask the office for anything older.`, fix: () => setSheet('when') },
    v.force_used && !v.force_justification.trim() && { text: 'Explain why force was necessary', fix: focusSection('Why force was necessary') },
    uploads.uploading && { text: 'Wait for your files to finish uploading', fix: () => setView('notes') },
    uploads.items.some((x) => x.status === 'error') && { text: 'Remove the files that failed to upload', fix: () => setView('notes') },
  ].filter(Boolean);

  // Drafts: new reports save as they are written, once there is something worth keeping
  const meaningful = !!(title.trim() || v.type || v.location.trim() || notes || people.length || files.length || hasSections);
  const draft = useIncidentDraft({ id: draftId, version: initial?.version, enabled: !edit, onCreated });
  const snapshot = {
    data: {
      ...v, title, body: serialBody, notes, witnesses, captions: reportCaptions, ai_assisted: aiAssisted, when: w.when,
      description: S.what, people_involved: S.people, injuries: S.injuries, actions_taken: S.actions,
      orb: { sections, questions, filled: [...filled], versions: orbVersions.slice(-3) },
      ...(manager ? { manager: w.m } : { shift_id: w.shiftId || '' }),
    },
    attachments: ready.map(({ key, mime, name }) => ({ key, mime, name })), step: 0,
  };
  const snapKey = JSON.stringify(snapshot);
  const first = useRef(!initial?.unsynced);
  useEffect(() => {
    if (edit || !meaningful) return;
    // Opening a saved draft is not a change; a phone copy that never synced is sent straight away
    if (first.current) { first.current = false; if (initial) return; }
    draft.save(snapshot);
  }, [snapKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = async () => {
    if (!edit && meaningful) { await draft.flush(); toast('Draft saved. Finish it from Incidents.'); }
    nav(edit ? `${base}/incidents/${existing.id}` : `${base}/incidents`);
  };

  const payload = () => ({
    ...v, occurred_at: w.at, title: title.trim(), notes, body: serialBody, captions: reportCaptions, ai_assisted: aiAssisted, orb_versions: orbVersions,
    description: S.what.trim() || notes, people_involved: S.people, injuries: S.injuries, actions_taken: S.actions,
    force_justification: v.force_used ? v.force_justification : '', police_ref: v.police_called ? v.police_ref : '', ambulance_ref: v.ambulance_called ? v.ambulance_ref : '',
    witnesses,
  });
  // Edits send only the files added since; ones taken off are removed first
  const saveEdit = async () => {
    for (const a of removed) await api('incidents.removeAttachment', { id: a.id });
    const added = ready.filter((f) => !known[f.key]).map(({ key, mime, name }) => ({ key, mime, name }));
    return api('incidents.update', { id: existing.id, ...payload(), attachments: added });
  };
  const done = (id, msg) => { toast(msg); nav(`${base}/incidents/${id}`, { replace: true }); };

  // Who does what when the report is finished
  const stage = existing?.sign_stage;
  const mode = !edit ? (manager ? 'manager_new' : 'officer_new')
    : user.role !== 'officer' ? 'manager_edit'
      : stage ? 'officer_sign' : 'legacy';
  const cta = { officer_new: 'Approve & sign', officer_sign: 'Approve & sign', manager_new: 'Sign & send to venue', manager_edit: 'Save changes', legacy: 'Resubmit' }[mode];
  const finish = async () => {
    if (problems.length) { toast(problems[0].text, 'error'); problems[0].fix(); return; }
    if (mode === 'officer_new' || mode === 'officer_sign' || mode === 'manager_new') { setSigning(true); return; }
    if (mode === 'manager_edit' && stage && !(await confirm({ title: 'Save your changes?', body: 'The officer signed the report as it was, so they are asked to check your changes and sign again.', confirm: 'Save changes' }))) return;
    run(async () => { await saveEdit(); return existing; }, mode === 'legacy' ? 'Report updated and resubmitted' : undefined)
      .then(() => (mode === 'legacy' ? nav(`${base}/incidents/${existing.id}`, { replace: true }) : done(existing.id, stage ? 'Changes saved. The officer is asked to sign again' : 'Changes saved')))
      .catch(() => {});
  };
  const sign = ({ png, use_saved, statement }) => run(async () => {
    if (mode === 'officer_sign') {
      await saveEdit();
      await api('incidents.sign', { id: existing.id, png });
      return existing;
    }
    // Any save still queued is dropped: the report replaces the draft
    await draft.flush();
    const body = { ...payload(), attachments: ready.map(({ key, mime, name }) => ({ key, mime, name })), draft_id: draft.id || undefined, signature: { png, use_saved } };
    const inc = manager
      ? await api('incidents.create', { ...body, venue_id: w.m.venue_id, shift_id: w.m.shift_id || undefined, officer_id: w.m.officer_id || undefined, ...(statement ? { statement } : {}) })
      : await api('incidents.create', { ...body, shift_id: w.shift.id, venue_id: w.shift.venue_id, log_entry_id: entryId || undefined });
    draft.stop();
    return inc;
  }).then((inc) => { setSigning(false); done(inc.id, manager ? 'Signed and sent to the venue' : 'Signed and sent to your manager'); }).catch(() => {});

  const photos = files.filter((f) => isImage(f.mime) && f.url);
  const open = (x) => {
    const i = photos.findIndex((p) => p.ref === x.ref || (x.key && p.key === x.key));
    if (i >= 0) setLightbox(i); else if (x.url) window.open(x.url, '_blank', 'noopener');
  };
  const back = edit ? { to: `${base}/incidents/${existing.id}`, label: existing.reference || existing.ref } : { to: `${base}/incidents`, label: 'Incidents' };
  const canOrb = (notes.length > 0 || keys.length > 0) && !uploads.uploading && !writing;
  const titleRef = useRef(null);

  return (
    <Page title={edit ? `Edit ${existing.reference || existing.ref}` : 'Report incident'} back={back}>
      <div className="mx-auto w-full max-w-2xl">
        {draft.status === 'conflict' && (
          <Callout tone="warning" className="mb-3" title="This draft was updated on another device"
            action={<Button size="sm" variant="secondary" onClick={() => window.location.reload()}>Reload</Button>}>Reload to carry on from the newest copy.</Callout>
        )}
        {edit && user.role === 'officer' && stage === 'officer' && (
          <div className="mb-4 flex gap-2.5 rounded-2xl bg-amber-soft px-4 py-3 text-amber anim-fade-in">
            <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
            <div className="min-w-0">
              <div className="text-subhead font-bold">{existing.resign_reason === 'edited' ? `${existing.reviewed_by_name || 'Your manager'} edited your report` : `${existing.reviewed_by_name || 'Your manager'} sent this back`}</div>
              <p className="whitespace-pre-line text-subhead text-ink/80">
                {existing.resign_reason === 'edited' ? 'Read it through. If it is still a true account, sign it again. Change anything that is not right first.' : existing.review_comment || 'Add what is missing, then sign it again.'}
              </p>
            </div>
          </div>
        )}
        {edit && user.role === 'officer' && !stage && existing.review_comment && existing.status === 'changes_requested' && (
          <Callout tone="warning" className="mb-4" title={`${existing.reviewed_by_name || 'Your manager'} asked for changes`}><span className="whitespace-pre-line">{existing.review_comment}</span></Callout>
        )}
        {mode === 'manager_edit' && stage && (
          <Callout tone="info" className="mb-4" title="Editing the officer's report">When you save, their signature no longer applies and they are asked to check your changes and sign again.</Callout>
        )}

        <div className="mb-2 flex min-h-9 items-center justify-between gap-3">
          {!edit ? <SaveStatus draft={draft} meaningful={meaningful} /> : <span className="text-footnote text-muted">{existing.venue_name}</span>}
          {(hasSections || writing || view === 'final') && (
            <Segmented value={view} onChange={setView} iconOnly="phone"
              options={[{ value: 'notes', label: 'Notes', icon: NotebookPen }, { value: 'final', label: 'Report', icon: FilePen }]} />
          )}
        </div>

        <Prose inputRef={(el) => { titleRef.current = el; }} value={title} onChange={(e) => setTitle(e.target.value.replace(/\n/g, ' '))} aria-label="Title"
          placeholder={v.type ? `${typeLabel(v.type)}${w.venueName ? ` at ${w.venueName}` : ''}` : 'Untitled incident'} maxLength={200}
          onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }} className="display !text-title2 font-bold !leading-tight" />
        <div className="mt-3">
          <Props v={v} setV={setV} w={w} edit={edit} existing={existing} manager={manager} filled={filled} confirm={confirmChip} sheet={sheet} setSheet={setSheet} setFact={setFact} />
        </div>
        <div className="my-4 h-px bg-hairline" aria-hidden />

        <input ref={cam} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
        <input ref={lib} type="file" accept="image/*" multiple hidden onChange={pick} />
        <input ref={doc} type="file" accept={DOC_ACCEPT} multiple hidden onChange={pick} />

        {view === 'notes' ? (
          <div key="notes" className="anim-fade-in">
            <Blocks blocks={blocks} setBlocks={setBlocks} v={v} setV={setV} setFact={setFact} resolve={resolve} captions={captions}
              onOpen={open} onEditPhoto={setPhoto} onRemoveRef={removeRef} onAddTo={(b) => { target.current = { at: { id: b.id }, photo: b.id }; lib.current?.click(); }}
              onInsert={insert} onCursor={(c) => { cursor.current = c; }}
              placeholder={'Write what happened in your own words: times, what you saw and heard, who did what. Rough is fine. Add photos and people as you go, then tap Orb to write the report.'} />
            <p className="mt-3 text-caption text-faint">{files.length ? `${files.length} of ${MAX_FILES} files · ` : ''}Never photograph children.</p>
            <InsertBar onInsert={insert} onVoice={voice} disabled={busy} active={FACTS.filter((k) => v[FACT_KEY[k]])}>
              <Button size="sm" icon={Sparkles} className="!h-10 shrink-0 rounded-full" disabled={!canOrb} onClick={() => write()} aria-label="Orb, write the report">Orb</Button>
            </InsertBar>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              {hasSections
                ? <Button variant="link" onClick={() => setView('final')}>See the report</Button>
                : <Button variant="link" onClick={() => { setSections((s) => ({ ...s, what: s.what || notes })); setView('final'); }}>Write the report myself</Button>}
              {!edit && meaningful && <Button variant="link" icon={Save} onClick={close}>Save and close</Button>}
            </div>
          </div>
        ) : (
          <div key="final">
            <OrbWrite sections={S} setSection={setSection} questions={questions} writing={writing} error={orbError}
              onWriteSelf={() => { setOrbError(null); setSections((s) => ({ ...s, what: s.what || notes })); }}
              onRedo={(section, instruction) => write({ section, instruction })} onAnswer={(answers) => write({ answers })}
              photos={ready} captions={captions} onPhoto={setPhoto} onOpen={open} force={v.force_used} problems={problems} onBack={() => setView('notes')} />
            {aiAssisted && !writing && !orbError && <p className="mt-5 flex items-center gap-1.5 text-footnote text-muted"><Sparkles size={14} className="text-blue" aria-hidden />Written with Orb from your notes. You sign it as your own account, so change anything that is not right.</p>}
            {!writing && !orbError && (
              <div className={cx('sticky bottom-[calc(var(--tabbar-h)+12px)] z-10 mt-6 flex gap-3 rounded-tile bg-bg/90 py-2 backdrop-blur lg:bottom-4', keyboard && 'hidden')}>
                <Button size="lg" variant="secondary" className="flex-1" icon={edit || !meaningful ? X : NotebookPen} disabled={busy} onClick={edit ? close : () => setView('notes')}>{edit ? 'Close' : 'Notes'}</Button>
                <Button size="lg" className="flex-[2]" icon={mode.endsWith('edit') || mode === 'legacy' ? undefined : FileSignature} busy={busy && !signing} disabled={!!writing} onClick={finish}>{cta}</Button>
              </div>
            )}
          </div>
        )}
      </div>

      <PhotoSheet photo={photo} captions={captions} setCaptions={setCaptions} onClose={() => setPhoto(null)} onOpen={(p) => { setPhoto(null); open(p); }} sections={view === 'final'} />
      <Lightbox photos={photos.map((p) => ({ url: p.url, name: p.name, caption: captions[p.key]?.caption }))} index={lightbox} onClose={() => setLightbox(null)} />
      <SignSheet open={signing} onClose={() => !busy && setSigning(false)} role={mode === 'manager_new' ? 'manager' : 'officer'} busy={busy} onSign={sign}
        note={mode === 'manager_new' ? <p className="text-subhead text-muted">You are filing and signing this as the manager, so it goes straight to the venue to sign.</p> : null} />
    </Page>
  );
}

const SAVE_TEXT = { saving: 'Saving…', offline: 'Saved on this phone, will sync', error: 'Couldn’t save, trying again', conflict: 'Not saved' };
function SaveStatus({ draft, meaningful }) {
  const text = draft.status === 'saved' && draft.savedAt ? `Draft saved ${time(draft.savedAt)}` : SAVE_TEXT[draft.status] || (meaningful ? 'Saving as you go' : 'Your draft saves as you write');
  return (
    <span aria-live="polite" className={cx('inline-flex min-w-0 items-center gap-1.5 truncate text-footnote', draft.status === 'offline' || draft.status === 'error' ? 'text-amber' : 'text-muted')}>
      {draft.status === 'offline' ? <CloudOff size={14} aria-hidden /> : draft.status === 'saved' ? <CheckCircle2 size={14} aria-hidden /> : <Cloud size={14} aria-hidden />}{text}
    </span>
  );
}

