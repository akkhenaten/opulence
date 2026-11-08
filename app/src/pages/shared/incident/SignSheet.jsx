// Signing an incident report: the officer approves their account, the manager reviews it, the venue receives it.
// One sheet for all three; managers can use the signature they saved under E-sign instead of drawing it again.
import { useEffect, useRef, useState } from 'react';
import { Eraser, FileSignature } from 'lucide-react';
import { useAuth } from '../../../auth.jsx';
import { Button, Sheet, Textarea, Toggle, useApi, useToast } from '../../../ui/index.jsx';
import { SignaturePad } from '../../../ui/SignaturePad.jsx';

const COPY = {
  officer: {
    title: 'Approve & sign', cta: 'Sign and send',
    consent: 'I confirm this is a true and accurate account',
    hint: 'Your report goes to your manager to sign. Your name, signature and the time are recorded with it.',
  },
  manager: {
    title: 'Sign as manager', cta: 'Sign and send to the venue',
    consent: 'Reviewed and approved',
    hint: 'The report goes to the venue to sign. Your name, signature and the time are recorded with it.',
  },
  venue: {
    title: 'Sign as the venue', cta: 'Sign',
    consent: 'Received and read',
    hint: 'This completes the report. Your name, signature and the time are recorded with it.',
  },
};

/** onSign({ png, use_saved, statement, comment }) returns a promise; the sheet stays open until it settles. */
export function SignSheet({ open, onClose, role, onSign, busy, note }) {
  const { user } = useAuth();
  const toast = useToast();
  const c = COPY[role] || COPY.officer;
  const pad = useRef(null);
  const [ink, setInk] = useState(false);
  const [agree, setAgree] = useState(false);
  const [text, setText] = useState('');
  // Managers sign with their saved signature unless they choose to draw it
  const savedQ = useApi('esign.mySignature.get', {}, { skip: !open || role !== 'manager' });
  const saved = savedQ.data?.signature;
  const [useSaved, setUseSaved] = useState(true);
  useEffect(() => { if (open) { setAgree(false); setText(''); setInk(false); } }, [open]);
  const drawn = !(saved && useSaved);
  const ok = agree && (!drawn || ink);

  const go = () => {
    const png = drawn ? pad.current?.toDataURL() : null;
    if (drawn && !png) { toast('Please sign in the box', 'error'); return; }
    onSign({
      png: png || undefined, use_saved: !drawn || undefined,
      ...(role === 'manager' && text.trim() ? { statement: text.trim() } : {}),
      ...(role === 'venue' && text.trim() ? { comment: text.trim() } : {}),
    });
  };

  return (
    <Sheet open={open} onClose={onClose} title={c.title} size="md"
      footer={<Button size="lg" className="w-full" icon={FileSignature} busy={busy} disabled={!ok} onClick={go}>{c.cta}</Button>}>
      <div className="space-y-4">
        {note}
        {role === 'manager' && (
          <Textarea label="Your statement (optional)" autoGrow minRows={2} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="Anything you saw, did or followed up, in your own words. It is added to the report under your name." />
        )}
        {role === 'venue' && (
          <Textarea label="Comment (optional)" autoGrow minRows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. CCTV kept, person added to the venue's ban list" />
        )}

        <div>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="text-footnote font-semibold text-muted">Signing as</div>
              <div className="truncate text-body font-semibold">{saved?.name || user?.name}{saved?.title ? ` · ${saved.title}` : ''}</div>
            </div>
            {drawn && <Button variant="ghost" size="sm" icon={Eraser} disabled={!ink} onClick={() => pad.current?.clear()}>Clear</Button>}
          </div>
          {saved && (
            <div className="mt-2 rounded-2xl bg-bg px-3">
              <Toggle checked={useSaved} onChange={setUseSaved} label="Use my saved signature" hint="The one you keep under E-sign" />
            </div>
          )}
          <div className="mt-2">
            {drawn
              ? <SignaturePad handle={pad} onInk={setInk} className="[&_canvas]:h-44 sm:[&_canvas]:h-52" />
              : <div className="grid h-28 place-items-center rounded-2xl border border-hairline bg-white anim-fade-in"><img src={saved.png} alt="Your saved signature" className="max-h-24 max-w-[80%] object-contain" /></div>}
          </div>
        </div>

        <div className="rounded-2xl bg-bg px-3">
          <Toggle checked={agree} onChange={setAgree} label={c.consent} hint={c.hint} />
        </div>
      </div>
    </Sheet>
  );
}
