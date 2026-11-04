import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Nfc } from 'lucide-react';
import { api, setAfterLogin } from '../../api.js';
import { HOME, useAuth } from '../../auth.jsx';
import { Button, Spinner } from '../../ui/index.jsx';
import { AuthCard } from '../auth/AuthPages.jsx';

// An NFC tag at a venue opens /t?p=…&c=… on the phone. Officers go on to clock in with the tag counted;
// a manager pairing a tag sees it linked to the venue.
export default function TagTap() {
  const { user, ready } = useAuth();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const [st, setSt] = useState({ loading: true });
  const sent = useRef(false);
  const p = sp.get('p');
  const c = sp.get('c');

  useEffect(() => {
    if (!ready || !user || sent.current) return;
    sent.current = true;
    if (!p || !c) { setSt({ error: 'This tag link is incomplete. Tap the tag again, or scan the QR code.' }); return; }
    api('clock.tagTap', { p, c })
      .then((r) => {
        if (r.tap_id) nav(`/officer/clock?tap=${r.tap_id}`, { replace: true });
        else setSt({ result: r });
      })
      .catch((e) => setSt({ error: e.message }));
  }, [ready, user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ready) return <Spinner className="min-h-dvh" />;
  if (!user) {
    setAfterLogin(`/t?${sp.toString()}`);
    return <Navigate to="/login" replace />;
  }
  const r = st.result;
  const venueLink = r && `${HOME[user.role]}/venues/${r.venue_id}?tab=codes`;
  return (
    <AuthCard title={st.loading ? 'Checking the tag…' : st.error ? 'Tag not accepted' : r.paired ? 'Tag paired' : 'Tag works'}>
      <div className="flex flex-col items-center text-center">
        <div className={`grid h-24 w-24 place-items-center rounded-full ${st.error ? 'bg-red-soft text-red' : st.loading ? 'bg-blue-soft text-blue' : 'bg-green-soft text-green'}`}>
          {st.loading ? <Nfc size={42} className="animate-pulse" /> : st.error ? <AlertTriangle size={42} /> : <CheckCircle2 size={44} />}
        </div>
        {st.error && <p className="mt-4 text-body font-semibold">{st.error}</p>}
        {r?.paired && <p className="mt-4 text-body">{r.tag.label} is now linked to <b>{r.venue_name}</b>. Officers can tap it to clock in.</p>}
        {r?.checked && <p className="mt-4 text-body">{r.tag.label} at <b>{r.venue_name}</b> is working.</p>}
      </div>
      <div className="mt-6 grid gap-2">
        {user.role === 'officer' && st.error && <Button size="lg" to="/officer/clock">Clock in with the QR code</Button>}
        {r && <Button size="lg" to={venueLink}>Open {r.venue_name}</Button>}
        <Button variant="ghost" to={HOME[user.role]}>Home</Button>
      </div>
    </AuthCard>
  );
}
