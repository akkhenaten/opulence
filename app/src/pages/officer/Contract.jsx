import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Download, Eraser, FileSignature } from 'lucide-react';
import { api, downloadAction } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { Button, dateTime, Input, Load, Page, Pill, Toggle, useAction, useApi, useToast } from '../../ui/index.jsx';

export default function Contract() {
  const { id } = useParams();
  const q = useApi('contracts.get', { id });
  const [run, busy] = useAction();
  const pdf = () => run(() => downloadAction('contracts.pdf', { id })).catch(() => {});
  return (
    <Page title="Contract" back={{ to: '/officer/me', label: 'Me' }}
      actions={q.data && <Button variant="secondary" icon={Download} busy={busy} onClick={pdf}>PDF</Button>}>
      <Load q={q}>
        {(c) => (
          <div className="space-y-3">
            <div className="rounded-tile bg-surface p-5 shadow-tile">
              <div className="flex items-start justify-between gap-3">
                <h2 className="display text-[22px] font-bold leading-tight">{c.title}</h2>
                <Pill status={c.status === 'sent' ? 'pending' : c.status}>{c.status === 'sent' ? 'To sign' : c.status === 'void' ? 'Void' : 'Signed'}</Pill>
              </div>
              <div className="mt-4 max-h-[55vh] overflow-y-auto whitespace-pre-line rounded-2xl bg-bg p-4 text-[14px] leading-relaxed">{c.body}</div>
            </div>
            {c.status === 'signed' && <Signed c={c} />}
            {c.status === 'void' && <div className="rounded-2xl bg-bg px-4 py-3 text-[14px] text-muted">This contract has been withdrawn by the office and no longer needs signing.</div>}
            {c.status === 'sent' && <SignForm id={id} onSigned={q.reload} />}
          </div>
        )}
      </Load>
    </Page>
  );
}

function Signed({ c }) {
  return (
    <div className="rounded-tile bg-surface p-5 shadow-tile">
      <div className="flex items-center gap-2 font-semibold text-green"><CheckCircle2 size={20} />Signed</div>
      {c.signature && <img src={c.signature} alt="Your signature" className="mt-3 h-28 w-full rounded-2xl bg-bg object-contain p-2" />}
      <div className="mt-2 text-[14px] text-muted">{c.signed_name} · {dateTime(c.signed_at)}</div>
    </div>
  );
}

function SignForm({ id, onSigned }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const toast = useToast();
  const [name, setName] = useState(user.name || '');
  const [agree, setAgree] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  const pad = useRef(null);
  const [run, busy] = useAction();
  const ok = name.trim().length > 2 && agree && hasInk;

  const sign = () => {
    const signature = pad.current?.toDataURL();
    if (!signature) { toast('Please sign in the box', 'error'); return; }
    run(() => api('contracts.sign', { id, signature, signed_name: name.trim() }), 'Contract signed. Thank you.')
      .then(() => { onSigned(); nav('/officer/me'); }).catch(() => {});
  };

  return (
    <div className="rounded-tile bg-surface p-5 shadow-tile">
      <div className="mb-3 flex items-center gap-2 text-[17px] font-bold"><FileSignature size={20} className="text-blue" />Sign this contract</div>
      <Input label="Full name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      <div className="mt-4 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-muted">Signature</span>
        <Button variant="ghost" size="sm" icon={Eraser} disabled={!hasInk} onClick={() => pad.current?.clear()}>Clear</Button>
      </div>
      <SignaturePad handle={pad} onInk={setHasInk} />
      <div className="mt-4 rounded-2xl bg-bg px-3">
        <Toggle checked={agree} onChange={setAgree} label="I have read and agree to this contract" hint="Your signature, name, time and IP address are recorded." />
      </div>
      <Button size="lg" className="mt-4 w-full" busy={busy} disabled={!ok} onClick={sign}>Sign contract</Button>
    </div>
  );
}

// Canvas signature pad (touch, pen and mouse via pointer events)
function SignaturePad({ handle: outer, onInk }) {
  const canvas = useRef(null);
  const drawing = useRef(false);
  const last = useRef(null);
  const ink = useRef(false);

  const setup = () => {
    const c = canvas.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.lineWidth = 2.6;
    g.strokeStyle = '#0B1220';
    ink.current = false;
    onInk(false);
  };

  useEffect(() => {
    setup();
    const ro = new ResizeObserver(() => { if (!ink.current) setup(); });
    ro.observe(canvas.current);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Expose clear() and toDataURL() to the parent
  useEffect(() => {
    if (!outer) return;
    outer.current = {
      clear: setup,
      toDataURL: () => {
        if (!ink.current) return null;
        const c = canvas.current;
        let out = c.toDataURL('image/png');
        // Keep under the 400k character server limit by downscaling if needed
        let scale = 1;
        while (out.length > 380000 && scale > 0.2) {
          scale *= 0.7;
          const t = document.createElement('canvas');
          t.width = Math.round(c.width * scale);
          t.height = Math.round(c.height * scale);
          t.getContext('2d').drawImage(c, 0, 0, t.width, t.height);
          out = t.toDataURL('image/png');
        }
        return out;
      },
    };
  });

  const pt = (e) => {
    const r = canvas.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const down = (e) => {
    e.preventDefault();
    canvas.current.setPointerCapture?.(e.pointerId);
    drawing.current = true;
    last.current = pt(e);
    const g = canvas.current.getContext('2d');
    g.beginPath();
    g.arc(last.current.x, last.current.y, 1.2, 0, Math.PI * 2);
    g.fillStyle = '#0B1220';
    g.fill();
    if (!ink.current) { ink.current = true; onInk(true); }
  };
  const move = (e) => {
    if (!drawing.current) return;
    e.preventDefault();
    const g = canvas.current.getContext('2d');
    const events = e.nativeEvent.getCoalescedEvents?.() || [e.nativeEvent];
    for (const ev of events) {
      const p = pt(ev);
      g.beginPath();
      g.moveTo(last.current.x, last.current.y);
      g.lineTo(p.x, p.y);
      g.stroke();
      last.current = p;
    }
  };
  const up = () => { drawing.current = false; };

  return (
    <div className="relative">
      <canvas ref={canvas} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up}
        className="block h-44 w-full cursor-crosshair touch-none rounded-2xl border-2 border-dashed border-line bg-bg" aria-label="Signature pad" />
      <div className="pointer-events-none absolute inset-x-6 bottom-9 border-b border-faint/60" />
      <div className="pointer-events-none absolute bottom-3 left-6 text-[12px] text-faint">Sign above the line</div>
    </div>
  );
}
