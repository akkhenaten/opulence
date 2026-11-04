// Talking to Orb: the mic button (dictate into the typing box) and the hands-free conversation view.
// Audio never leaves the browser except to be turned into text; nothing is recorded or kept.
import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, PhoneOff, Square } from 'lucide-react';
import { api, upload } from '../api.js';
import { Button, cx, IconButton, useToast } from './index.jsx';
import OrbMark from './OrbMark.jsx';

const SDK = 'https://openkbs.com/sdk/live.esm.js';
const MAX_CLIP_S = 60;
const SILENCE_WARN_MS = 110000;
const SILENCE_END_MS = 125000;

export const canRecord = () => typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder !== 'undefined';

const micError = (e) => (e?.name === 'NotAllowedError' || e?.name === 'SecurityError'
  ? 'The microphone is blocked. Allow it for this site in your browser settings, then try again.'
  : e?.name === 'NotFoundError' ? 'No microphone found on this device.' : e?.message || 'The microphone could not start.');

const clock = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Live input level 0..1 for a stream, read on every animation frame
function useLevel(stream) {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    if (!stream) { setLevel(0); return undefined; }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(an);
    const buf = new Uint8Array(an.fftSize);
    let raf;
    const tick = () => {
      an.getByteTimeDomainData(buf);
      let peak = 0;
      for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
      setLevel(Math.min(1, peak / 64));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => { cancelAnimationFrame(raf); ctx.close().catch(() => {}); };
  }, [stream]);
  return level;
}

