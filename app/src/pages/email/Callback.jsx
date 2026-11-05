import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail } from 'lucide-react';
import { Button, Empty, Spinner, useToast } from '../../ui/index.jsx';
import { api } from '../../api.js';
import { emailChanged } from './_parts.jsx';

/** Google / Microsoft send the person back here after signing in; the code is swapped for the mailbox on the server. */
export default function Callback() {
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const [error, setError] = useState(null);
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const state = sp.get('state');
    if (!state) { setError('This page is only used when connecting a mailbox.'); return; }
    api('email.connectFinish', { state, code: sp.get('code') || undefined, error: sp.get('error') || undefined, error_description: sp.get('error_description') || undefined })
      .then((acc) => {
        toast(`${acc.address} connected`);
        emailChanged();
        nav(`/company/email?a=${acc.id}`, { replace: true });
      })
      .catch((e) => setError(e.message));
  }, [sp, nav, toast]);
  if (!error) return <Spinner className="py-24" />;
  return (
    <div className="mx-auto w-full max-w-xl px-4 py-10">
      <Empty icon={Mail} title="The mailbox was not connected" body={error}
        action={<Button to="/company/settings?tab=email">Back to email settings</Button>} />
    </div>
  );
}
