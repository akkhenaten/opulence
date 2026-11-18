// The Add to calendar button in a meeting email: hand the signed link to the API, which answers with the .ics file
import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CalendarPlus } from 'lucide-react';
import { API_BASE } from '../../api.js';
import { Button } from '../../ui/index.jsx';

export default function IcsLink() {
  const { token } = useParams();
  const href = `${API_BASE}?ics=${encodeURIComponent(token)}`;
  useEffect(() => { window.location.replace(href); }, [href]);
  return (
    <div className="grid min-h-dvh place-items-center bg-bg p-6 text-center">
      <div className="max-w-sm space-y-3">
        <CalendarPlus size={32} className="mx-auto text-blue" />
        <h1 className="text-title3 font-semibold">Adding to your calendar…</h1>
        <p className="text-subhead text-muted">If nothing opens, tap below. Outlook, Apple and Google Calendar all take this file.</p>
        <Button icon={CalendarPlus} href={href}>Download the meeting</Button>
      </div>
    </div>
  );
}
