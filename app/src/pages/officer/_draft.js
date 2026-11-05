// Incident report drafts: saved to the server as the writer goes (private to them), with a copy on the phone for when signal drops
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, API_BASE, getSide, getToken } from '../../api.js';

const KEY = 'orb.incidentDraft.';
const DAYS30 = 30 * 86400000;

export function readLocal(id) {
  try {
    const x = JSON.parse(localStorage.getItem(KEY + (id || 'new')) || 'null');
    return x && Date.now() - x.at < DAYS30 ? x : null;
  } catch { return null; }
}
const writeLocal = (id, snapshot) => { try { localStorage.setItem(KEY + (id || 'new'), JSON.stringify({ at: Date.now(), snapshot })); } catch { /* storage full */ } };
export const clearLocal = (id) => { try { localStorage.removeItem(KEY + (id || 'new')); if (id) localStorage.removeItem(`${KEY}new`); } catch { /* ignore */ } };

/**
 * save(snapshot) queues { data, attachments, step } and sends it 800 ms after the last change; flush() sends it now.
 * status: idle | saving | saved | offline | error | conflict. A conflict carries the server copy in `conflict`.
 */
export function useIncidentDraft({ id: initialId, version: initialVersion, enabled = true, onCreated }) {
  const [id, setId] = useState(initialId || null);
  const [status, setStatus] = useState('idle');
  const [savedAt, setSavedAt] = useState(null);
  const [conflict, setConflict] = useState(null);
  const r = useRef({ id: initialId || null, version: initialVersion ?? null, pending: null, timer: null, inFlight: false, again: false, seq: 0, stopped: false });

  const flush = useCallback(async () => {
    const s = r.current;
    clearTimeout(s.timer);
    if (!s.pending || s.stopped) return;
    if (s.inFlight) { s.again = true; return; }
    if (!navigator.onLine) { setStatus('offline'); return; }
    const snap = s.pending;
    s.pending = null;
    s.inFlight = true;
    const seq = ++s.seq;
    setStatus('saving');
    try {
      const res = await api('incidents.draftSave', { id: s.id || undefined, version: s.id ? s.version : undefined, ...snap });
      if (s.stopped) return;
      s.version = res.version;
      if (!s.id) { s.id = res.id; setId(res.id); clearLocal(null); onCreated?.(res.id); }
      if (!s.pending) clearLocal(s.id);
      if (seq === s.seq) { setStatus('saved'); setSavedAt(res.updated_at); }
    } catch (e) {
      if (e.status === 409) { s.stopped = true; setConflict(e.data?.draft || {}); setStatus('conflict'); return; }
      // Keep the newest copy queued and try again when the signal is back
      s.pending = s.pending || snap;
      setStatus(e.status === 0 ? 'offline' : 'error');
      if (e.status !== 0) s.timer = setTimeout(flush, 15000);
    } finally {
      s.inFlight = false;
      if (s.again && !s.stopped) { s.again = false; flush(); }
    }
  }, [onCreated]);

  const save = useCallback((snapshot) => {
    const s = r.current;
    if (!enabled || s.stopped) return;
    s.pending = snapshot;
    writeLocal(s.id, snapshot);
    clearTimeout(s.timer);
    s.timer = setTimeout(flush, 800);
  }, [enabled, flush]);

  // Leaving the page: send what is queued even as the tab closes (only for a draft the server already has)
  useEffect(() => {
    const out = () => {
      const s = r.current;
      if (!s.pending || !s.id || s.stopped || s.inFlight) return;
      const body = JSON.stringify({ action: 'incidents.draftSave', id: s.id, version: s.version, ...s.pending, ...(getSide() === 'officer' ? { _as: 'officer' } : {}) });
      try {
        fetch(API_BASE, { method: 'POST', keepalive: true, headers: { 'content-type': 'application/json', authorization: `Bearer ${getToken()}` }, body });
        s.pending = null;
        s.version += 1;
      } catch { /* the phone copy is kept */ }
    };
    const vis = () => { if (document.visibilityState === 'hidden') out(); };
    const online = () => flush();
    window.addEventListener('pagehide', out);
    document.addEventListener('visibilitychange', vis);
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('pagehide', out);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('online', online);
      flush();
    };
  }, [flush]);

  // Submitted or discarded: stop saving and forget the phone copy
  const stop = useCallback(() => { const s = r.current; s.stopped = true; s.pending = null; clearTimeout(s.timer); clearLocal(s.id); }, []);
  const remove = useCallback(async () => {
    const s = r.current;
    stop();
    if (s.id) await api('incidents.draftDelete', { id: s.id });
  }, [stop]);

  return { id, status, savedAt, conflict, save, flush, stop, remove };
}
