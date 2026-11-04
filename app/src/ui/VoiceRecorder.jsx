// Voice messages in chat: the recorder (hold the mic, slide left to cancel, or tap to record hands-free) and the player.
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Pause, Play, Send, Trash2 } from 'lucide-react';
import { cx, IconButton, useToast } from './index.jsx';
import { canRecord } from './OrbVoice.jsx';

export const VOICE_MAX_S = 120;
const HOLD_MS = 400;
const CANCEL_PX = 80;
export const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const micError = (e) => (e?.name === 'NotAllowedError' || e?.name === 'SecurityError'
  ? 'The microphone is blocked. Allow it for this site in your browser settings, then try again.'
  : e?.name === 'NotFoundError' ? 'No microphone found on this device.' : e?.message || 'The microphone could not start.');

/**
 * Records one clip. onDone({ file, duration }) runs when it is kept; nothing is kept on cancel.
 * state: idle | rec. `held` is true while the finger is still down (then letting go sends).
 */
export function useRecorder({ onDone, max = VOICE_MAX_S }) {
  const toast = useToast();
  const [state, setState] = useState('idle');
  const [secs, setSecs] = useState(0);
  const [held, setHeld] = useState(false);
  const [slide, setSlide] = useState(0);
  const rec = useRef(null);
  const began = useRef(0);
  const keep = useRef(false);
  const done = useRef(onDone);
  done.current = onDone;

  const release = () => rec.current?.stream?.getTracks().forEach((t) => t.stop());
  useEffect(() => () => { keep.current = false; if (rec.current?.state === 'recording') rec.current.stop(); release(); }, []);
  useEffect(() => {
    if (state !== 'rec') return undefined;
    const t = setInterval(() => {
      const s = (Date.now() - began.current) / 1000;
      setSecs(s);
      if (s >= max) finish(true);
    }, 250);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const finish = (send) => {
    keep.current = send;
    setHeld(false); setSlide(0);
    if (rec.current?.state === 'recording') rec.current.stop();
  };

  const start = async () => {
    if (state !== 'idle') return;
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported?.(t)) || '';
      const r = new MediaRecorder(s, type ? { mimeType: type } : undefined);
      const chunks = [];
      r.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      r.onstop = () => {
        release();
        setState('idle');
        const duration = Math.min(max, Math.max(1, Math.round((Date.now() - began.current) / 1000)));
        if (!keep.current) return;
        const mime = (r.mimeType || type || 'audio/webm').split(';')[0];
        const blob = new Blob(chunks, { type: mime });
        if (blob.size < 1200 || Date.now() - began.current < 800) { toast('Too short — hold the mic while you talk', 'error'); return; }
        done.current({ file: new File([blob], `voice-message.${mime.includes('mp4') ? 'm4a' : 'webm'}`, { type: mime }), duration });
      };
      rec.current = r;
      keep.current = false;
      r.start(250);
      began.current = Date.now();
      setSecs(0); setState('rec');
    } catch (e) {
      release();
      setState('idle'); setHeld(false);
      toast(micError(e), 'error');
    }
  };

  // Press on the mic: let go after a hold to send, slide left to throw away, or a quick tap keeps recording until Send
  const press = (e) => {
    if (state !== 'idle' || !canRecord()) return;
    const x0 = e.clientX;
    const t0 = Date.now();
    setHeld(true);
    start();
    const move = (ev) => setSlide(Math.min(0, ev.clientX - x0));
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (Date.now() - t0 < HOLD_MS) { setHeld(false); setSlide(0); return; }
      finish(ev.type === 'pointerup' && ev.clientX - x0 > -CANCEL_PX);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  return { state, secs, held, slide, press, send: () => finish(true), cancel: () => finish(false), supported: canRecord() };
}

/** Replaces the typing box while recording. */
export function RecordingBar({ r }) {
  const gone = r.slide <= -CANCEL_PX;
  return (
    <div className="flex items-center gap-2 border-t border-line p-3" style={{ minHeight: 68 }}>
      {!r.held && <IconButton icon={Trash2} label="Throw away this recording" className="!h-11 !w-11 text-red" onClick={r.cancel} />}
      <div className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl bg-red-soft px-4 py-2.5 text-red" style={{ transform: `translateX(${r.slide / 2}px)` }}>
        <span className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-red" />
        <span className="num text-callout font-semibold">{clock(r.secs)}</span>
        <span className="min-w-0 flex-1 truncate text-footnote">
          {r.held ? (gone ? 'Let go to throw away' : '‹ Slide to cancel · let go to send') : `Recording · up to ${VOICE_MAX_S / 60} minutes`}
        </span>
      </div>
      {!r.held && <IconButton icon={Send} label="Send voice message" tone="primary" className="!h-11 !w-11" onClick={r.send} />}
    </div>
  );
}

/** A voice message bubble: play/pause, progress, length, and the written version underneath. */
export function VoiceNote({ a, mine, transcript, status }) {
  const audio = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [pos, setPos] = useState(0);
  const [len, setLen] = useState(a.duration || 0);
  const [open, setOpen] = useState(false);
  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {}); else el.pause();
  };
  const seek = (e) => {
    const el = audio.current;
    const box = e.currentTarget.getBoundingClientRect();
    if (!el || !len) return;
    el.currentTime = Math.max(0, Math.min(len, ((e.clientX - box.left) / box.width) * len));
  };
  const working = ['pending', 'working', 'retry'].includes(status);
  return (
    <div className={cx('w-64 max-w-full rounded-[20px] px-3 py-2', mine ? 'bg-blue text-white' : 'bg-fill text-ink')}>
      <audio ref={audio} src={a.url} preload="metadata"
        onLoadedMetadata={(e) => { if (Number.isFinite(e.target.duration)) setLen(e.target.duration); }}
        onTimeUpdate={(e) => setPos(e.target.currentTime)} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setPos(0); }} />
      <div className="flex items-center gap-3">
        <button type="button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play voice message'}
          className={cx('pressable grid h-9 w-9 shrink-0 place-items-center rounded-full', mine ? 'bg-white/20' : 'bg-surface text-blue')}>
          {playing ? <Pause size={16} className="fill-current" /> : <Play size={16} className="translate-x-px fill-current" />}
        </button>
        <div role="slider" aria-label="Position" aria-valuemin={0} aria-valuemax={Math.round(len)} aria-valuenow={Math.round(pos)} tabIndex={-1}
          onClick={seek} className="relative h-6 min-w-0 flex-1 cursor-pointer">
          <div className={cx('absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full', mine ? 'bg-white/30' : 'bg-line')} />
          <div className={cx('absolute left-0 top-1/2 h-1 -translate-y-1/2 rounded-full', mine ? 'bg-white' : 'bg-blue')} style={{ width: `${len ? (pos / len) * 100 : 0}%` }} />
        </div>
        <span className={cx('num shrink-0 text-caption', mine ? 'text-white/80' : 'text-muted')}>{clock(playing || pos ? pos : len)}</span>
      </div>
      {(transcript || working) && (
        <button type="button" disabled={!transcript} onClick={() => setOpen((o) => !o)}
          className={cx('mt-1 flex w-full items-center gap-1 text-left text-caption font-semibold', mine ? 'text-white/80' : 'text-muted')}>
          {transcript ? <>{open ? 'Hide' : 'Show'} transcript<ChevronDown size={14} className={cx('transition-transform', open && 'rotate-180')} /></> : 'Writing it out…'}
        </button>
      )}
      {open && transcript && <p className={cx('mt-1 whitespace-pre-wrap text-footnote leading-snug', mine ? 'text-white' : 'text-ink')}>{transcript}</p>}
    </div>
  );
}