/** Tap to start, tap again to stop (or hold and let go). The words go into the typing box; nothing is sent. */
export function MicButton({ onText, disabled }) {
  const toast = useToast();
  const [state, setState] = useState('idle'); // idle | rec | busy
  const [stream, setStream] = useState(null);
  const [secs, setSecs] = useState(0);
  const rec = useRef(null);
  const downAt = useRef(0);
  const cancelled = useRef(false);
  const level = useLevel(stream);

  const release = () => { rec.current?.stream?.getTracks().forEach((t) => t.stop()); setStream(null); };
  useEffect(() => () => { cancelled.current = true; if (rec.current?.state === 'recording') rec.current.stop(); release(); }, []);
  useEffect(() => {
    if (state !== 'rec') return undefined;
    const t = setInterval(() => setSecs((s) => { if (s + 1 >= MAX_CLIP_S) stop(); return s + 1; }), 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const start = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
      const r = new MediaRecorder(s, type ? { mimeType: type } : undefined);
      const chunks = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      r.onstop = async () => {
        release();
        if (cancelled.current) return;
        const mime = (r.mimeType || type || 'audio/webm').split(';')[0];
        const blob = new Blob(chunks, { type: mime });
        if (blob.size < 1200) { setState('idle'); toast('Nothing heard — hold the mic a little longer', 'error'); return; }
        setState('busy');
        try {
          const key = await upload(new File([blob], `clip.${mime.includes('mp4') ? 'm4a' : 'webm'}`, { type: mime }), 'voice');
          const { text } = await api('assistant.transcribe', { key });
          if (text) onText(text); else toast('No words heard — try again closer to the mic', 'error');
        } catch (e) {
          toast(e.message, 'error');
        }
        setState('idle');
      };
      rec.current = r;
      r.start();
      setStream(s); setSecs(0); setState('rec');
    } catch (e) {
      release();
      setState('idle');
      toast(micError(e), 'error');
    }
  };
  const stop = () => { if (rec.current?.state === 'recording') rec.current.stop(); };

  if (!canRecord()) return <IconButton icon={MicOff} label="No microphone on this device" disabled className="!h-11 !w-11" />;
  if (state === 'rec') {
    return (
      <button type="button" aria-label="Stop and add the words" title="Stop" onPointerUp={() => { if (Date.now() - downAt.current > 400) stop(); }} onClick={stop}
        className="pressable flex h-11 shrink-0 items-center gap-2 rounded-full bg-red-soft pl-3 pr-2 text-red">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red" />
        <span className="flex h-5 w-8 items-center gap-[3px]" aria-hidden>
          {[0.5, 1, 0.7, 0.9].map((k, i) => <span key={i} className="w-[4px] rounded-full bg-red transition-[height] duration-75" style={{ height: `${Math.max(15, level * k * 100)}%` }} />)}
        </span>
        <span className="num text-footnote font-semibold">{clock(secs)}</span>
        <Square size={16} className="fill-current" />
      </button>
    );
  }
  return (
    <IconButton icon={Mic} label={state === 'busy' ? 'Turning speech into text…' : 'Dictate'} disabled={disabled || state === 'busy'}
      className={cx('!h-11 !w-11', state === 'busy' && 'animate-pulse')}
      onPointerDown={() => { downAt.current = Date.now(); if (state === 'idle') start(); }}
      onClick={(e) => { if (e.detail === 0 && state === 'idle') start(); }} />
  );
}

const STATE_LABEL = { connecting: 'Connecting…', listening: 'Listening', speaking: 'Speaking', thinking: 'Working on it…', muted: 'Muted', closed: 'Ended' };

// Captions arrive in pieces: a piece that extends the last line replaces it, otherwise it is added on
const merge = (prev, text) => (text.startsWith(prev) ? text : prev.endsWith(text) ? prev : `${prev} ${text}`.replace(/\s+/g, ' '));

/**
 * Hands-free conversation with Orb. Starts as soon as it is shown (from the Talk tap), saves the captions into the chat,
 * and calls onEnd(conversationId, note) when it finishes. Message renders a Done/Confirm message like the chat does.
 */
export function VoiceView({ conversationId, page, onConversation, onEnd, Message }) {
  const [phase, setPhase] = useState('connecting'); // connecting | live | ending | error
  const [ls, setLs] = useState('connecting');
  const [timeline, setTimeline] = useState([]); // { kind: 'line', role, text } | { kind: 'msg', message }
  const [interim, setInterim] = useState('');
  const [muted, setMuted] = useState(false);
  const [err, setErr] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const live = useRef(null);
  const cid = useRef(conversationId);
  const lines = useRef([]); // { role, text, at, saved, open }
  const lastHeard = useRef(Date.now());
  const started = useRef(Date.now());
  const maxMs = useRef(600000);
  const warned = useRef({});
  const ended = useRef(false);
  const end = useRef(null);
  const failed = useRef(false);
  const thinking = ls === 'listening' && lines.current.length > 0 && lines.current[lines.current.length - 1].role === 'user' && !lines.current[lines.current.length - 1].open;

  const show = () => setTimeline((t) => {
    const msgs = t.filter((x) => x.kind === 'msg');
    const all = [...lines.current.map((l) => ({ kind: 'line', role: l.role, text: l.text, at: l.at })), ...msgs];
    return all.sort((a, b) => a.at - b.at);
  });
  const flush = async (all = false) => {
    for (const l of lines.current) if (all) l.open = false;
    const todo = lines.current.filter((l) => !l.saved && !l.open);
    if (!todo.length || !cid.current) return;
    todo.forEach((l) => { l.saved = true; });
    await api('assistant.voiceSave', { conversation_id: cid.current, lines: todo.map(({ role, text, at }) => ({ role, text, at })) }).catch(() => { todo.forEach((l) => { l.saved = false; }); });
  };
  const say = (text) => { try { live.current?.sendText(text, { turnComplete: true }); } catch { /* closed */ } };

  const finish = async (m) => {
    if (ended.current) return;
    ended.current = true;
    setPhase('ending');
    await flush(true);
    if (cid.current) await api('assistant.voiceEnd', { conversation_id: cid.current, credits: m?.credits, seconds: Math.round((Date.now() - started.current) / 1000) }).catch(() => {});
    const r = String(m?.reason || '');
    const cut = failed.current || (/error|fail|budget|fund|limit|credit/i.test(r) && !/user|client|stop/i.test(r));
    onEnd(cid.current, cut ? 'The connection was lost. Carry on by typing, or tap Talk to start again.' : null);
  };
  const stop = () => { if (live.current) { try { live.current.stop(); } catch { finish(); } } else finish(); };

  useEffect(() => {
    let dead = false;
    (async () => {
      const [mod, r] = await Promise.all([import(/* @vite-ignore */ SDK), api('assistant.voiceSession', { conversation_id: conversationId || undefined, page })]);
      if (dead) return;
      cid.current = r.conversation_id;
      maxMs.current = r.max_ms || maxMs.current;
      onConversation?.(r.conversation_id, r.title);
      const Live = mod.Live || mod.default?.Live || window.OpenKBS?.Live;
      const l = new Live({ session: r.session });
      live.current = l;
      const heard = () => { lastHeard.current = Date.now(); };
      l.on('ready', () => {
        setPhase('live');
        started.current = Date.now();
        heard();
        // Carry on an existing chat: a few earlier lines as history, then one prompt so Orb greets briefly
        if (r.history?.length) {
          for (const h of r.history) l.sendText(h.text, { role: h.role === 'assistant' ? 'model' : 'user', turnComplete: false });
          l.sendText('(The manager has switched to voice in this chat. Greet them in a few words and carry on.)', { turnComplete: true });
        }
      });
      l.on('state', (s) => { setLs(s); if (s === 'speaking') heard(); });
      l.on('voice_activity', heard);
      l.on('transcript_interim', ({ text }) => { heard(); setInterim(text || ''); });
      l.on('transcript', ({ role, text }) => {
        if (!text?.trim()) return;
        heard();
        const who = role === 'user' ? 'user' : 'assistant';
        const last = lines.current[lines.current.length - 1];
        if (last && last.role === who && last.open) last.text = merge(last.text, text.trim());
        else {
          if (last) last.open = false;
          lines.current.push({ role: who, text: text.trim(), at: Date.now(), saved: false, open: true });
        }
        if (who === 'user') setInterim('');
        show();
      });
      l.on('turn_complete', () => {
        const last = lines.current[lines.current.length - 1];
        if (last) last.open = false;
        flush();
      });
      l.on('tool_done', ({ ui }) => {
        if (!ui?.message) return;
        setTimeline((t) => {
          const i = t.findIndex((x) => x.kind === 'msg' && x.message.id === ui.message.id);
          if (i >= 0) return t.map((x, j) => (j === i ? { ...x, message: ui.message } : x));
          return [...t, { kind: 'msg', message: ui.message, at: Date.now() }];
        });
      });
      l.on('error', (e) => { failed.current = true; setErr(e?.message || 'Voice error'); });
      l.on('closed', (m) => finish(m));
      await l.start();
    })().catch((e) => {
      if (dead) return;
      setErr(e?.status === 429 ? 'The voice limit for this month is reached. You can still type.' : e?.status === 403 ? e.message : micError(e));
      setPhase('error');
      ended.current = true; // stay on the error until they go back
      try { live.current?.stop(); } catch { /* not started */ }
    });
    const hide = () => { if (document.visibilityState === 'hidden') stop(); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', stop);
    return () => {
      dead = true;
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', stop);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Silence and length limits: Orb says goodbye first, then the conversation ends
  useEffect(() => {
    if (phase !== 'live') return undefined;
    const t = setInterval(() => {
      const now = Date.now();
      setElapsed(Math.floor((now - started.current) / 1000));
      const quiet = now - lastHeard.current;
      if (quiet > SILENCE_WARN_MS && !warned.current.quiet) { warned.current.quiet = true; say('(No one has spoken for two minutes. Say a very short goodbye: the conversation is ending. They can carry on by typing.)'); }
      if (quiet < SILENCE_WARN_MS) warned.current.quiet = false;
      if (quiet > SILENCE_END_MS) stop();
      if (now - started.current > maxMs.current - 30000 && !warned.current.long) { warned.current.long = true; say('(The ten-minute limit is nearly up. Say in one sentence that you will end in a moment and that they can carry on by typing or start a new talk.)'); }
      if (now - started.current > maxMs.current + 5000) stop();
    }, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [timeline, interim]);

  const mute = () => { const m = !muted; try { live.current?.setMuted(m); } catch { /* closed */ } setMuted(m); };
  // A tap on Confirm/Cancel on screen: tell Orb so it does not ask again
  const onCard = (m, action) => {
    say(`(The manager tapped ${action === 'assistant.confirm' ? 'Confirm' : 'Cancel'} on the card on screen.${m?.result ? ` Result: ${m.result}` : ''} Acknowledge in a few words.)`);
    setTimeline((t) => t.map((x) => (x.kind === 'msg' && x.message.id === m.id ? { ...x, message: m } : x)));
  };
  const onChange = (m) => setTimeline((t) => t.map((x) => (x.kind === 'msg' && x.message.id === m.id ? { ...x, message: m } : x)));

  const shown = muted ? 'muted' : phase === 'connecting' ? 'connecting' : thinking ? 'thinking' : ls;
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-col items-center gap-2 border-b border-line px-4 pb-4 pt-6">
        <div className="relative grid h-28 w-28 place-items-center">
          {shown === 'listening' && <span className="orb-voice-halo absolute inset-0 rounded-[34px] bg-blue" />}
          {(shown === 'connecting' || shown === 'thinking') && <span className="orb-voice-turn absolute -inset-1.5 rounded-full border-[3px] border-blue/20 border-t-blue" />}
          <OrbMark className={cx('relative h-24 w-24', shown === 'speaking' && 'orb-voice-speaking', shown === 'muted' && 'opacity-50 grayscale')} />
        </div>
        <div className="text-headline font-semibold" aria-live="polite">{phase === 'error' ? 'Voice unavailable' : phase === 'ending' ? 'Ending…' : STATE_LABEL[shown] || 'Listening'}</div>
        {phase === 'live' && <div className="num text-caption text-muted">{clock(elapsed)} · ends after 2 minutes of quiet or 10 minutes</div>}
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto overscroll-contain p-4">
        {phase === 'live' && !timeline.length && !interim && (
          <p className="mx-auto max-w-xs py-4 text-center text-subhead text-muted">Say what you need, like “Who can cover Saturday night at the Lantern Rooms?” You can interrupt Orb just by talking.</p>
        )}
        {timeline.map((x, i) => (x.kind === 'line'
          ? (
            <div key={`l${i}`} className={cx('flex', x.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cx('max-w-[90%] rounded-tile px-4 py-2 text-callout leading-relaxed', x.role === 'user' ? 'bg-blue text-white' : 'bg-bg')}>{x.text}</div>
            </div>
          )
          : <Message key={x.message.id} m={x.message} onChange={onChange} onCard={onCard} />))}
        {interim && <div className="flex justify-end"><div className="max-w-[90%] rounded-tile border border-dashed border-line px-4 py-2 text-callout text-muted">{interim}</div></div>}
        {err && <div className="rounded-tile bg-red-soft px-4 py-2.5 text-subhead text-red">{err}</div>}
        <div ref={end} />
      </div>

      <div className="flex shrink-0 items-center justify-center gap-3 border-t border-line p-3">
        {phase === 'error'
          ? <Button onClick={() => onEnd(cid.current, null)}>Back to typing</Button>
          : (
            <>
              <Button variant="secondary" icon={muted ? MicOff : Mic} disabled={phase !== 'live'} onClick={mute}>{muted ? 'Unmute' : 'Mute'}</Button>
              <Button variant="danger" icon={PhoneOff} busy={phase === 'ending'} onClick={stop}>End</Button>
            </>
          )}
      </div>
    </div>
  );
}
